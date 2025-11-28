"""
Script to backfill missing 'open' step trackers for existing requirements with 'Open' status
This script runs directly in the Flask app context, bypassing authentication requirements.
"""

import sys
import os

# Add parent directory to path to import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.models.requirement import Requirement, RequirementStatusEnum
from app.models.sla_tracker import SLATracker, SLAStatusEnum
from app.models.sla_config import StepNameEnum, SLAConfig
from app.database import db
from datetime import datetime

def backfill_open_steps():
    """Backfill missing 'open' step trackers for existing requirements with 'Open' status"""
    app = create_app()
    
    with app.app_context():
        try:
            # Get all requirements with 'Open' status that don't have an 'open' step tracker
            open_requirements = db.session.query(Requirement).filter(
                Requirement.status == RequirementStatusEnum.Open,
                Requirement.deleted_at.is_(None)
            ).all()
            
            print(f"\nFound {len(open_requirements)} requirements with 'Open' status")
            
            backfilled_count = 0
            skipped_count = 0
            errors = []
            
            for requirement in open_requirements:
                try:
                    # Check if 'open' step tracker already exists
                    existing_tracker = db.session.query(SLATracker).filter_by(
                        requirement_id=requirement.requirement_id,
                        step_name=StepNameEnum.open.value,
                        step_completed_at=None
                    ).first()
                    
                    if existing_tracker:
                        skipped_count += 1
                        print(f"  ✓ Skipped {requirement.request_id} - already has 'open' step tracker")
                        continue
                    
                    # Get SLA config for 'open' step
                    config = SLAConfig.get_config_by_step(StepNameEnum.open)
                    if not config:
                        error_msg = f"Requirement {requirement.request_id}: No SLA config for 'open' step"
                        print(f"  ✗ {error_msg}")
                        errors.append(error_msg)
                        continue
                    
                    # Create 'open' step tracker with requirement's created_at as start time
                    tracker = SLATracker(
                        requirement_id=requirement.requirement_id,
                        step_name=StepNameEnum.open,
                        step_started_at=requirement.created_at or datetime.utcnow(),
                        sla_hours=config.sla_hours,
                        sla_days=config.sla_days,
                        user_id=requirement.user_id,
                        sla_status=SLAStatusEnum.pending
                    )
                    
                    # Calculate initial metrics
                    tracker.calculate_sla_metrics()
                    
                    db.session.add(tracker)
                    backfilled_count += 1
                    print(f"  ✓ Backfilled {requirement.request_id} - created 'open' step tracker (started: {tracker.step_started_at}, SLA: {config.sla_hours}h)")
                    
                except Exception as e:
                    error_msg = f"Error backfilling requirement {requirement.request_id}: {str(e)}"
                    print(f"  ✗ {error_msg}")
                    errors.append(error_msg)
            
            db.session.commit()
            
            print(f"\n{'='*70}")
            print(f"Backfill Summary:")
            print(f"  ✓ Backfilled: {backfilled_count} requirements")
            print(f"  ⊘ Skipped: {skipped_count} requirements (already have trackers)")
            print(f"  ✗ Errors: {len(errors)} requirements")
            print(f"{'='*70}\n")
            
            if errors:
                print("Errors encountered:")
                for error in errors:
                    print(f"  - {error}")
                print()
            
            return {
                'success': True,
                'backfilled_count': backfilled_count,
                'skipped_count': skipped_count,
                'errors': errors
            }
            
        except Exception as e:
            db.session.rollback()
            print(f"\n✗ Fatal error in backfill: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

if __name__ == '__main__':
    print("\n" + "="*70)
    print("SLA Open Steps Backfill Script".center(70))
    print("="*70)
    result = backfill_open_steps()
    
    if result.get('success'):
        print("✅ Backfill completed successfully!")
        sys.exit(0)
    else:
        print("❌ Backfill failed!")
        sys.exit(1)

