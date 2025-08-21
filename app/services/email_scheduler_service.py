import asyncio
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.services.email_notification_service import email_notification_service
from app.config import settings

logger = logging.getLogger(__name__)

class EmailSchedulerService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.is_running = False
        self.notification_interval = 5  # minutes
    
    async def start(self):
        """Start the email notification scheduler"""
        try:
            logger.info("Starting email notification scheduler service")
            
            # Chat notification emails every 5 minutes
            self.scheduler.add_job(
                func=self._safe_notification_job,
                trigger=IntervalTrigger(minutes=self.notification_interval),
                id='chat_email_notifications',
                name='Chat Email Notifications',
                max_instances=1,
                coalesce=True,
                misfire_grace_time=300  # 5 minutes grace time
            )
            
            # Email system health check every hour
            self.scheduler.add_job(
                func=self._safe_health_check_job,
                trigger=IntervalTrigger(hours=1),
                id='email_health_check',
                name='Email System Health Check',
                max_instances=1
            )
            
            # Cleanup old email logs daily at 1 AM IST
            self.scheduler.add_job(
                func=self._safe_cleanup_job,
                trigger=CronTrigger(hour=1, minute=0, timezone='Asia/Kolkata'),
                id='email_log_cleanup',
                name='Email Log Cleanup',
                max_instances=1
            )
            
            # Start scheduler
            self.scheduler.start()
            self.is_running = True
            
            logger.info(f"Email scheduler started successfully - notifications every {self.notification_interval} minutes")
            
        except Exception as e:
            logger.error(f"Failed to start email scheduler: {e}")
            raise
    
    async def stop(self):
        """Stop the email scheduler"""
        try:
            if self.is_running:
                self.scheduler.shutdown(wait=True)
                self.is_running = False
                logger.info("Email scheduler stopped successfully")
        except Exception as e:
            logger.error(f"Failed to stop email scheduler: {e}")
    
    async def _safe_notification_job(self):
        """Safely execute email notifications with error handling"""
        try:
            logger.info("Starting scheduled chat email notifications")
            start_time = datetime.utcnow()
            
            await email_notification_service.send_workspace_chat_notifications()
            
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            logger.info(f"Email notifications completed in {execution_time:.2f} seconds")
            
            # Log successful execution
            await self._log_scheduler_event("success", f"Notifications completed in {execution_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Scheduled email notifications failed: {e}")
            await self._log_scheduler_event("error", str(e))
    
    async def _safe_health_check_job(self):
        """Perform email system health checks"""
        try:
            logger.info("Starting email system health check")
            
            # Check SMTP configuration
            smtp_configured = all([
                settings.smtp_server,
                settings.smtp_port,
                settings.smtp_username,
                settings.smtp_password
            ])
            
            if not smtp_configured:
                logger.warning("SMTP configuration incomplete")
                await self._log_scheduler_event("warning", "SMTP configuration incomplete")
                return
            
            # Test SMTP connection
            try:
                test_success = await email_notification_service.test_email_configuration(
                    settings.smtp_username, "System Health Check"
                )
                if test_success:
                    await self._log_scheduler_event("health_check", "SMTP connection test successful")
                else:
                    await self._log_scheduler_event("health_check_warning", "SMTP connection test failed")
            except Exception as e:
                await self._log_scheduler_event("health_check_error", f"SMTP test failed: {str(e)}")
            
            # Check active configurations
            from app.database import get_database
            db = get_database()
            
            active_configs = await db.email_configs.count_documents({"status": "active"})
            total_configs = await db.email_configs.count_documents({})
            
            logger.info(f"Email health check - {active_configs}/{total_configs} configurations active")
            await self._log_scheduler_event(
                "health_check", 
                f"System healthy - {active_configs}/{total_configs} configurations active"
            )
            
        except Exception as e:
            logger.error(f"Email health check failed: {e}")
            await self._log_scheduler_event("health_check_error", str(e))
    
    async def _safe_cleanup_job(self):
        """Safely execute email log cleanup"""
        try:
            logger.info("Starting email log cleanup")
            
            from app.database import get_database
            db = get_database()
            
            # Delete logs older than 30 days
            cutoff_date = datetime.utcnow() - timedelta(days=30)
            
            result = await db.email_logs.delete_many({
                "sent_at": {"$lt": cutoff_date}
            })
            
            logger.info(f"Email log cleanup completed - deleted {result.deleted_count} old logs")
            await self._log_scheduler_event("cleanup", f"Deleted {result.deleted_count} old email logs")
            
        except Exception as e:
            logger.error(f"Email log cleanup failed: {e}")
            await self._log_scheduler_event("cleanup_error", str(e))
    
    async def _log_scheduler_event(self, event_type: str, message: str):
        """Log scheduler events to database"""
        try:
            from app.database import get_database
            db = get_database()
            
            event_log = {
                "event_type": event_type,
                "message": message,
                "timestamp": datetime.utcnow(),
                "service": "email_notification_scheduler"
            }
            
            await db.system_logs.insert_one(event_log)
            
        except Exception as e:
            logger.error(f"Failed to log scheduler event: {e}")
    
    def get_scheduler_status(self) -> Dict[str, Any]:
        """Get status of email notification scheduler"""
        if not self.is_running:
            return {"status": "stopped", "jobs": [], "notification_interval": self.notification_interval}
        
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger)
            })
        
        return {
            "status": "running",
            "jobs": jobs,
            "notification_interval": self.notification_interval,
            "scheduler_state": self.scheduler.state
        }

# Global scheduler instance
email_scheduler_service = EmailSchedulerService()