from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from typing import List, Optional
from app.models.user import User
from app.models.message_blast import (
    MessageBlast, MessageBlastCreate, MessageBlastUpdate, BlastProgress, 
    BlastTarget, BlastStatus, MessageStatus
)
from app.auth.auth_handler import get_current_active_user, verify_workspace_access, verify_workspace_admin
from app.services.message_blast_service import message_blast_service
from app.services.blast_scheduler_service import blast_scheduler_service
from datetime import datetime
import logging
import tempfile
import os

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/workspace/{workspace_id}", response_model=List[MessageBlast])
async def get_workspace_blasts(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get all message blasts for a workspace"""
    if not await verify_workspace_access(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace"
        )
    
    return await message_blast_service.get_workspace_blasts(workspace_id)

@router.post("/", response_model=MessageBlast)
async def create_blast(
    workspace_id: str = Form(...),
    title: str = Form(...),
    message_content: str = Form(...),
    sender_phone_id: str = Form(...),
    batch_size: int = Form(5),
    batch_interval_minutes: int = Form(2),
    start_time: str = Form(...),  # ISO format datetime string
    end_time: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    """Create new message blast with Excel upload"""
    # Only workspace admins can create blasts
    if not await verify_workspace_admin(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can create message blasts"
        )
    
    try:
        # Validate file type
        if not file.filename.lower().endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=400,
                detail="File must be an Excel file (.xlsx or .xls)"
            )
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        try:
            # Extract phone numbers from Excel
            phone_numbers = await message_blast_service.upload_phone_numbers_from_excel(
                temp_file_path, file.filename
            )
            
            if not phone_numbers:
                raise HTTPException(
                    status_code=400,
                    detail="No valid phone numbers found in Excel file"
                )
            
            # Parse datetime strings
            start_datetime = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end_datetime = None
            if end_time:
                end_datetime = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            
            # Create blast
            blast_create = MessageBlastCreate(
                workspace_id=workspace_id,
                title=title.strip(),
                message_content=message_content.strip(),
                sender_phone_id=sender_phone_id,
                batch_size=max(1, min(50, batch_size)),
                batch_interval_minutes=max(1, min(30, batch_interval_minutes)),
                start_time=start_datetime,
                end_time=end_datetime,
                phone_numbers=phone_numbers
            )
            
            blast = await message_blast_service.create_blast(blast_create, current_user.id)
            
            # Schedule the blast if start time is in the future
            if start_datetime > datetime.utcnow():
                await blast_scheduler_service.schedule_blast(blast.id, start_datetime)
                
                # Update status to scheduled
                from app.database import get_database
                db = get_database()
                await db.message_blasts.update_one(
                    {"_id": ObjectId(blast.id)},
                    {"$set": {"status": BlastStatus.SCHEDULED}}
                )
            else:
                # Start immediately
                await message_blast_service.start_blast(blast.id)
            
            return blast
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create message blast: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create message blast"
        )

@router.get("/{blast_id}", response_model=MessageBlast)
async def get_blast(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get message blast by ID"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_access(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to blast"
        )
    
    return blast

@router.put("/{blast_id}", response_model=MessageBlast)
async def update_blast(
    blast_id: str,
    update_data: MessageBlastUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Update message blast (only draft/scheduled blasts)"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_admin(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can update message blasts"
        )
    
    try:
        updated_blast = await message_blast_service.update_blast(blast_id, update_data)
        if not updated_blast:
            raise HTTPException(
                status_code=400,
                detail="Cannot update blast in current status"
            )
        
        return updated_blast
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{blast_id}")
async def delete_blast(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Delete message blast"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_admin(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can delete message blasts"
        )
    
    try:
        success = await message_blast_service.delete_blast(blast_id)
        if not success:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete blast in current status"
            )
        
        return {"message": "Message blast deleted successfully"}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{blast_id}/progress", response_model=BlastProgress)
async def get_blast_progress(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get progress information for a blast"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_access(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to blast"
        )
    
    return await message_blast_service.get_blast_progress(blast_id)

@router.get("/{blast_id}/targets", response_model=List[BlastTarget])
async def get_blast_targets(
    blast_id: str,
    target_status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user)
):
    """Get targets for a blast with optional status filter"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_access(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to blast"
        )
    
    return await message_blast_service.get_blast_targets(blast_id, target_status)

