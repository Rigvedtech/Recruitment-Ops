from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from app.models.sla_config import SLAConfig, StepNameEnum
from app.models.sla_tracker import SLATracker, SLAStatusEnum
from app.models.requirement import Requirement
from app.database import db
from flask import current_app

class SLAService:
    """Service class for managing SLA tracking and calculations"""
    
    @staticmethod
    def initialize_default_configs():
        """Initialize default SLA configurations"""
        try:
            SLAConfig.initialize_default_configs()
            current_app.logger.info("Default SLA configurations initialized")
        except Exception as e:
            current_app.logger.error(f"Error initializing SLA configs: {str(e)}")
            raise
    
    @staticmethod
    def get_sla_config(step_name: StepNameEnum) -> Optional[SLAConfig]:
        """Get SLA configuration for a specific step"""
        return SLAConfig.get_config_by_step(step_name)
    
    @staticmethod
    def get_all_active_configs() -> List[SLAConfig]:
        """Get all active SLA configurations"""
        # Ensure default configs exist if none are present
        SLAConfig.ensure_default_configs_exist()
        return SLAConfig.get_active_configs()
    
    @staticmethod
    def update_sla_config(step_name: StepNameEnum, sla_hours: int, sla_days: int, 
                         description: str = None) -> SLAConfig:
        """Update SLA configuration for a step"""
        config = SLAConfig.get_config_by_step(step_name)
        if not config:
            raise ValueError(f"SLA configuration not found for step: {step_name.value}")
        
        config.sla_hours = sla_hours
        config.sla_days = sla_days
        if description:
            config.description = description
        config.updated_at = datetime.utcnow()
        
        db.session.commit()
        current_app.logger.info(f"Updated SLA config for {step_name.value}: {sla_hours}h")
        return config
    
    @staticmethod
    def start_workflow_step(requirement_id: str, step_name: StepNameEnum, 
                           user_id: str = None, notes: str = None) -> SLATracker:
        """Start tracking a workflow step"""
        # Get SLA configuration
        config = SLAConfig.get_config_by_step(step_name)
        if not config:
            raise ValueError(f"No SLA configuration found for step: {step_name.value}")
        
        # Start tracking
        tracker = SLATracker.start_step(
            requirement_id=requirement_id,
            step_name=step_name,
            sla_hours=config.sla_hours,
            sla_days=config.sla_days,
            user_id=user_id,
            notes=notes
        )
        
        current_app.logger.info(f"Started SLA tracking for {requirement_id}:{step_name.value}")
        return tracker
    
    @staticmethod
    def complete_workflow_step(requirement_id: str, step_name: StepNameEnum, 
                              completion_time: datetime = None) -> Optional[SLATracker]:
        """Complete a workflow step and calculate SLA metrics"""
        tracker = SLATracker.complete_step(requirement_id, step_name, completion_time)
        
        if tracker:
            current_app.logger.info(f"Completed SLA tracking for {requirement_id}:{step_name.value} - Status: {tracker.sla_status}")
        
        return tracker
    
    @staticmethod
    def get_workflow_sla_status(requirement_id: str) -> Dict:
        """Get comprehensive SLA status for a workflow"""
        active_steps = SLATracker.get_active_steps(requirement_id)
        completed_steps = SLATracker.get_completed_steps(requirement_id)
        all_steps = SLATracker.get_all_steps(requirement_id)
        
        # Calculate overall metrics
        total_steps = len(all_steps)
        completed_count = len(completed_steps)
        active_count = len(active_steps)
        breaching_count = len([s for s in active_steps if s.is_breaching()])
        
        # Calculate compliance percentage
        completed_on_time = len([s for s in completed_steps if s.sla_status == SLAStatusEnum.completed])
        compliance_percentage = (completed_on_time / completed_count * 100) if completed_count > 0 else 0
        
        # Calculate average TAT
        total_duration_hours = sum(s.actual_duration_hours or 0 for s in completed_steps)
        average_tat_hours = total_duration_hours / completed_count if completed_count > 0 else 0
        
        return {
            'requirement_id': requirement_id,
            'total_steps': total_steps,
            'completed_steps': completed_count,
            'active_steps': active_count,
            'breaching_steps': breaching_count,
            'compliance_percentage': round(compliance_percentage, 2),
            'average_tat_hours': round(average_tat_hours, 2),
            'average_tat_days': round(average_tat_hours / 24, 2),
            'active_steps_data': [s.to_dict() for s in active_steps],
            'completed_steps_data': [s.to_dict() for s in completed_steps],
            'all_steps_data': [s.to_dict() for s in all_steps]
        }
    
    @staticmethod
    def get_global_sla_metrics(days: int = 30) -> Dict:
        """Get global SLA metrics across all workflows"""
        # Update real-time metrics for in-progress steps
        SLATracker.update_in_progress_metrics()
        
        # Get date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get all completed steps in date range
        completed_steps = db.session.query(SLATracker).filter(
            SLATracker.step_completed_at.isnot(None),
            SLATracker.step_completed_at >= start_date,
            SLATracker.step_completed_at <= end_date
        ).all()
        
        # Get all in-progress steps (real-time data)
        in_progress_steps = db.session.query(SLATracker).filter(
            SLATracker.step_completed_at.is_(None)
        ).all()
        
        # Calculate overall metrics (completed + in-progress)
        all_steps = completed_steps + in_progress_steps
        
        if not all_steps:
            return {
                'total_steps': 0,
                'on_time_steps': 0,
                'breached_steps': 0,
                'compliance_percentage': 0,
                'average_tat_hours': 0,
                'average_tat_days': 0,
                'total_breach_hours': 0,
                'step_wise_metrics': {},
                'breaching_requests': [],
                'in_progress_steps': 0,
                'real_time_breached': 0
            }
        
        # Calculate metrics
        total_steps = len(all_steps)
        on_time_steps = len([s for s in all_steps if s.sla_status == SLAStatusEnum.completed])
        breached_steps = len([s for s in all_steps if s.sla_status == SLAStatusEnum.breached])
        in_progress_count = len(in_progress_steps)
        real_time_breached = len([s for s in in_progress_steps if s.sla_status == SLAStatusEnum.breached])
        
        # Only completed steps contribute to duration calculations
        total_duration_hours = sum(s.actual_duration_hours or 0 for s in completed_steps)
        total_breach_hours = sum(s.sla_breach_hours or 0 for s in all_steps)
        
        # Calculate step-wise metrics (completed + in-progress)
        step_metrics = {}
        for step in all_steps:
            step_name = step.step_name.value if step.step_name else str(step.step_name)
            if step_name not in step_metrics:
                step_metrics[step_name] = {
                    'step_display_name': step.step_name.value if step.step_name else str(step.step_name),
                    'total_steps': 0,
                    'on_time_steps': 0,
                    'breached_steps': 0,
                    'compliance_percentage': 0,
                    'average_duration_hours': 0,
                    'total_duration_hours': 0,
                    'in_progress_steps': 0
                }
            
            step_metrics[step_name]['total_steps'] += 1
            
            # Only completed steps contribute to duration calculations
            if step.step_completed_at:
                step_metrics[step_name]['total_duration_hours'] += step.actual_duration_hours or 0
            else:
                step_metrics[step_name]['in_progress_steps'] += 1
            
            if step.sla_status == SLAStatusEnum.completed:
                step_metrics[step_name]['on_time_steps'] += 1
            elif step.sla_status == SLAStatusEnum.breached:
                step_metrics[step_name]['breached_steps'] += 1
        
        # Calculate percentages and averages for each step
        for step_name, metrics in step_metrics.items():
            completed_steps_for_step = metrics['total_steps'] - metrics['in_progress_steps']
            metrics['compliance_percentage'] = (
                metrics['on_time_steps'] / metrics['total_steps'] * 100
            ) if metrics['total_steps'] > 0 else 0
            metrics['average_duration_hours'] = (
                metrics['total_duration_hours'] / completed_steps_for_step
            ) if completed_steps_for_step > 0 else 0
        
        # Get currently breaching requests
        breaching_steps = SLATracker.get_breaching_steps()
        breaching_requests = []
        for step in breaching_steps:
            breaching_requests.append({
                'requirement_id': step.requirement_id,
                'step_name': step.step_name.value if step.step_name else str(step.step_name),
                'step_display_name': step.step_name.value if step.step_name else str(step.step_name),
                'breach_hours': step.sla_breach_hours,
                'user_id': step.user_id,
                'started_at': step.step_started_at.isoformat()
            })
        
        return {
            'total_steps': total_steps,
            'on_time_steps': on_time_steps,
            'breached_steps': breached_steps,
            'compliance_percentage': round((on_time_steps / total_steps * 100), 2) if total_steps > 0 else 0,
            'average_tat_hours': round(total_duration_hours / len(completed_steps), 2) if completed_steps else 0,
            'average_tat_days': round((total_duration_hours / len(completed_steps)) / 24, 2) if completed_steps else 0,
            'total_breach_hours': round(total_breach_hours, 2),
            'step_wise_metrics': step_metrics,
            'breaching_requests': breaching_requests,
            'in_progress_steps': in_progress_count,
            'real_time_breached': real_time_breached,
            'date_range': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'days': days
            }
        }
    
    @staticmethod
    def get_recruiter_sla_metrics(user_id: str, days: int = 30) -> Dict:
        """Get SLA metrics for a specific recruiter"""
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get all steps assigned to this recruiter
        recruiter_steps = db.session.query(SLATracker).filter(
            SLATracker.user_id == user_id,
            SLATracker.step_completed_at >= start_date,
            SLATracker.step_completed_at <= end_date
        ).all()
        
        if not recruiter_steps:
            return {
                'recruiter': user_id,
                'total_steps': 0,
                'on_time_steps': 0,
                'breached_steps': 0,
                'compliance_percentage': 0,
                'average_tat_hours': 0,
                'average_tat_days': 0,
                'step_wise_metrics': {}
            }
        
        # Calculate metrics
        total_steps = len(recruiter_steps)
        on_time_steps = len([s for s in recruiter_steps if s.sla_status == SLAStatusEnum.completed])
        breached_steps = len([s for s in recruiter_steps if s.sla_status == SLAStatusEnum.breached])
        
        total_duration_hours = sum(s.actual_duration_hours or 0 for s in recruiter_steps)
        
        # Calculate step-wise metrics
        step_metrics = {}
        for step in recruiter_steps:
            step_name = step.step_name.value if step.step_name else str(step.step_name)
            if step_name not in step_metrics:
                step_metrics[step_name] = {
                    'step_display_name': step.step_name.value if step.step_name else str(step.step_name),
                    'total_steps': 0,
                    'on_time_steps': 0,
                    'breached_steps': 0,
                    'compliance_percentage': 0,
                    'average_duration_hours': 0,
                    'total_duration_hours': 0
                }
            
            step_metrics[step_name]['total_steps'] += 1
            step_metrics[step_name]['total_duration_hours'] += step.actual_duration_hours or 0
            
            if step.sla_status == SLAStatusEnum.completed:
                step_metrics[step_name]['on_time_steps'] += 1
            elif step.sla_status == SLAStatusEnum.breached:
                step_metrics[step_name]['breached_steps'] += 1
        
        # Calculate percentages and averages
        for step_name, metrics in step_metrics.items():
            metrics['compliance_percentage'] = (
                metrics['on_time_steps'] / metrics['total_steps'] * 100
            ) if metrics['total_steps'] > 0 else 0
            metrics['average_duration_hours'] = (
                metrics['total_duration_hours'] / metrics['total_steps']
            ) if metrics['total_steps'] > 0 else 0
        
        return {
            'recruiter': user_id,
            'total_steps': total_steps,
            'on_time_steps': on_time_steps,
            'breached_steps': breached_steps,
            'compliance_percentage': round((on_time_steps / total_steps * 100), 2) if total_steps > 0 else 0,
            'average_tat_hours': round(total_duration_hours / total_steps, 2) if total_steps > 0 else 0,
            'average_tat_days': round((total_duration_hours / total_steps) / 24, 2) if total_steps > 0 else 0,
            'step_wise_metrics': step_metrics
        }
    
    @staticmethod
    def check_sla_alerts(create_notifications: bool = False) -> List[Dict]:
        """Check for SLA breach alerts and optionally create notifications"""
        from app.models.requirement import Requirement
        
        breaching_steps = SLATracker.get_breaching_steps()
        alerts = []
        
        for step in breaching_steps:
            # Get requirement details for job title and company name
            requirement = db.session.query(Requirement).filter_by(requirement_id=step.requirement_id).first()
            
            # Calculate breach time in a clean format
            breach_hours = step.sla_breach_hours or 0
            breach_days = breach_hours / 24
            breach_days_rounded = round(breach_days, 1)
            
            # Format breach time as "X days" or "X hours" if less than 1 day
            if breach_days_rounded >= 1:
                breach_time_display = f"{int(breach_days_rounded)} days"
            else:
                breach_time_display = f"{int(breach_hours)} hours"
            
            alert = {
                'requirement_id': step.requirement_id,
                'job_title': requirement.job_title if requirement else None,
                'company_name': requirement.company_name if requirement and requirement.company_name else None,
                'step_name': step.step_name.value if step.step_name else str(step.step_name),
                'step_display_name': step.step_name.value if step.step_name else str(step.step_name),
                'user_id': step.user_id,
                'breach_hours': breach_hours,
                'breach_days': breach_days_rounded,
                'breach_time_display': breach_time_display,
                'started_at': step.step_started_at.isoformat(),
                'sla_limit_hours': step.sla_hours,
                'alert_type': 'sla_breach',
                'severity': 'high' if breach_hours > 24 else 'medium'
            }
            alerts.append(alert)
        
        # Create notifications if requested
        if create_notifications and alerts:
            try:
                from app.services.notification_service import NotificationService
                NotificationService.process_sla_breach_alerts(alerts)
            except Exception as e:
                current_app.logger.error(f"Error creating SLA breach notifications: {str(e)}")
        
        return alerts
    
    @staticmethod
    def auto_start_workflow_steps(requirement_id: str, current_status: str, 
                                 user_id: str = None) -> List[SLATracker]:
        """Automatically start SLA tracking for workflow steps based on current status"""
        started_trackers = []
        
        # Map status to workflow steps
        status_to_steps = {
            'Open': [StepNameEnum.candidate_submission],
            'Candidate_Submission': [StepNameEnum.screening],
            'Interview_Scheduled': [StepNameEnum.interview_round_1],
            'Offer_Recommendation': [StepNameEnum.offered],
            'On_Boarding': [StepNameEnum.onboarding]
        }
        
        steps_to_start = status_to_steps.get(current_status, [])
        
        for step_name in steps_to_start:
            try:
                tracker = SLAService.start_workflow_step(
                    requirement_id=requirement_id,
                    step_name=step_name,
                    user_id=user_id
                )
                started_trackers.append(tracker)
            except Exception as e:
                current_app.logger.error(f"Error starting SLA tracking for {requirement_id}:{step_name.value}: {str(e)}")
        
        return started_trackers
