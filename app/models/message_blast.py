from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class BlastStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    FAILED = "failed"

class MessageStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    DELIVERED = "delivered"

class MessageBlastBase(BaseModel):
    title: str
    message_content: str
    sender_phone_id: str
    batch_size: int = 5
    batch_interval_minutes: int = 2
    start_time: datetime
    end_time: Optional[datetime] = None
    target_count: int = 0
    status: BlastStatus = BlastStatus.DRAFT
    
class MessageBlastCreate(MessageBlastBase):
    workspace_id: str
    phone_numbers: List[str]

class MessageBlastUpdate(BaseModel):
    title: Optional[str] = None
    message_content: Optional[str] = None
    sender_phone_id: Optional[str] = None
    batch_size: Optional[int] = None
    batch_interval_minutes: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[BlastStatus] = None

class MessageBlastInDB(MessageBlastBase):
    id: str = Field(alias="_id")
    workspace_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    sent_count: int = 0
    failed_count: int = 0
    delivered_count: int = 0

class MessageBlast(MessageBlastBase):
    id: str = Field(alias="_id")
    workspace_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    sent_count: int = 0
    failed_count: int = 0
    delivered_count: int = 0

class BlastTargetBase(BaseModel):
    phone_number: str
    status: MessageStatus = MessageStatus.PENDING
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    error_message: Optional[str] = None
    batch_number: int = 1

class BlastTargetCreate(BlastTargetBase):
    blast_id: str

class BlastTargetInDB(BlastTargetBase):
    id: str = Field(alias="_id")
    blast_id: str
    created_at: datetime
    updated_at: datetime

class BlastTarget(BlastTargetBase):
    id: str = Field(alias="_id")
    blast_id: str
    created_at: datetime
    updated_at: datetime

class BlastProgress(BaseModel):
    blast_id: str
    total_targets: int
    pending_count: int
    sent_count: int
    failed_count: int
    delivered_count: int
    current_batch: int
    total_batches: int
    progress_percentage: float
    estimated_completion: Optional[datetime] = None
    last_sent_at: Optional[datetime] = None

class BlastStatistics(BaseModel):
    workspace_id: str
    total_blasts: int
    active_blasts: int
    completed_blasts: int
    total_messages_sent: int
    success_rate: float
    last_blast_date: Optional[datetime] = None