@router.post("/{blast_id}/start")
async def start_blast(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Start a scheduled blast immediately"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_admin(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can start message blasts"
        )
    
    try:
        success = await message_blast_service.start_blast(blast_id)
        if not success:
            raise HTTPException(
                status_code=400,
                detail="Cannot start blast in current status"
            )
        
        return {"message": "Message blast started successfully"}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{blast_id}/pause")
async def pause_blast(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Pause an active blast"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_admin(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can pause message blasts"
        )
    
    success = await message_blast_service.pause_blast(blast_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot pause blast in current status"
        )
    
    return {"message": "Message blast paused successfully"}

@router.post("/{blast_id}/resume")
async def resume_blast(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Resume a paused blast"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_admin(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can resume message blasts"
        )
    
    success = await message_blast_service.resume_blast(blast_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot resume blast in current status"
        )
    
    return {"message": "Message blast resumed successfully"}

@router.post("/{blast_id}/cancel")
async def cancel_blast(
    blast_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Cancel an active or scheduled blast"""
    blast = await message_blast_service.get_blast_by_id(blast_id)
    if not blast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message blast not found"
        )
    
    if not await verify_workspace_admin(current_user, blast.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can cancel message blasts"
        )
    
    success = await message_blast_service.cancel_blast(blast_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel blast in current status"
        )
    
    return {"message": "Message blast cancelled successfully"}

@router.post("/upload-preview")
async def preview_phone_numbers(
    workspace_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    """Preview phone numbers from uploaded Excel file"""
    if not await verify_workspace_admin(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can upload phone lists"
        )
    
    try:
        # Validate file type
        if not file.filename.lower().endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=400,
                detail="File must be an Excel file (.xlsx or .xls)"
            )
        
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        try:
            # Extract phone numbers
            phone_numbers = await message_blast_service.upload_phone_numbers_from_excel(
                temp_file_path, file.filename
            )
            
            return {
                "total_numbers": len(phone_numbers),
                "preview": phone_numbers[:10],  # Show first 10 for preview
                "valid": True,
                "message": f"Found {len(phone_numbers)} valid phone numbers"
            }
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    
    except Exception as e:
        logger.error(f"Phone number preview failed: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process Excel file: {str(e)}"
        )

@router.get("/workspace/{workspace_id}/statistics")
async def get_blast_statistics(
    workspace_id: str,
    days: int = Query(30, description="Number of days to include in statistics"),
    current_user: User = Depends(get_current_active_user)
):
    """Get message blast statistics for workspace"""
    if not await verify_workspace_access(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace"
        )
    
    try:
        from app.database import get_database
        from bson import ObjectId
        
        db = get_database()
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Get blast statistics
        pipeline = [
            {
                "$match": {
                    "workspace_id": ObjectId(workspace_id),
                    "created_at": {"$gte": cutoff_date}
                }
            },
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1},
                    "total_sent": {"$sum": "$sent_count"},
                    "total_failed": {"$sum": "$failed_count"}
                }
            }
        ]
        
        stats = {
            "total_blasts": 0,
            "active_blasts": 0,
            "completed_blasts": 0,
            "total_messages_sent": 0,
            "total_messages_failed": 0,
            "success_rate": 0.0
        }
        
        async for result in db.message_blasts.aggregate(pipeline):
            blast_status = result["_id"]
            count = result["count"]
            
            stats["total_blasts"] += count
            stats["total_messages_sent"] += result.get("total_sent", 0)
            stats["total_messages_failed"] += result.get("total_failed", 0)
            
            if blast_status == BlastStatus.ACTIVE:
                stats["active_blasts"] = count
            elif blast_status == BlastStatus.COMPLETED:
                stats["completed_blasts"] = count
        
        # Calculate success rate
        total_messages = stats["total_messages_sent"] + stats["total_messages_failed"]
        if total_messages > 0:
            stats["success_rate"] = round((stats["total_messages_sent"] / total_messages) * 100, 2)
        
        return {
            "workspace_id": workspace_id,
            "period_days": days,
            "statistics": stats
        }
        
    except Exception as e:
        logger.error(f"Failed to get blast statistics: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve statistics"
        )