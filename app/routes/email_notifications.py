from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from app.models.user import User
from app.models.email_config import (
    EmailConfig, EmailConfigCreate, EmailConfigUpdate, 
    EmailLog, EmailTestRequest
)
from app.auth.auth_handler import get_current_active_user, verify_workspace_access, verify_workspace_admin
from app.services.email_notification_service import email_notification_service
from app.database import get_database
from bson import ObjectId
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/configs/workspace/{workspace_id}", response_model=List[EmailConfig])
async def get_workspace_email_configs(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get email configurations for a workspace"""
    if not await verify_workspace_access(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace"
        )
    
    db = get_database()
    cursor = db.email_configs.find({"workspace_id": workspace_id})
    configs = []
    
    async for config in cursor:
        config["_id"] = str(config["_id"])
        configs.append(EmailConfig(**config))
    
    return configs

@router.post("/configs", response_model=EmailConfig)
async def create_email_config(
    config_data: EmailConfigCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create new email configuration (admin only)"""
    if not await verify_workspace_admin(current_user, config_data.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can configure email notifications"
        )
    
    db = get_database()
    
    # Check if configuration already exists for this workspace
    existing_config = await db.email_configs.find_one({
        "workspace_id": config_data.workspace_id
    })
    
    if existing_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email configuration already exists for this workspace. Use update instead."
        )
    
    # Validate email configuration
    if config_data.send_frequency_minutes < 1 or config_data.send_frequency_minutes > 60:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Send frequency must be between 1 and 60 minutes"
        )
    
    config_dict = config_data.dict()
    config_dict["created_at"] = datetime.utcnow()
    config_dict["updated_at"] = datetime.utcnow()
    config_dict["total_emails_sent"] = 0
    
    result = await db.email_configs.insert_one(config_dict)
    config_dict["_id"] = str(result.inserted_id)
    
    return EmailConfig(**config_dict)

@router.put("/configs/{config_id}", response_model=EmailConfig)
async def update_email_config(
    config_id: str,
    update_data: EmailConfigUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Update email configuration (admin only)"""
    db = get_database()
    config = await db.email_configs.find_one({"_id": ObjectId(config_id)})
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email configuration not found"
        )
    
    workspace_id = str(config["workspace_id"])
    if not await verify_workspace_admin(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can update email configurations"
        )
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    # Validate frequency if being updated
    if "send_frequency_minutes" in update_dict:
        if update_dict["send_frequency_minutes"] < 1 or update_dict["send_frequency_minutes"] > 60:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Send frequency must be between 1 and 60 minutes"
            )
    
    await db.email_configs.update_one(
        {"_id": ObjectId(config_id)},
        {"$set": update_dict}
    )
    
    # Get updated config
    updated_config = await db.email_configs.find_one({"_id": ObjectId(config_id)})
    updated_config["_id"] = str(updated_config["_id"])
    
    return EmailConfig(**updated_config)

@router.delete("/configs/{config_id}")
async def delete_email_config(
    config_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Delete email configuration (admin only)"""
    db = get_database()
    config = await db.email_configs.find_one({"_id": ObjectId(config_id)})
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email configuration not found"
        )
    
    workspace_id = str(config["workspace_id"])
    if not await verify_workspace_admin(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can delete email configurations"
        )
    
    # Delete configuration and related logs
    await db.email_configs.delete_one({"_id": ObjectId(config_id)})
    await db.email_logs.delete_many({"email_config_id": config_id})
    
    return {"message": "Email configuration deleted successfully"}

