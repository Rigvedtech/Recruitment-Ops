from flask import Blueprint, jsonify, request, current_app
from datetime import datetime
from sqlalchemy import and_, func

from app.database import db
from app.models import Requirement, Profile, Screening, InterviewScheduled, InterviewRoundOne, InterviewRoundTwo, Onboarding, Meeting, User
from app.routes.api import get_db_session
from app.middleware.redis_performance_middleware import cache_response, cache_database_query

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')

@reports_bp.route('/health', methods=['GET'])
def reports_health():
    return jsonify({'ok': True, 'service': 'reports'}), 200


def _parse_date(value: str):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d')
    except Exception:
        return None


@reports_bp.route('/recruitment', methods=['GET'])
@cache_response(ttl=300)  # Cache for 5 minutes - reports can be slightly stale
def recruitment_report():
    """Aggregate recruitment report per requirement with optional date and company filters.

    Query params:
      - date_from (YYYY-MM-DD)
      - date_to   (YYYY-MM-DD)
      - company   (company enum label)
    """
    try:
        session = get_db_session()

        date_from = _parse_date(request.args.get('date_from'))
        date_to = _parse_date(request.args.get('date_to'))
        company = request.args.get('company')

        # Base requirement query with filters
        req_filters = [Requirement.is_deleted.is_(False)]
        if company:
            req_filters.append(Requirement.company_name == company)
        if date_from:
            req_filters.append(Requirement.created_at >= date_from)
        if date_to:
            # include full day
            req_filters.append(Requirement.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59))

        requirements = session.query(Requirement).filter(and_(*req_filters)).order_by(Requirement.created_at.desc()).all()

        def count_meetings_for_requirement(requirement_id, round_type_value):
            # Meetings are linked to profiles, so join via profiles for the requirement
            q = (
                session.query(func.count(Meeting.meeting_id))
                .join(Profile, Profile.profile_id == Meeting.profile_id)
                .filter(
                    Profile.requirement_id == requirement_id,
                    Meeting.is_deleted.is_(False),
                    Meeting.round_type == round_type_value,
                )
            )
            return int(q.scalar() or 0)

        rows = []
        for idx, req in enumerate(requirements, start=1):
            # Profiles under this requirement - fetch only IDs to avoid enum casting issues
            profile_ids = [
                row[0]
                for row in session.query(Profile.profile_id)
                .filter(
                    Profile.requirement_id == req.requirement_id,
                    Profile.deleted_at.is_(None)
                ).all()
            ]

            total_profiles_shared = len(profile_ids)

            # Screening counts
            screening_selected = 0
            screening_rejected = 0
            interview_schedule_received_screening = 0
            waiting_for_schedule_screening = 0

            if profile_ids:
                screening_rows = session.query(Screening).filter(
                    Screening.requirement_id == req.requirement_id,
                    Screening.profile_id.in_(profile_ids),
                    Screening.is_deleted.is_(False)
                ).all()
                screening_selected = sum(1 for s in screening_rows if s.status and s.status == 'selected')
                screening_rejected = sum(1 for s in screening_rows if s.status and s.status == 'rejected')

                # Interview schedule received after screening (meetings with interview_scheduled)
                interview_schedule_received_screening = count_meetings_for_requirement(req.requirement_id, 'interview_scheduled')

                # Waiting for schedule = selected but no meeting scheduled
                waiting_for_schedule_screening = max(
                    0,
                    screening_selected - interview_schedule_received_screening
                )

            # L1 Interview metrics
            l1_meeting_received = count_meetings_for_requirement(req.requirement_id, 'interview_round_1')
            l1_rows = session.query(InterviewRoundOne).filter(
                InterviewRoundOne.requirement_id == req.requirement_id,
                InterviewRoundOne.is_deleted.is_(False)
            ).all()
            l1_done = len(l1_rows)
            l1_selected = sum(1 for r in l1_rows if r.status and r.status == 'select')
            # Waiting for schedule = scheduled but no select/reject recorded yet
            l1_waiting_for_schedule = max(0, l1_meeting_received - l1_done)

            # L2 Interview metrics
            l2_meeting_received = count_meetings_for_requirement(req.requirement_id, 'interview_round_2')
            l2_rows = session.query(InterviewRoundTwo).filter(
                InterviewRoundTwo.requirement_id == req.requirement_id,
                InterviewRoundTwo.is_deleted.is_(False)
            ).all()
            l2_done = len(l2_rows)
            l2_selected = sum(1 for r in l2_rows if r.status and r.status == 'select')
            l2_waiting_for_schedule = max(0, l2_meeting_received - l2_done)

            # Onboarded
            onboarded_count = session.query(func.count(Onboarding.onboarding_id)).filter(
                Onboarding.requirement_id == req.requirement_id,
                Onboarding.is_deleted.is_(False)
            ).scalar() or 0

            rows.append({
                'sr_no': idx,
                'client': req.company_name,
                'job_role': req.job_title,
                'department': req.department,
                'location': req.location,
                'total_positions': req.number_of_positions,
                'jd_received': True if (req.jd_path or req.job_file_name) else False,

                # Screening section
                'profiles_shared': total_profiles_shared,
                'screen_feedback_pending': 0,  # Not tracked separately
                'screen_select': screening_selected,
                'screen_reject': screening_rejected,
                'screen_waiting_for_schedule': waiting_for_schedule_screening,
                'screen_interview_schedule_received': interview_schedule_received_screening,

                # L1
                'l1_interview_backout': 0,  # not explicitly tracked
                'l1_interview_done': l1_done,
                'l1_feedback_pending': 0,  # mapped via waiting as per instruction
                'l1_interview_select': l1_selected,
                'l1_waiting_for_schedule': l1_waiting_for_schedule,
                'l1_interview_schedule_received': l1_meeting_received,

                # L2
                'l2_interview_backout': 0,  # not explicitly tracked
                'l2_interview_done': l2_done,
                'l2_feedback_pending': 0,  # mapped via waiting as per instruction
                'l2_interview_select': l2_selected,
                'l2_waiting_for_schedule': l2_waiting_for_schedule,
                'l2_interview_schedule_received': l2_meeting_received,

                # Onboarded
                'onboarded': int(onboarded_count),
            })

        return jsonify({
            'success': True,
            'data': rows
        })
    except Exception as e:
        current_app.logger.error(f"Error generating recruitment report: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to generate report'}), 500


@reports_bp.route('/internal-tracker', methods=['GET'])
@cache_response(ttl=300)  # Cache for 5 minutes - reports can be slightly stale
def internal_tracker_report():
    """Internal tracker report showing detailed candidate information per profile.

    Query params:
      - date_from (YYYY-MM-DD) - filters by Requirement.created_at
      - date_to   (YYYY-MM-DD) - filters by Requirement.created_at
    """
    try:
        session = get_db_session()

        date_from = _parse_date(request.args.get('date_from'))
        date_to = _parse_date(request.args.get('date_to'))

        # Base query: Join Profile with Requirement, filter by requirement creation date
        query = (
            session.query(Profile, Requirement, User)
            .join(Requirement, Profile.requirement_id == Requirement.requirement_id)
            .outerjoin(User, Profile.created_by_recruiter == User.user_id)
            .filter(
                Profile.deleted_at.is_(None),
                Profile.is_deleted.is_(False),
                Requirement.is_deleted.is_(False)
            )
        )

        # Apply date filters on Requirement.created_at
        if date_from:
            query = query.filter(Requirement.created_at >= date_from)
        if date_to:
            query = query.filter(Requirement.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59))

        # Order by Requirement.created_at DESC
        query = query.order_by(Requirement.created_at.desc())

        profiles_data = query.all()

        rows = []
        for idx, (profile, requirement, recruiter) in enumerate(profiles_data, start=1):
            # Get recruiter name
            recruiter_name = recruiter.full_name if recruiter else None

            # Check if profile was shortlisted (Screening status = 'selected')
            screening = session.query(Screening).filter(
                Screening.profile_id == profile.profile_id,
                Screening.requirement_id == requirement.requirement_id,
                Screening.is_deleted.is_(False)
            ).first()
            resume_shortlist = "Yes" if (screening and screening.status and screening.status == 'selected') else "No"

            # Get Interview Round 1 date
            interview_round_one = session.query(InterviewRoundOne).filter(
                InterviewRoundOne.profile_id == profile.profile_id,
                InterviewRoundOne.requirement_id == requirement.requirement_id,
                InterviewRoundOne.is_deleted.is_(False)
            ).first()
            interview_round_1_date = None
            if interview_round_one:
                # Prefer InterviewRoundOne.start_time, fallback to Meeting.start_time
                if interview_round_one.start_time:
                    interview_round_1_date = interview_round_one.start_time.strftime('%Y-%m-%d')
                elif interview_round_one.meeting_id:
                    meeting = session.query(Meeting).filter(
                        Meeting.meeting_id == interview_round_one.meeting_id,
                        Meeting.is_deleted.is_(False)
                    ).first()
                    if meeting and meeting.start_time:
                        interview_round_1_date = meeting.start_time.strftime('%Y-%m-%d')

            # Get Interview Round 2 date
            interview_round_two = session.query(InterviewRoundTwo).filter(
                InterviewRoundTwo.profile_id == profile.profile_id,
                InterviewRoundTwo.requirement_id == requirement.requirement_id,
                InterviewRoundTwo.is_deleted.is_(False)
            ).first()
            interview_round_2_date = None
            if interview_round_two:
                # Prefer InterviewRoundTwo.start_time, fallback to Meeting.start_time
                if interview_round_two.start_time:
                    interview_round_2_date = interview_round_two.start_time.strftime('%Y-%m-%d')
                elif interview_round_two.meeting_id:
                    meeting = session.query(Meeting).filter(
                        Meeting.meeting_id == interview_round_two.meeting_id,
                        Meeting.is_deleted.is_(False)
                    ).first()
                    if meeting and meeting.start_time:
                        interview_round_2_date = meeting.start_time.strftime('%Y-%m-%d')

            # Map job_type to Contract/Permanent (job_type is now a string)
            job_type_display = ""
            if requirement.job_type:
                job_type_lower = requirement.job_type.lower()
                if 'contract' in job_type_lower:
                    job_type_display = "Contract"
                elif 'full_time' in job_type_lower or 'fulltime' in job_type_lower:
                    job_type_display = "Permanent"
                else:
                    job_type_display = requirement.job_type

            # Format date from Requirement.created_at
            requirement_date = requirement.created_at.strftime('%Y-%m-%d') if requirement.created_at else None

            rows.append({
                'sr_no': idx,
                'date': requirement_date,
                'recruiter_name': recruiter_name,
                'client_name': requirement.company_name,
                'candidate_name': profile.candidate_name,
                'requirement': requirement.job_title,
                'contract_permanent': job_type_display,
                'contact_number': str(profile.contact_no) if profile.contact_no else None,
                'email_id': profile.email_id,
                'total_exp': float(profile.total_experience) if profile.total_experience else None,
                'relevant_exp': float(profile.relevant_experience) if profile.relevant_experience else None,
                'current_company': profile.current_company,
                'reason_for_job_change': "",  # Empty as per requirements
                'location': profile.location,
                'notice_period': profile.notice_period_days,
                'current_ctc': float(profile.ctc_current) if profile.ctc_current else None,
                'expected_ctc': float(profile.ctc_expected) if profile.ctc_expected else None,
                'resume_shortlist': resume_shortlist,
                'interview_round_1_date': interview_round_1_date,
                'interview_round_1_feedback': "",  # Empty as per requirements
                'interview_round_2_date': interview_round_2_date,
                'interview_round_2_feedback': "",  # Empty as per requirements
                'final_yn': "",  # Empty as per requirements
                'comment': ""  # Empty as per requirements
            })

        return jsonify({
            'success': True,
            'data': rows
        })
    except Exception as e:
        current_app.logger.error(f"Error generating internal tracker report: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to generate report'}), 500


