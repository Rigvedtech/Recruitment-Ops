"""
Career Portal API - Public endpoints for job seekers to browse job openings.

This API is PUBLIC - no authentication required for browsing jobs.
Job data is fetched live from the requirements table (all non-deleted requirements).

Endpoints:
- GET /api/careers/jobs - List jobs with pagination, filters, search
- GET /api/careers/jobs/<request_id> - Get single job details
- GET /api/careers/filters - Get all filter options for dropdowns
- GET /api/careers/search-suggestions - Autocomplete suggestions
- GET /api/careers/stats - Get portal statistics
"""

from flask import Blueprint, jsonify, request, current_app, g
from app.database import db
from app.models.requirement import Requirement
from app.models.skills import Skills
from sqlalchemy import or_, and_, func, text, desc, asc, cast, String
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta
import math

career_portal_bp = Blueprint('career_portal', __name__, url_prefix='/api/careers')


def get_db_session():
    """
    Get the correct database session for the current domain.
    Returns domain-specific session if available, otherwise falls back to global session.
    """
    try:
        if hasattr(g, 'db_session') and g.db_session is not None:
            if hasattr(g.db_session, 'query'):
                return g.db_session
        return db.session
    except Exception as e:
        current_app.logger.error(f"Error in get_db_session: {str(e)}")
        return db.session


def format_experience_range(exp_range):
    """Format experience range for display"""
    if not exp_range:
        return None
    return exp_range


def format_posted_date(created_at):
    """Format posting date as relative time"""
    if not created_at:
        return None
    
    now = datetime.utcnow()
    diff = now - created_at
    
    if diff.days == 0:
        if diff.seconds < 3600:
            minutes = diff.seconds // 60
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        hours = diff.seconds // 3600
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif diff.days == 1:
        return "Yesterday"
    elif diff.days < 7:
        return f"{diff.days} days ago"
    elif diff.days < 30:
        weeks = diff.days // 7
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    elif diff.days < 365:
        months = diff.days // 30
        return f"{months} month{'s' if months != 1 else ''} ago"
    else:
        return created_at.strftime("%B %d, %Y")


def format_job_for_listing(req):
    """Format a requirement object for job listing display"""
    return {
        'request_id': req.request_id,
        'job_title': req.job_title,
        'department': req.department,
        'location': req.location,
        'company_name': req.company_name,
        'job_type': req.job_type,
        'shift': req.shift,
        'experience_range': format_experience_range(req.experience_range),
        'number_of_positions': req.number_of_positions,
        'priority': req.priority,
        'status': req.status,
        'posted_date': req.job_posted_at.isoformat() if req.job_posted_at else req.created_at.isoformat() if req.created_at else None,
        'posted_date_relative': format_posted_date(req.job_posted_at or req.created_at),
        'is_new': (datetime.utcnow() - (req.job_posted_at or req.created_at)).days <= 7 if (req.job_posted_at or req.created_at) else False,
        'is_urgent': req.priority == 'High' if req.priority else False,
    }


def format_job_for_details(req):
    """Format a requirement object for job details page"""
    base = format_job_for_listing(req)
    base.update({
        'job_description': req.job_description,
        'minimum_qualification': req.minimum_qualification,
        'budget_ctc': req.budget_ctc,
        'hiring_manager': req.hiring_manager,
        'additional_remarks': req.additional_remarks,
        'tentative_doj': req.tentative_doj.isoformat() if req.tentative_doj else None,
        'jd_file_name': req.job_file_name,
        'created_at': req.created_at.isoformat() if req.created_at else None,
    })
    return base


# ============================================================================
# PUBLIC ENDPOINTS - No Authentication Required
# ============================================================================