@router.post("/test")
async def test_email_configuration(
    test_request: EmailTestRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Test email configuration by sending a test email"""
    if not await verify_workspace_admin(current_user, test_request.workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can test email configurations"
        )
    
    try:
        # Get workspace details
        db = get_database()
        workspace = await db.workspaces.find_one({"_id": ObjectId(test_request.workspace_id)})
        
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found"
            )
        
        workspace_name = workspace["name"]
        
        # Send test email
        success = await email_notification_service.test_email_configuration(
            test_request.email_address, 
            workspace_name
        )
        
        if success:
            return {
                "success": True,
                "message": f"Test email sent successfully to {test_request.email_address}",
                "workspace_name": workspace_name
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send test email"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email test failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Email test failed: {str(e)}"
        )

@router.get("/logs/workspace/{workspace_id}", response_model=List[EmailLog])
async def get_workspace_email_logs(
    workspace_id: str,
    limit: int = Query(20, description="Number of logs to return", ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get email logs for a workspace"""
    if not await verify_workspace_access(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace"
        )
    
    db = get_database()
    cursor = db.email_logs.find({"workspace_id": workspace_id}).sort("sent_at", -1).limit(limit)
    
    logs = []
    async for log in cursor:
        log["_id"] = str(log["_id"])
        logs.append(EmailLog(**log))
    
    return logs

@router.get("/statistics/workspace/{workspace_id}")
async def get_email_statistics(
    workspace_id: str,
    days: int = Query(7, description="Number of days to include in statistics", ge=1, le=30),
    current_user: User = Depends(get_current_active_user)
):
    """Get email notification statistics for a workspace"""
    if not await verify_workspace_access(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace"
        )
    
    try:
        stats = await email_notification_service.get_email_statistics(workspace_id, days)
        return {
            "workspace_id": workspace_id,
            "statistics": stats,
            "period_days": days
        }
        
    except Exception as e:
        logger.error(f"Failed to get email statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve email statistics"
        )

@router.post("/trigger-manual/{workspace_id}")
async def trigger_manual_notification(
    workspace_id: str,
    hours: int = Query(1, description="Number of hours to include in report", ge=1, le=24),
    current_user: User = Depends(get_current_active_user)
):
    """Manually trigger email notification for a workspace"""
    if not await verify_workspace_admin(current_user, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace administrators can trigger manual notifications"
        )
    
    try:
        db = get_database()
        
        # Get email configuration for workspace
        config = await db.email_configs.find_one({
            "workspace_id": workspace_id,
            "status": "active"
        })
        
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active email configuration found for this workspace"
            )
        
        # Temporarily override last_email_sent to get messages from specified hours
        original_last_sent = config.get("last_email_sent")
        config["last_email_sent"] = datetime.utcnow() - timedelta(hours=hours)
        
        # Send notification
        result = await email_notification_service._send_workspace_notification(config)
        
        return {
            "success": result["success"],
            "message": f"Manual notification processed for workspace",
            "message_count": result["message_count"],
            "reason": result["reason"],
            "hours_included": hours
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual notification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger manual notification"
        )

@router.get("/system/status")
async def get_notification_system_status(
    current_user: User = Depends(get_current_active_user)
):
    """Get status of email notification system"""
    try:
        db = get_database()
        
        # Get total configurations
        total_configs = await db.email_configs.count_documents({})
        active_configs = await db.email_configs.count_documents({"status": "active"})
        
        # Get recent activity
        recent_logs = await db.email_logs.find({
            "sent_at": {"$gte": datetime.utcnow() - timedelta(hours=24)}
        }).sort("sent_at", -1).limit(10).to_list(None)
        
        # SMTP configuration status
        smtp_configured = all([
            settings.smtp_server,
            settings.smtp_port,
            settings.smtp_username,
            settings.smtp_password
        ])
        
        return {
            "system_status": "healthy" if smtp_configured else "configuration_incomplete",
            "total_configurations": total_configs,
            "active_configurations": active_configs,
            "smtp_configured": smtp_configured,
            "recent_activity": [
                {
                    "workspace_id": log["workspace_id"],
                    "recipient": log["recipient_email"],
                    "message_count": log["message_count"],
                    "sent_at": log["sent_at"].isoformat(),
                    "status": log["status"]
                }
                for log in recent_logs
            ],
            "last_check": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to get system status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get system status"
        )