import asyncio
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from app.services.message_blast_service import message_blast_service
from app.database import get_database
from bson import ObjectId

logger = logging.getLogger(__name__)

class BlastSchedulerService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.is_running = False
    
    async def start(self):
        """Start the blast scheduler"""
        try:
            if not self.is_running:
                self.scheduler.start()
                self.is_running = True
                logger.info("Blast scheduler started successfully")
                
                # Reschedule any existing scheduled blasts on startup
                await self._reschedule_existing_blasts()
        except Exception as e:
            logger.error(f"Failed to start blast scheduler: {e}")
            raise
    
    async def stop(self):
        """Stop the blast scheduler"""
        try:
            if self.is_running:
                self.scheduler.shutdown(wait=True)
                self.is_running = False
                logger.info("Blast scheduler stopped successfully")
        except Exception as e:
            logger.error(f"Failed to stop blast scheduler: {e}")
    
    async def schedule_blast(self, blast_id: str, start_time: datetime):
        """Schedule a blast to start at specific time"""
        try:
            # Remove existing job if it exists
            try:
                self.scheduler.remove_job(f"blast_{blast_id}")
            except:
                pass  # Job doesn't exist, that's fine
            
            # Schedule new job
            self.scheduler.add_job(
                func=self._execute_scheduled_blast,
                trigger=DateTrigger(run_date=start_time),
                id=f"blast_{blast_id}",
                args=[blast_id],
                max_instances=1,
                coalesce=True,
                misfire_grace_time=300  # 5 minutes grace time
            )
            
            logger.info(f"Blast {blast_id} scheduled for {start_time}")
            
        except Exception as e:
            logger.error(f"Failed to schedule blast {blast_id}: {e}")
            raise
    
    async def unschedule_blast(self, blast_id: str):
        """Remove a scheduled blast"""
        try:
            self.scheduler.remove_job(f"blast_{blast_id}")
            logger.info(f"Blast {blast_id} unscheduled")
        except Exception as e:
            logger.warning(f"Failed to unschedule blast {blast_id}: {e}")
    
    async def _execute_scheduled_blast(self, blast_id: str):
        """Execute a scheduled blast"""
        try:
            logger.info(f"Executing scheduled blast {blast_id}")
            
            # Verify blast still exists and is scheduled
            blast = await message_blast_service.get_blast_by_id(blast_id)
            if not blast:
                logger.warning(f"Scheduled blast {blast_id} not found")
                return
            
            if blast.status != "scheduled":
                logger.warning(f"Blast {blast_id} is not in scheduled status: {blast.status}")
                return
            
            # Start the blast
            await message_blast_service.start_blast(blast_id)
            
            logger.info(f"Scheduled blast {blast_id} started successfully")
            
        except Exception as e:
            logger.error(f"Failed to execute scheduled blast {blast_id}: {e}")
            
            # Mark blast as failed
            try:
                await message_blast_service._mark_blast_failed(blast_id, str(e))
            except:
                pass
    
    async def _reschedule_existing_blasts(self):
        """Reschedule any existing scheduled blasts on startup"""
        try:
            db = get_database()
            
            # Find scheduled blasts
            scheduled_blasts = await db.message_blasts.find({
                "status": "scheduled",
                "start_time": {"$gt": datetime.utcnow()}
            }).to_list(None)
            
            for blast in scheduled_blasts:
                blast_id = str(blast["_id"])
                start_time = blast["start_time"]
                
                try:
                    await self.schedule_blast(blast_id, start_time)
                    logger.info(f"Rescheduled blast {blast_id} for {start_time}")
                except Exception as e:
                    logger.error(f"Failed to reschedule blast {blast_id}: {e}")
            
            logger.info(f"Rescheduled {len(scheduled_blasts)} existing blasts")
            
        except Exception as e:
            logger.error(f"Failed to reschedule existing blasts: {e}")
    
    def get_scheduled_jobs(self) -> List[Dict[str, Any]]:
        """Get list of scheduled blast jobs"""
        if not self.is_running:
            return []
        
        jobs = []
        for job in self.scheduler.get_jobs():
            if job.id.startswith("blast_"):
                jobs.append({
                    "job_id": job.id,
                    "blast_id": job.id.replace("blast_", ""),
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                    "trigger": str(job.trigger)
                })
        
        return jobs

blast_scheduler_service = BlastSchedulerService()