@career_portal_bp.route('/jobs', methods=['GET'])
def get_jobs():
    """
    Get list of posted job openings with pagination, filtering, and search.
    
    Query Parameters:
    - page (int): Page number (default: 1)
    - per_page (int): Items per page (default: 12, max: 50)
    - search (str): Search query for job title, description, skills
    - location (str): Filter by location (comma-separated for multiple)
    - department (str): Filter by department (comma-separated for multiple)
    - job_type (str): Filter by job type (comma-separated for multiple)
    - experience (str): Filter by experience range
    - company (str): Filter by company name (comma-separated for multiple)
    - status (str): Filter by status (excludes Closed and On_Hold by default)
    - posted_within (str): Filter by posting date (7d, 30d, 90d)
    - sort_by (str): Sort field (newest, oldest, relevance, title)
    
    Returns:
    - jobs: Array of job objects
    - pagination: Pagination metadata
    - filters_applied: Currently applied filters
    """
    try:
        session = get_db_session()
        
        # Pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 12, type=int), 50)
        
        # Filter parameters
        search_query = request.args.get('search', '').strip()
        locations = request.args.get('location', '').strip()
        departments = request.args.get('department', '').strip()
        job_types = request.args.get('job_type', '').strip()
        experience = request.args.get('experience', '').strip()
        companies = request.args.get('company', '').strip()
        status_filter = request.args.get('status', '').strip()
        posted_within = request.args.get('posted_within', '').strip()
        sort_by = request.args.get('sort_by', 'newest').strip()
        
        # Statuses to exclude from career portal
        EXCLUDED_STATUSES = ['Closed', 'On_Hold']
        
        # Base query - only non-deleted jobs, excluding Closed and On_Hold
        query = session.query(Requirement).filter(
            Requirement.is_deleted == False,
            ~Requirement.status.in_(EXCLUDED_STATUSES)
        )
        
        # Apply additional status filter if provided
        if status_filter and status_filter.lower() != 'all':
            status_list = [s.strip() for s in status_filter.split(',') if s.strip()]
            # Filter out excluded statuses from user request
            status_list = [s for s in status_list if s not in EXCLUDED_STATUSES]
            if status_list:
                query = query.filter(Requirement.status.in_(status_list))
        
        # Apply search filter
        if search_query:
            search_pattern = f"%{search_query}%"
            # Note: department and company_name are PostgreSQL ENUMs - must cast to String for ILIKE
            query = query.filter(
                or_(
                    Requirement.job_title.ilike(search_pattern),
                    Requirement.job_description.ilike(search_pattern),
                    Requirement.location.ilike(search_pattern),
                    cast(Requirement.department, String).ilike(search_pattern),
                    cast(Requirement.company_name, String).ilike(search_pattern),
                    Requirement.minimum_qualification.ilike(search_pattern)
                )
            )
        
        # Apply location filter
        if locations:
            location_list = [loc.strip() for loc in locations.split(',') if loc.strip()]
            if location_list:
                query = query.filter(Requirement.location.in_(location_list))
        
        # Apply department filter
        if departments:
            dept_list = [d.strip() for d in departments.split(',') if d.strip()]
            if dept_list:
                query = query.filter(Requirement.department.in_(dept_list))
        
        # Apply job type filter
        if job_types:
            type_list = [t.strip() for t in job_types.split(',') if t.strip()]
            if type_list:
                query = query.filter(Requirement.job_type.in_(type_list))
        
        # Apply company filter
        if companies:
            company_list = [c.strip() for c in companies.split(',') if c.strip()]
            if company_list:
                query = query.filter(Requirement.company_name.in_(company_list))
        
        # Apply experience filter
        if experience:
            query = query.filter(Requirement.experience_range.ilike(f"%{experience}%"))
        
        # Apply posted_within filter
        if posted_within:
            days_map = {'7d': 7, '30d': 30, '90d': 90}
            days = days_map.get(posted_within)
            if days:
                cutoff_date = datetime.utcnow() - timedelta(days=days)
                query = query.filter(
                    or_(
                        Requirement.job_posted_at >= cutoff_date,
                        and_(
                            Requirement.job_posted_at.is_(None),
                            Requirement.created_at >= cutoff_date
                        )
                    )
                )
        
        # Apply sorting
        if sort_by == 'newest':
            query = query.order_by(
                desc(func.coalesce(Requirement.job_posted_at, Requirement.created_at))
            )
        elif sort_by == 'oldest':
            query = query.order_by(
                asc(func.coalesce(Requirement.job_posted_at, Requirement.created_at))
            )
        elif sort_by == 'title':
            query = query.order_by(asc(Requirement.job_title))
        else:  # relevance - default to newest for now
            query = query.order_by(
                desc(func.coalesce(Requirement.job_posted_at, Requirement.created_at))
            )
        
        # Get total count before pagination
        total_count = query.count()
        
        # Apply pagination
        total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1
        offset = (page - 1) * per_page
        jobs = query.offset(offset).limit(per_page).all()
        
        # Format jobs for response
        jobs_data = [format_job_for_listing(job) for job in jobs]
        
        return jsonify({
            'success': True,
            'data': {
                'jobs': jobs_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': total_pages,
                    'has_next': page < total_pages,
                    'has_prev': page > 1
                },
                'filters_applied': {
                    'search': search_query if search_query else None,
                    'location': locations if locations else None,
                    'department': departments if departments else None,
                    'job_type': job_types if job_types else None,
                    'experience': experience if experience else None,
                    'company': companies if companies else None,
                    'status': status_filter,
                    'posted_within': posted_within if posted_within else None,
                    'sort_by': sort_by
                }
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching jobs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch jobs',
            'message': str(e)
        }), 500


