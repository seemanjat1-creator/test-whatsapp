import pandas as pd
import os
import tempfile
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from app.models.message_blast import (
    MessageBlast, MessageBlastCreate, MessageBlastUpdate, BlastTarget, 
    BlastTargetCreate, BlastStatus, MessageStatus, BlastProgress
)
from app.database import get_database
from app.services.whatsapp_service import whatsapp_service
from bson import ObjectId
import logging
import asyncio
import re

logger = logging.getLogger(__name__)

class MessageBlastService:
    def __init__(self):
        self.max_phone_numbers = 1000
        self.min_batch_interval = 1  # minutes
        self.max_batch_interval = 30  # minutes
        self.max_batch_size = 50
        self.min_batch_size = 1
    
    async def create_blast(self, blast_data: MessageBlastCreate, created_by: str) -> MessageBlast:
        """Create new message blast"""
        try:
            # Validate phone numbers
            if len(blast_data.phone_numbers) > self.max_phone_numbers:
                raise ValueError(f"Maximum {self.max_phone_numbers} phone numbers allowed")
            
            if len(blast_data.phone_numbers) == 0:
                raise ValueError("At least one phone number is required")
            
            # Validate batch settings
            if not (self.min_batch_size <= blast_data.batch_size <= self.max_batch_size):
                raise ValueError(f"Batch size must be between {self.min_batch_size} and {self.max_batch_size}")
            
            if not (self.min_batch_interval <= blast_data.batch_interval_minutes <= self.max_batch_interval):
                raise ValueError(f"Batch interval must be between {self.min_batch_interval} and {self.max_batch_interval} minutes")
            
            # Validate sender phone
            await self._validate_sender_phone(blast_data.sender_phone_id, blast_data.workspace_id)
            
            # Clean and validate phone numbers
            cleaned_numbers = await self._clean_phone_numbers(blast_data.phone_numbers)
            
            db = get_database()
            
            # Create blast record
            blast_dict = blast_data.dict()
            blast_dict["workspace_id"] = ObjectId(blast_data.workspace_id)
            blast_dict["created_by"] = created_by
            blast_dict["created_at"] = datetime.utcnow()
            blast_dict["updated_at"] = datetime.utcnow()
            blast_dict["target_count"] = len(cleaned_numbers)
            blast_dict["sent_count"] = 0
            blast_dict["failed_count"] = 0
            blast_dict["delivered_count"] = 0
            
            # Remove phone_numbers from blast record (stored separately)
            del blast_dict["phone_numbers"]
            
            result = await db.message_blasts.insert_one(blast_dict)
            blast_id = str(result.inserted_id)
            
            # Create target records
            await self._create_blast_targets(blast_id, cleaned_numbers)
            
            # Prepare response
            blast_dict["_id"] = blast_id
            blast_dict["workspace_id"] = blast_data.workspace_id
            
            logger.info(f"Message blast created: {blast_id} with {len(cleaned_numbers)} targets")
            return MessageBlast(**blast_dict)
            
        except Exception as e:
            logger.error(f"Failed to create message blast: {e}")
            raise
    
    async def upload_phone_numbers_from_excel(self, file_path: str, filename: str) -> List[str]:
        """Extract phone numbers from uploaded Excel file"""
        try:
            logger.info(f"Processing Excel file for phone numbers: {filename}")
            
            # Read Excel file
            if filename.lower().endswith('.xlsx'):
                df = pd.read_excel(file_path, engine='openpyxl')
            elif filename.lower().endswith('.xls'):
                df = pd.read_excel(file_path, engine='xlrd')
            else:
                raise ValueError("File must be .xlsx or .xls format")
            
            phone_numbers = []
            
            # Look for phone number columns
            phone_columns = []
            for col in df.columns:
                col_lower = str(col).lower()
                if any(keyword in col_lower for keyword in ['phone', 'mobile', 'number', 'contact']):
                    phone_columns.append(col)
            
            if not phone_columns:
                # If no obvious phone column, use first column
                phone_columns = [df.columns[0]]
            
            # Extract phone numbers from identified columns
            for col in phone_columns:
                for value in df[col].dropna():
                    phone_str = str(value).strip()
                    if phone_str and self._is_valid_phone_format(phone_str):
                        cleaned_phone = self._clean_phone_number(phone_str)
                        if cleaned_phone and cleaned_phone not in phone_numbers:
                            phone_numbers.append(cleaned_phone)
            
            if len(phone_numbers) > self.max_phone_numbers:
                raise ValueError(f"Too many phone numbers. Maximum {self.max_phone_numbers} allowed")
            
            logger.info(f"Extracted {len(phone_numbers)} valid phone numbers from Excel")
            return phone_numbers
            
        except Exception as e:
            logger.error(f"Failed to process Excel file: {e}")
            raise
    
    async def get_workspace_blasts(self, workspace_id: str) -> List[MessageBlast]:
        """Get all message blasts for a workspace"""
        db = get_database()
        cursor = db.message_blasts.find({"workspace_id": ObjectId(workspace_id)}).sort("created_at", -1)
        
        blasts = []
        async for blast in cursor:
            blast["_id"] = str(blast["_id"])
            blast["workspace_id"] = workspace_id
            blasts.append(MessageBlast(**blast))
        
        return blasts
    
    async def get_blast_by_id(self, blast_id: str) -> Optional[MessageBlast]:
        """Get message blast by ID"""
        db = get_database()
        blast_data = await db.message_blasts.find_one({"_id": ObjectId(blast_id)})
        
        if not blast_data:
            return None
        
        blast_data["_id"] = str(blast_data["_id"])
        blast_data["workspace_id"] = str(blast_data["workspace_id"])
        
        return MessageBlast(**blast_data)
    
    async def update_blast(self, blast_id: str, update_data: MessageBlastUpdate) -> Optional[MessageBlast]:
        """Update message blast"""
        db = get_database()
        
        # Only allow updates for draft or scheduled blasts
        blast = await self.get_blast_by_id(blast_id)
        if not blast or blast.status not in [BlastStatus.DRAFT, BlastStatus.SCHEDULED]:
            raise ValueError("Can only update draft or scheduled blasts")
        
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await db.message_blasts.update_one(
            {"_id": ObjectId(blast_id)},
            {"$set": update_dict}
        )
        
        if result.modified_count == 0:
            return None
        
        return await self.get_blast_by_id(blast_id)
    
    async def delete_blast(self, blast_id: str) -> bool:
        """Delete message blast and its targets"""
        db = get_database()
        
        # Only allow deletion of draft, completed, or failed blasts
        blast = await self.get_blast_by_id(blast_id)
        if not blast or blast.status in [BlastStatus.ACTIVE, BlastStatus.SCHEDULED]:
            raise ValueError("Cannot delete active or scheduled blasts")
        
        # Delete targets first
        await db.blast_targets.delete_many({"blast_id": blast_id})
        
        # Delete blast
        result = await db.message_blasts.delete_one({"_id": ObjectId(blast_id)})
        
        return result.deleted_count > 0
    
    async def get_blast_progress(self, blast_id: str) -> BlastProgress:
        """Get progress information for a blast"""
        db = get_database()
        
        # Get blast details
        blast = await self.get_blast_by_id(blast_id)
        if not blast:
            raise ValueError("Blast not found")
        
        # Get target statistics
        pipeline = [
            {"$match": {"blast_id": blast_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        status_counts = {}
        async for result in db.blast_targets.aggregate(pipeline):
            status_counts[result["_id"]] = result["count"]
        
        total_targets = sum(status_counts.values())
        pending_count = status_counts.get(MessageStatus.PENDING, 0)
        sent_count = status_counts.get(MessageStatus.SENT, 0)
        failed_count = status_counts.get(MessageStatus.FAILED, 0)
        delivered_count = status_counts.get(MessageStatus.DELIVERED, 0)
        
        # Calculate progress
        progress_percentage = ((sent_count + failed_count + delivered_count) / total_targets * 100) if total_targets > 0 else 0
        
        # Calculate batches
        total_batches = (total_targets + blast.batch_size - 1) // blast.batch_size
        current_batch = ((sent_count + failed_count + delivered_count) // blast.batch_size) + 1
        
        # Estimate completion time
        estimated_completion = None
        if blast.status == BlastStatus.ACTIVE and pending_count > 0:
            remaining_batches = (pending_count + blast.batch_size - 1) // blast.batch_size
            estimated_minutes = remaining_batches * blast.batch_interval_minutes
            estimated_completion = datetime.utcnow() + timedelta(minutes=estimated_minutes)
        
        # Get last sent time
        last_target = await db.blast_targets.find_one(
            {"blast_id": blast_id, "status": {"$in": [MessageStatus.SENT, MessageStatus.DELIVERED]}},
            sort=[("sent_at", -1)]
        )
        last_sent_at = last_target.get("sent_at") if last_target else None
        
        return BlastProgress(
            blast_id=blast_id,
            total_targets=total_targets,
            pending_count=pending_count,
            sent_count=sent_count,
            failed_count=failed_count,
            delivered_count=delivered_count,
            current_batch=min(current_batch, total_batches),
            total_batches=total_batches,
            progress_percentage=round(progress_percentage, 2),
            estimated_completion=estimated_completion,
            last_sent_at=last_sent_at
        )
    
    async def start_blast(self, blast_id: str) -> bool:
        """Start executing a message blast"""
        try:
            blast = await self.get_blast_by_id(blast_id)
            if not blast:
                raise ValueError("Blast not found")
            
            if blast.status != BlastStatus.SCHEDULED:
                raise ValueError("Can only start scheduled blasts")
            
            # Update status to active
            db = get_database()
            await db.message_blasts.update_one(
                {"_id": ObjectId(blast_id)},
                {"$set": {
                    "status": BlastStatus.ACTIVE,
                    "updated_at": datetime.utcnow()
                }}
            )
            
            # Start processing in background
            asyncio.create_task(self._process_blast_batches(blast_id))
            
            logger.info(f"Message blast {blast_id} started")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start blast {blast_id}: {e}")
            raise
    
    async def pause_blast(self, blast_id: str) -> bool:
        """Pause an active blast"""
        db = get_database()
        
        result = await db.message_blasts.update_one(
            {"_id": ObjectId(blast_id), "status": BlastStatus.ACTIVE},
            {"$set": {
                "status": BlastStatus.PAUSED,
                "updated_at": datetime.utcnow()
            }}
        )
        
        return result.modified_count > 0
    
    async def resume_blast(self, blast_id: str) -> bool:
        """Resume a paused blast"""
        db = get_database()
        
        result = await db.message_blasts.update_one(
            {"_id": ObjectId(blast_id), "status": BlastStatus.PAUSED},
            {"$set": {
                "status": BlastStatus.ACTIVE,
                "updated_at": datetime.utcnow()
            }}
        )
        
        if result.modified_count > 0:
            # Resume processing
            asyncio.create_task(self._process_blast_batches(blast_id))
            return True
        
        return False
    
    async def cancel_blast(self, blast_id: str) -> bool:
        """Cancel an active or scheduled blast"""
        db = get_database()
        
        result = await db.message_blasts.update_one(
            {"_id": ObjectId(blast_id), "status": {"$in": [BlastStatus.ACTIVE, BlastStatus.SCHEDULED, BlastStatus.PAUSED]}},
            {"$set": {
                "status": BlastStatus.CANCELLED,
                "updated_at": datetime.utcnow(),
                "completed_at": datetime.utcnow()
            }}
        )
        
        return result.modified_count > 0
    
    async def _process_blast_batches(self, blast_id: str):
        """Process blast in batches (background task)"""
        try:
            logger.info(f"Starting batch processing for blast {blast_id}")
            
            while True:
                blast = await self.get_blast_by_id(blast_id)
                if not blast or blast.status != BlastStatus.ACTIVE:
                    logger.info(f"Blast {blast_id} is no longer active, stopping processing")
                    break
                
                # Get next batch of pending targets
                db = get_database()
                targets = await db.blast_targets.find({
                    "blast_id": blast_id,
                    "status": MessageStatus.PENDING
                }).limit(blast.batch_size).to_list(None)
                
                if not targets:
                    # No more targets, mark blast as completed
                    await self._complete_blast(blast_id)
                    break
                
                # Send messages to this batch
                await self._send_batch_messages(blast_id, targets, blast)
                
                # Wait for next batch interval
                if len(targets) == blast.batch_size:  # Only wait if we sent a full batch
                    logger.info(f"Waiting {blast.batch_interval_minutes} minutes before next batch")
                    await asyncio.sleep(blast.batch_interval_minutes * 60)
                
        except Exception as e:
            logger.error(f"Batch processing failed for blast {blast_id}: {e}")
            await self._mark_blast_failed(blast_id, str(e))
    
    async def _send_batch_messages(self, blast_id: str, targets: List[Dict], blast: MessageBlast):
        """Send messages to a batch of targets"""
        try:
            db = get_database()
            
            # Get sender phone details
            sender_phone = await db.phone_numbers.find_one({"_id": ObjectId(blast.sender_phone_id)})
            if not sender_phone:
                raise ValueError("Sender phone not found")
            
            sender_number = sender_phone["phone_number"]
            
            logger.info(f"Sending batch of {len(targets)} messages for blast {blast_id}")
            
            for target in targets:
                try:
                    # Update target status to processing
                    await db.blast_targets.update_one(
                        {"_id": target["_id"]},
                        {"$set": {
                            "status": MessageStatus.PENDING,
                            "updated_at": datetime.utcnow()
                        }}
                    )
                    
                    # Send message via WhatsApp
                    success = await whatsapp_service.send_message(
                        phone_number=sender_number,
                        to_phone=target["phone_number"],
                        message=blast.message_content,
                        message_type="text"
                    )
                    
                    if success:
                        # Update target as sent
                        await db.blast_targets.update_one(
                            {"_id": target["_id"]},
                            {"$set": {
                                "status": MessageStatus.SENT,
                                "sent_at": datetime.utcnow(),
                                "updated_at": datetime.utcnow()
                            }}
                        )
                        
                        # Update blast sent count
                        await db.message_blasts.update_one(
                            {"_id": ObjectId(blast_id)},
                            {"$inc": {"sent_count": 1}}
                        )
                        
                        logger.info(f"Message sent successfully to {target['phone_number']}")
                    else:
                        # Mark as failed
                        await db.blast_targets.update_one(
                            {"_id": target["_id"]},
                            {"$set": {
                                "status": MessageStatus.FAILED,
                                "error_message": "Failed to send via WhatsApp",
                                "updated_at": datetime.utcnow()
                            }}
                        )
                        
                        # Update blast failed count
                        await db.message_blasts.update_one(
                            {"_id": ObjectId(blast_id)},
                            {"$inc": {"failed_count": 1}}
                        )
                        
                        logger.warning(f"Failed to send message to {target['phone_number']}")
                    
                    # Small delay between individual messages
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"Error sending to {target['phone_number']}: {e}")
                    
                    # Mark target as failed
                    await db.blast_targets.update_one(
                        {"_id": target["_id"]},
                        {"$set": {
                            "status": MessageStatus.FAILED,
                            "error_message": str(e),
                            "updated_at": datetime.utcnow()
                        }}
                    )
                    
                    # Update blast failed count
                    await db.message_blasts.update_one(
                        {"_id": ObjectId(blast_id)},
                        {"$inc": {"failed_count": 1}}
                    )
            
        except Exception as e:
            logger.error(f"Batch sending failed for blast {blast_id}: {e}")
            raise
    
    async def _complete_blast(self, blast_id: str):
        """Mark blast as completed"""
        db = get_database()
        
        await db.message_blasts.update_one(
            {"_id": ObjectId(blast_id)},
            {"$set": {
                "status": BlastStatus.COMPLETED,
                "completed_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )
        
        logger.info(f"Message blast {blast_id} completed")
    
    async def _mark_blast_failed(self, blast_id: str, error: str):
        """Mark blast as failed"""
        db = get_database()
        
        await db.message_blasts.update_one(
            {"_id": ObjectId(blast_id)},
            {"$set": {
                "status": BlastStatus.FAILED,
                "completed_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "error_message": error
            }}
        )
        
        logger.error(f"Message blast {blast_id} marked as failed: {error}")
    
    async def _create_blast_targets(self, blast_id: str, phone_numbers: List[str]):
        """Create target records for blast"""
        db = get_database()
        
        targets = []
        for i, phone_number in enumerate(phone_numbers):
            batch_number = (i // 5) + 1  # Assuming default batch size for calculation
            
            target = {
                "blast_id": blast_id,
                "phone_number": phone_number,
                "status": MessageStatus.PENDING,
                "batch_number": batch_number,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            targets.append(target)
        
        if targets:
            await db.blast_targets.insert_many(targets)
            logger.info(f"Created {len(targets)} target records for blast {blast_id}")
    
    async def _validate_sender_phone(self, phone_id: str, workspace_id: str):
        """Validate that sender phone exists and is connected"""
        db = get_database()
        
        phone = await db.phone_numbers.find_one({
            "_id": ObjectId(phone_id),
            "workspace_id": ObjectId(workspace_id)
        })
        
        if not phone:
            raise ValueError("Sender phone not found in workspace")
        
        if phone.get("status") != "connected":
            raise ValueError("Sender phone must be connected to WhatsApp")
    
    async def _clean_phone_numbers(self, phone_numbers: List[str]) -> List[str]:
        """Clean and validate phone numbers"""
        cleaned = []
        
        for phone in phone_numbers:
            cleaned_phone = self._clean_phone_number(phone)
            if cleaned_phone and self._is_valid_phone_format(cleaned_phone):
                if cleaned_phone not in cleaned:  # Remove duplicates
                    cleaned.append(cleaned_phone)
        
        return cleaned
    
    def _clean_phone_number(self, phone: str) -> str:
        """Clean a single phone number"""
        # Remove all non-digit characters except +
        cleaned = re.sub(r'[^\d+]', '', str(phone).strip())
        
        # Ensure it starts with +
        if cleaned and not cleaned.startswith('+'):
            cleaned = '+' + cleaned
        
        return cleaned
    
    def _is_valid_phone_format(self, phone: str) -> bool:
        """Validate phone number format"""
        if not phone or len(phone) < 8:
            return False
        
        # Basic international phone number validation
        pattern = r'^\+[1-9]\d{7,14}$'
        return bool(re.match(pattern, phone))
    
    async def get_blast_targets(self, blast_id: str, status: Optional[str] = None) -> List[BlastTarget]:
        """Get targets for a blast with optional status filter"""
        db = get_database()
        
        query = {"blast_id": blast_id}
        if status:
            query["status"] = status
        
        cursor = db.blast_targets.find(query).sort("created_at", 1)
        
        targets = []
        async for target in cursor:
            target["_id"] = str(target["_id"])
            targets.append(BlastTarget(**target))
        
        return targets

message_blast_service = MessageBlastService()