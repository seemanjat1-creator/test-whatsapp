import os
import pandas as pd
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from app.config import settings
from app.database import get_database
from app.models.email_config import EmailConfig, EmailLog, EmailLogCreate
from bson import ObjectId
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
import pytz

logger = logging.getLogger(__name__)

class EmailNotificationService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.reports_dir = "email_reports"
        os.makedirs(self.reports_dir, exist_ok=True)
    
    async def send_workspace_chat_notifications(self):
        """Main function to send chat notifications for all configured workspaces"""
        try:
            logger.info("Starting automated chat email notifications")
            
            db = get_database()
            
            # Get all active email configurations
            email_configs = await db.email_configs.find({"status": "active"}).to_list(None)
            
            if not email_configs:
                logger.info("No active email configurations found")
                return
            
            notification_summary = {
                "total_configs": len(email_configs),
                "successful_emails": 0,
                "failed_emails": 0,
                "total_messages_sent": 0,
                "notification_timestamp": datetime.utcnow().isoformat()
            }
            
            # Process each email configuration
            for config in email_configs:
                try:
                    result = await self._send_workspace_notification(config)
                    if result["success"]:
                        notification_summary["successful_emails"] += 1
                        notification_summary["total_messages_sent"] += result["message_count"]
                    else:
                        notification_summary["failed_emails"] += 1
                        
                except Exception as e:
                    logger.error(f"Failed to send notification for config {config['_id']}: {e}")
                    notification_summary["failed_emails"] += 1
                    continue
            
            logger.info(f"Email notification completed: {notification_summary}")
            
        except Exception as e:
            logger.error(f"Email notification process failed: {e}")
            raise
    
    async def _send_workspace_notification(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Send email notification for a specific workspace"""
        workspace_id = str(config["workspace_id"])
        email_address = config["email_address"]
        
        try:
            logger.info(f"Processing email notification for workspace {workspace_id}")
            
            # Get workspace details
            db = get_database()
            workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
            
            if not workspace:
                logger.warning(f"Workspace {workspace_id} not found")
                return {"success": False, "message_count": 0, "reason": "workspace_not_found"}
            
            workspace_name = workspace["name"]
            
            # Get last email timestamp for this configuration
            last_email_time = config.get("last_email_sent")
            if not last_email_time:
                # If no previous email, get messages from last 5 minutes
                last_email_time = datetime.utcnow() - timedelta(minutes=config.get("send_frequency_minutes", 5))
            
            # Query new messages since last email
            messages = await self._get_new_chat_messages(workspace_id, last_email_time, config)
            
            if not messages:
                logger.info(f"No new messages for workspace {workspace_name} since {last_email_time}")
                return {"success": True, "message_count": 0, "reason": "no_new_messages"}
            
            logger.info(f"Found {len(messages)} new messages for workspace {workspace_name}")
            
            # Generate Excel file
            excel_file_path = await self._create_chat_excel_report(messages, workspace_name, workspace_id)
            
            # Send email
            email_sent = await self._send_notification_email(
                recipient_email=email_address,
                workspace_name=workspace_name,
                message_count=len(messages),
                excel_file_path=excel_file_path
            )
            
            if email_sent:
                # Update last email sent timestamp
                await self._update_last_email_timestamp(config["_id"])
                
                # Log email sent
                await self._log_email_sent(config, len(messages), excel_file_path)
                
                # Cleanup file after sending
                if os.path.exists(excel_file_path):
                    os.remove(excel_file_path)
                
                return {"success": True, "message_count": len(messages), "reason": "email_sent_successfully"}
            else:
                return {"success": False, "message_count": len(messages), "reason": "email_send_failed"}
            
        except Exception as e:
            logger.error(f"Failed to send notification for workspace {workspace_id}: {e}")
            await self._log_email_error(config["_id"], str(e))
            return {"success": False, "message_count": 0, "reason": f"error: {str(e)}"}
    
    async def _get_new_chat_messages(
        self, 
        workspace_id: str, 
        since_time: datetime, 
        config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Get new chat messages for a workspace since the given timestamp"""
        db = get_database()
        
        # Build match criteria based on configuration
        match_criteria = {
            "chat.workspace_id": ObjectId(workspace_id),
            "timestamp": {"$gte": since_time}
        }
        
        # Filter by message source if configured
        if not config.get("include_ai_messages", True):
            match_criteria["is_ai_generated"] = {"$ne": True}
        
        if not config.get("include_human_messages", True):
            match_criteria["is_ai_generated"] = True
        
        # Aggregation pipeline to join messages with chats
        pipeline = [
            {
                "$lookup": {
                    "from": "chats",
                    "localField": "chat_id",
                    "foreignField": "_id",
                    "as": "chat"
                }
            },
            {
                "$unwind": "$chat"
            },
            {
                "$match": match_criteria
            },
            {
                "$sort": {"timestamp": -1}
            }
        ]
        
        messages = []
        async for message in db.messages.aggregate(pipeline):
            messages.append(message)
        
        return messages
    
    async def _create_chat_excel_report(
        self, 
        messages: List[Dict[str, Any]], 
        workspace_name: str,
        workspace_id: str
    ) -> str:
        """Create Excel report from chat messages"""
        try:
            # Prepare data for Excel
            excel_data = []
            
            for message in messages:
                chat = message.get("chat", {})
                
                # Determine message direction and source
                if message.get("direction") == "incoming":
                    sender_phone = chat.get("customer_phone", "Unknown")
                    receiver_phone = chat.get("phone_number", "Unknown")
                    direction = "Incoming"
                    source = "Customer"
                else:
                    sender_phone = chat.get("phone_number", "Unknown")
                    receiver_phone = chat.get("customer_phone", "Unknown")
                    direction = "Outgoing"
                    source = "AI Generated" if message.get("is_ai_generated", False) else "Human"
                
                # Convert timestamp to IST
                timestamp = message.get("timestamp", datetime.utcnow())
                if timestamp.tzinfo is None:
                    timestamp = pytz.utc.localize(timestamp)
                ist_timestamp = timestamp.astimezone(pytz.timezone('Asia/Kolkata'))
                
                excel_data.append({
                    "Sender Phone": sender_phone,
                    "Receiver Phone": receiver_phone,
                    "Message Direction": direction,
                    "Message Source": source,
                    "Message Content": message.get("content", ""),
                    "Timestamp (IST)": ist_timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "Customer Name": chat.get("customer_name", ""),
                    "Chat Status": chat.get("status", "active"),
                    "Message Type": message.get("message_type", "text").title()
                })
            
            # Create DataFrame with exact column order
            df = pd.DataFrame(excel_data, columns=[
                "Sender Phone",
                "Receiver Phone", 
                "Message Direction",
                "Message Source",
                "Message Content",
                "Timestamp (IST)",
                "Customer Name",
                "Chat Status",
                "Message Type"
            ])
            
            # Generate filename with IST timestamp
            ist_now = datetime.now(pytz.timezone('Asia/Kolkata'))
            timestamp = ist_now.strftime("%Y-%m-%d_%H-%M")
            safe_workspace_name = self._sanitize_filename(workspace_name)
            filename = f"{safe_workspace_name}_ChatData_{timestamp}.xlsx"
            file_path = os.path.join(self.reports_dir, filename)
            
            # Create Excel file with professional formatting
            with pd.ExcelWriter(file_path, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Chat Messages', index=False, startrow=3)
                
                # Get workbook and worksheet for formatting
                workbook = writer.book
                worksheet = writer.sheets['Chat Messages']
                
                # Add workspace header
                worksheet['A1'] = f"WhatsApp Chat Report - {workspace_name}"
                worksheet['A1'].font = openpyxl.styles.Font(size=16, bold=True, color="2F5597")
                worksheet['A2'] = f"Generated on: {ist_now.strftime('%Y-%m-%d %H:%M:%S IST')}"
                worksheet['A2'].font = openpyxl.styles.Font(size=12, color="666666")
                
                # Format headers (row 4)
                header_font = openpyxl.styles.Font(bold=True, color="FFFFFF")
                header_fill = openpyxl.styles.PatternFill(start_color="2F5597", end_color="2F5597", fill_type="solid")
                
                for col_num, column in enumerate(df.columns, 1):
                    cell = worksheet.cell(row=4, column=col_num)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.alignment = openpyxl.styles.Alignment(horizontal="center", vertical="center")
                
                # Auto-adjust column widths
                for column in worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except:
                            pass
                    
                    # Set width with reasonable limits
                    adjusted_width = min(max(max_length + 2, 12), 50)
                    worksheet.column_dimensions[column_letter].width = adjusted_width
                
                # Add borders to data
                thin_border = openpyxl.styles.Border(
                    left=openpyxl.styles.Side(style='thin'),
                    right=openpyxl.styles.Side(style='thin'),
                    top=openpyxl.styles.Side(style='thin'),
                    bottom=openpyxl.styles.Side(style='thin')
                )
                
                for row in worksheet.iter_rows(min_row=4, max_row=len(df) + 4, min_col=1, max_col=len(df.columns)):
                    for cell in row:
                        cell.border = thin_border
                        if cell.row > 4:  # Data rows
                            cell.alignment = openpyxl.styles.Alignment(vertical="top", wrap_text=True)
            
            logger.info(f"Excel report created: {file_path}")
            return file_path
            
        except Exception as e:
            logger.error(f"Failed to create Excel report: {e}")
            raise
    
    async def _send_notification_email(
        self, 
        recipient_email: str, 
        workspace_name: str, 
        message_count: int,
        excel_file_path: str
    ) -> bool:
        """Send notification email with Excel attachment"""
        try:
            # Create email message
            msg = MIMEMultipart()
            msg['From'] = settings.smtp_username
            msg['To'] = recipient_email
            msg['Subject'] = f"WhatsApp Chat Report - {workspace_name} - {datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%Y-%m-%d %H:%M IST')}"
            
            # Email body
            body = f"""
Dear Team,

Please find attached the WhatsApp chat report for workspace "{workspace_name}".

Report Summary:
- Workspace: {workspace_name}
- New Messages: {message_count}
- Report Period: Last 5 minutes
- Generated: {datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%Y-%m-%d %H:%M:%S IST')}

The attached Excel file contains detailed chat data including:
• Sender and receiver phone numbers
• Message direction (Incoming/Outgoing)
• Message source (AI Generated/Human)
• Complete message content
• Timestamps in IST timezone
• Customer information and chat status

This is an automated notification from the WhatsApp Chat Management System.

Best regards,
WhatsApp AI Automation Team
            """.strip()
            
            msg.attach(MIMEText(body, 'plain'))
            
            # Attach Excel file
            with open(excel_file_path, "rb") as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {os.path.basename(excel_file_path)}'
                )
                msg.attach(part)
            
            # Send email
            await self._send_smtp_email(msg)
            
            logger.info(f"Chat notification email sent to {recipient_email} for workspace {workspace_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send notification email: {e}")
            return False
    
    async def _send_smtp_email(self, msg: MIMEMultipart):
        """Send email using SMTP in thread pool"""
        def send_email():
            try:
                server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
                server.starttls()
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
                server.quit()
                return True
            except Exception as e:
                logger.error(f"SMTP error: {e}")
                raise
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, send_email)
    
    async def _update_last_email_timestamp(self, config_id: str):
        """Update the last email sent timestamp for a configuration"""
        db = get_database()
        
        await db.email_configs.update_one(
            {"_id": ObjectId(config_id)},
            {
                "$set": {
                    "last_email_sent": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                },
                "$inc": {"total_emails_sent": 1}
            }
        )
    
    async def _log_email_sent(self, config: Dict[str, Any], message_count: int, file_path: str):
        """Log successful email sending"""
        db = get_database()
        
        email_log = EmailLogCreate(
            workspace_id=str(config["workspace_id"]),
            email_config_id=str(config["_id"]),
            recipient_email=config["email_address"],
            subject=f"WhatsApp Chat Report - {datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%Y-%m-%d %H:%M IST')}",
            message_count=message_count,
            file_path=os.path.basename(file_path),
            status="sent",
            sent_at=datetime.utcnow()
        )
        
        log_dict = email_log.dict()
        log_dict["created_at"] = datetime.utcnow()
        
        await db.email_logs.insert_one(log_dict)
    
    async def _log_email_error(self, config_id: str, error_message: str):
        """Log email sending error"""
        db = get_database()
        
        await db.email_configs.update_one(
            {"_id": ObjectId(config_id)},
            {
                "$set": {
                    "last_error": error_message,
                    "updated_at": datetime.utcnow()
                }
            }
        )
    
    def _sanitize_filename(self, name: str) -> str:
        """Sanitize workspace name for use in filenames"""
        sanitized = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()
        sanitized = sanitized.replace(' ', '_')
        return sanitized if sanitized else "workspace"
    
    async def test_email_configuration(self, email_address: str, workspace_name: str) -> bool:
        """Test email configuration by sending a test email"""
        try:
            msg = MIMEMultipart()
            msg['From'] = settings.smtp_username
            msg['To'] = email_address
            msg['Subject'] = f"Test Email - WhatsApp Chat Notifications - {workspace_name}"
            
            body = f"""
Dear Team,

This is a test email to verify the email notification configuration for workspace "{workspace_name}".

If you receive this email, the configuration is working correctly and you will receive:
• Automated chat reports every 5 minutes (when new messages exist)
• Excel attachments with detailed chat data
• Professional formatting with IST timestamps

Configuration Details:
- Workspace: {workspace_name}
- Test Time: {datetime.now(pytz.timezone('Asia/Kolkata')).strftime('%Y-%m-%d %H:%M:%S IST')}
- SMTP Server: {settings.smtp_server}

Best regards,
WhatsApp AI Automation System
            """.strip()
            
            msg.attach(MIMEText(body, 'plain'))
            
            await self._send_smtp_email(msg)
            
            logger.info(f"Test email sent successfully to {email_address}")
            return True
            
        except Exception as e:
            logger.error(f"Test email failed: {e}")
            return False
    
    async def get_email_statistics(self, workspace_id: str, days: int = 7) -> Dict[str, Any]:
        """Get email notification statistics for a workspace"""
        try:
            db = get_database()
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            # Get email logs
            email_logs = await db.email_logs.find({
                "workspace_id": workspace_id,
                "sent_at": {"$gte": cutoff_date}
            }).sort("sent_at", -1).to_list(None)
            
            # Calculate statistics
            total_emails = len(email_logs)
            successful_emails = len([log for log in email_logs if log.get("status") == "sent"])
            total_messages = sum(log.get("message_count", 0) for log in email_logs)
            
            # Daily breakdown
            daily_breakdown = {}
            for log in email_logs:
                date_key = log["sent_at"].strftime("%Y-%m-%d")
                if date_key not in daily_breakdown:
                    daily_breakdown[date_key] = {"emails": 0, "messages": 0}
                daily_breakdown[date_key]["emails"] += 1
                daily_breakdown[date_key]["messages"] += log.get("message_count", 0)
            
            return {
                "workspace_id": workspace_id,
                "total_emails_sent": total_emails,
                "successful_emails": successful_emails,
                "total_messages_notified": total_messages,
                "success_rate": (successful_emails / total_emails * 100) if total_emails > 0 else 0,
                "daily_breakdown": daily_breakdown,
                "last_email_date": email_logs[0]["sent_at"].isoformat() if email_logs else None
            }
            
        except Exception as e:
            logger.error(f"Failed to get email statistics: {e}")
            return {}

# Global instance
email_notification_service = EmailNotificationService()