@career_portal_bp.route('/jobs/<string:request_id>', methods=['GET'])
def get_job_details(request_id):
    """
    Get detailed information for a specific job opening.
    
    Path Parameters:
    - request_id: The job/requirement ID (e.g., "Req001")
    
    Returns:
    - job: Complete job details object
    - related_jobs: Array of similar jobs (same department/location)
    """
    try:
        session = get_db_session()
        
        # Fetch the job
        job = session.query(Requirement).filter(
            Requirement.request_id == request_id,
            Requirement.is_deleted == False
        ).first()
        
        if not job:
            return jsonify({
                'success': False,
                'error': 'Job not found',
                'message': f'No job found with ID: {request_id}'
            }), 404
        
        # Fetch related jobs (same department or location, excluding current)
        # Exclude Closed and On_Hold statuses
        related_query = session.query(Requirement).filter(
            Requirement.request_id != request_id,
            Requirement.is_deleted == False,
            ~Requirement.status.in_(['Closed', 'On_Hold']),
            or_(
                Requirement.department == job.department,
                Requirement.location == job.location
            )
        ).order_by(
            desc(func.coalesce(Requirement.job_posted_at, Requirement.created_at))
        ).limit(4)
        
        related_jobs = [format_job_for_listing(j) for j in related_query.all()]
        
        return jsonify({
            'success': True,
            'data': {
                'job': format_job_for_details(job),
                'related_jobs': related_jobs
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching job details: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch job details',
            'message': str(e)
        }), 500


@career_portal_bp.route('/filters', methods=['GET'])
def get_filter_options():
    """
    Get all available filter options for the job listings.
    Returns distinct values from posted jobs only.
    
    Returns:
    - locations: Array of distinct locations
    - departments: Array of distinct departments
    - job_types: Array of distinct job types
    - companies: Array of distinct company names
    - experience_ranges: Array of distinct experience ranges
    """
    try:
        session = get_db_session()
        
        # Base filter - exclude Closed and On_Hold statuses
        base_filter = and_(
            Requirement.is_deleted == False,
            ~Requirement.status.in_(['Closed', 'On_Hold'])
        )
        
        # Get distinct locations
        locations = session.query(Requirement.location).filter(
            base_filter,
            Requirement.location.isnot(None),
            Requirement.location != ''
        ).distinct().order_by(Requirement.location).all()
        
        # Get distinct departments
        # Note: department is PostgreSQL ENUM - cannot compare with empty string
        departments = session.query(Requirement.department).filter(
            base_filter,
            Requirement.department.isnot(None)
        ).distinct().order_by(Requirement.department).all()
        
        # Get distinct job types
        # Note: job_type is PostgreSQL ENUM - cannot compare with empty string
        job_types = session.query(Requirement.job_type).filter(
            base_filter,
            Requirement.job_type.isnot(None)
        ).distinct().order_by(Requirement.job_type).all()
        
        # Get distinct companies
        # Note: company_name is PostgreSQL ENUM - cannot compare with empty string
        companies = session.query(Requirement.company_name).filter(
            base_filter,
            Requirement.company_name.isnot(None)
        ).distinct().order_by(Requirement.company_name).all()
        
        # Get distinct experience ranges
        experience_ranges = session.query(Requirement.experience_range).filter(
            base_filter,
            Requirement.experience_range.isnot(None),
            Requirement.experience_range != ''
        ).distinct().order_by(Requirement.experience_range).all()
        
        # Get distinct shifts (work mode)
        # Note: shift is PostgreSQL ENUM - cannot compare with empty string
        shifts = session.query(Requirement.shift).filter(
            base_filter,
            Requirement.shift.isnot(None)
        ).distinct().order_by(Requirement.shift).all()
        
        return jsonify({
            'success': True,
            'data': {
                'locations': [loc[0] for loc in locations if loc[0]],
                'departments': [dept[0] for dept in departments if dept[0]],
                'job_types': [jt[0] for jt in job_types if jt[0]],
                'companies': [comp[0] for comp in companies if comp[0]],
                'experience_ranges': [exp[0] for exp in experience_ranges if exp[0]],
                'shifts': [s[0] for s in shifts if s[0]],
                'posted_within_options': [
                    {'value': '7d', 'label': 'Last 7 days'},
                    {'value': '30d', 'label': 'Last 30 days'},
                    {'value': '90d', 'label': 'Last 90 days'}
                ],
                'sort_options': [
                    {'value': 'newest', 'label': 'Newest First'},
                    {'value': 'oldest', 'label': 'Oldest First'},
                    {'value': 'title', 'label': 'Job Title (A-Z)'},
                    {'value': 'relevance', 'label': 'Most Relevant'}
                ]
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching filter options: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch filter options',
            'message': str(e)
        }), 500


@career_portal_bp.route('/search-suggestions', methods=['GET'])
def get_search_suggestions():
    """
    Get autocomplete suggestions based on search query.
    Searches job titles, locations, and departments.
    
    Query Parameters:
    - q (str): Search query (minimum 2 characters)
    - limit (int): Maximum suggestions (default: 10)
    
    Returns:
    - suggestions: Array of suggestion objects with type and value
    """
    try:
        query = request.args.get('q', '').strip()
        limit = min(request.args.get('limit', 10, type=int), 20)
        
        if len(query) < 2:
            return jsonify({
                'success': True,
                'data': {'suggestions': []}
            }), 200
        
        session = get_db_session()
        search_pattern = f"%{query}%"
        
        # Exclude Closed and On_Hold statuses
        base_filter = and_(
            Requirement.is_deleted == False,
            ~Requirement.status.in_(['Closed', 'On_Hold'])
        )
        
        suggestions = []
        
        # Search job titles
        titles = session.query(Requirement.job_title).filter(
            base_filter,
            Requirement.job_title.ilike(search_pattern)
        ).distinct().limit(limit // 2).all()
        
        for title in titles:
            if title[0]:
                suggestions.append({
                    'type': 'job_title',
                    'value': title[0],
                    'label': title[0],
                    'icon': 'briefcase'
                })
        
        # Search locations
        locations = session.query(Requirement.location).filter(
            base_filter,
            Requirement.location.ilike(search_pattern)
        ).distinct().limit(limit // 4).all()
        
        for loc in locations:
            if loc[0]:
                suggestions.append({
                    'type': 'location',
                    'value': loc[0],
                    'label': loc[0],
                    'icon': 'map-pin'
                })
        
        # Search departments
        # Note: department is PostgreSQL ENUM - must cast to String for ILIKE
        departments = session.query(Requirement.department).filter(
            base_filter,
            cast(Requirement.department, String).ilike(search_pattern)
        ).distinct().limit(limit // 4).all()
        
        for dept in departments:
            if dept[0]:
                suggestions.append({
                    'type': 'department',
                    'value': dept[0],
                    'label': dept[0],
                    'icon': 'building'
                })
        
        return jsonify({
            'success': True,
            'data': {
                'suggestions': suggestions[:limit],
                'query': query
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching search suggestions: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch suggestions',
            'message': str(e)
        }), 500


@career_portal_bp.route('/stats', methods=['GET'])
def get_portal_stats():
    """
    Get statistics for the career portal.
    
    Returns:
    - total_jobs: Total number of active positions
    - total_locations: Number of unique locations
    - total_departments: Number of unique departments
    - jobs_by_department: Count of jobs per department
    - jobs_by_location: Count of jobs per location
    """
    try:
        session = get_db_session()
        
        # Exclude Closed and On_Hold statuses
        base_filter = and_(
            Requirement.is_deleted == False,
            ~Requirement.status.in_(['Closed', 'On_Hold'])
        )
        
        # Total active jobs (excluding Closed and On_Hold)
        total_jobs = session.query(Requirement).filter(base_filter).count()
        
        # Total unique locations
        total_locations = session.query(
            func.count(func.distinct(Requirement.location))
        ).filter(
            base_filter,
            Requirement.location.isnot(None)
        ).scalar()
        
        # Total unique departments
        total_departments = session.query(
            func.count(func.distinct(Requirement.department))
        ).filter(
            base_filter,
            Requirement.department.isnot(None)
        ).scalar()
        
        # Jobs by department
        jobs_by_dept = session.query(
            Requirement.department,
            func.count(Requirement.requirement_id).label('count')
        ).filter(
            base_filter,
            Requirement.department.isnot(None)
        ).group_by(
            Requirement.department
        ).order_by(
            desc('count')
        ).limit(10).all()
        
        # Jobs by location
        jobs_by_loc = session.query(
            Requirement.location,
            func.count(Requirement.requirement_id).label('count')
        ).filter(
            base_filter,
            Requirement.location.isnot(None)
        ).group_by(
            Requirement.location
        ).order_by(
            desc('count')
        ).limit(10).all()
        
        # Recent jobs count (last 7 days)
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        recent_jobs = session.query(Requirement).filter(
            base_filter,
            or_(
                Requirement.job_posted_at >= recent_cutoff,
                and_(
                    Requirement.job_posted_at.is_(None),
                    Requirement.created_at >= recent_cutoff
                )
            )
        ).count()
        
        return jsonify({
            'success': True,
            'data': {
                'total_jobs': total_jobs,
                'total_locations': total_locations or 0,
                'total_departments': total_departments or 0,
                'recent_jobs': recent_jobs,
                'jobs_by_department': [
                    {'department': d[0], 'count': d[1]} 
                    for d in jobs_by_dept if d[0]
                ],
                'jobs_by_location': [
                    {'location': l[0], 'count': l[1]} 
                    for l in jobs_by_loc if l[0]
                ]
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching portal stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch statistics',
            'message': str(e)
        }), 500


@career_portal_bp.route('/featured', methods=['GET'])
def get_featured_jobs():
    """
    Get featured/highlighted job openings.
    Returns high-priority open positions.
    
    Query Parameters:
    - limit (int): Maximum jobs to return (default: 6)
    
    Returns:
    - jobs: Array of featured job objects
    """
    try:
        limit = min(request.args.get('limit', 6, type=int), 12)
        session = get_db_session()
        
        # Statuses to exclude
        excluded_statuses = ['Closed', 'On_Hold']
        
        # Get high-priority jobs (excluding Closed and On_Hold)
        jobs = session.query(Requirement).filter(
            Requirement.is_deleted == False,
            ~Requirement.status.in_(excluded_statuses),
            or_(
                Requirement.priority == 'High',
                Requirement.priority == 'Critical'
            )
        ).order_by(
            desc(func.coalesce(Requirement.job_posted_at, Requirement.created_at))
        ).limit(limit).all()
        
        # If not enough high-priority jobs, fill with newest
        if len(jobs) < limit:
            existing_ids = [j.requirement_id for j in jobs]
            additional = session.query(Requirement).filter(
                Requirement.is_deleted == False,
                ~Requirement.status.in_(excluded_statuses),
                ~Requirement.requirement_id.in_(existing_ids)
            ).order_by(
                desc(func.coalesce(Requirement.job_posted_at, Requirement.created_at))
            ).limit(limit - len(jobs)).all()
            
            jobs.extend(additional)
        
        return jsonify({
            'success': True,
            'data': {
                'jobs': [format_job_for_listing(j) for j in jobs]
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching featured jobs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch featured jobs',
            'message': str(e)
        }), 500

