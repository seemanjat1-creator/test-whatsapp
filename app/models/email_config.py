from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class EmailConfigStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"

class EmailConfigBase(BaseModel):
    workspace_id: str
    email_address: EmailStr
    status: EmailConfigStatus = EmailConfigStatus.ACTIVE
    send_frequency_minutes: int = 5
    include_ai_messages: bool = True
    include_human_messages: bool = True
    timezone: str = "Asia/Kolkata"  # IST timezone

class EmailConfigCreate(EmailConfigBase):
    pass

class EmailConfigUpdate(BaseModel):
    email_address: Optional[EmailStr] = None
    status: Optional[EmailConfigStatus] = None
    send_frequency_minutes: Optional[int] = None
    include_ai_messages: Optional[bool] = None
    include_human_messages: Optional[bool] = None
    timezone: Optional[str] = None

class EmailConfigInDB(EmailConfigBase):
    id: str = Field(alias="_id")
    created_at: datetime
    updated_at: datetime
    last_email_sent: Optional[datetime] = None
    total_emails_sent: int = 0
    last_error: Optional[str] = None

class EmailConfig(EmailConfigBase):
    id: str = Field(alias="_id")
    created_at: datetime
    updated_at: datetime
    last_email_sent: Optional[datetime] = None
    total_emails_sent: int = 0
    last_error: Optional[str] = None

class EmailLogBase(BaseModel):
    workspace_id: str
    email_config_id: str
    recipient_email: str
    subject: str
    message_count: int
    file_path: Optional[str] = None
    status: str = "sent"  # sent, failed
    error_message: Optional[str] = None
    sent_at: datetime

class EmailLogCreate(EmailLogBase):
    pass

class EmailLogInDB(EmailLogBase):
    id: str = Field(alias="_id")
    created_at: datetime

class EmailLog(EmailLogBase):
    id: str = Field(alias="_id")
    created_at: datetime

class EmailTestRequest(BaseModel):
    workspace_id: str
    email_address: EmailStr
    test_message: Optional[str] = "This is a test email from WhatsApp Chat Notification System"