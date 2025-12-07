from flask import Blueprint, jsonify, request, current_app, g
from app.models.user import User
from app.middleware.domain_auth import require_jwt_domain_auth, ensure_domain_isolation
from flask_jwt_extended import create_access_token
from datetime import datetime, timedelta
import random

# Create blueprint for login/auth endpoints
login_api_bp = Blueprint('login_api', __name__, url_prefix='/api')

def get_db_session():
    """
    Get the correct database session for the current domain.
    Returns domain-specific session if available, otherwise falls back to global session.
    """
    try:
        # Check if we have a domain-specific session
        if hasattr(g, 'db_session') and g.db_session is not None:
            # Verify it's a valid session object
            if hasattr(g.db_session, 'query'):
                return g.db_session
        
        # Fallback to global session for backward compatibility
        from app.database import db
        try:
            # This gets the actual SQLAlchemy session
            session = db.session
            if hasattr(session, 'query'):
                return session
            else:
                current_app.logger.error("db.session does not have query method")
                # Try to create a new session from the engine
                from sqlalchemy.orm import sessionmaker
                Session = sessionmaker(bind=db.engine)
                return Session()
        except Exception as session_error:
            current_app.logger.error(f"Error accessing db.session: {str(session_error)}")
            # Last resort: try to create session from engine
            try:
                from sqlalchemy.orm import sessionmaker
                from app.database import db
                Session = sessionmaker(bind=db.engine)
                return Session()
            except Exception as engine_error:
                current_app.logger.error(f"Error creating session from engine: {str(engine_error)}")
                raise Exception("Cannot create database session")
        
    except Exception as e:
        # If there's any error, log it and re-raise
        current_app.logger.error(f"Critical error in get_db_session: {str(e)}")
        raise e

# Unified Authentication Endpoints
@login_api_bp.route('/login', methods=['POST'])
def login():
    """Unified login for both admin and recruiter users with domain isolation"""
    try:
        current_app.logger.info("Login endpoint called")
        data = request.get_json()
        current_app.logger.info(f"Received data: {data}")
        
        username = data.get('username')
        password = data.get('password')
        
        current_app.logger.info(f"Username: {username}, Password: {password}")
        
        if not username or not password:
            current_app.logger.warning("Missing username or password")
            return jsonify({
                'status': 'error',
                'message': 'Username and password are required'
            }), 400
        
        # Get domain from custom header or fallback to detection
        domain = request.headers.get('X-Original-Domain')
        if not domain:
            domain = request.headers.get('X-Domain')
        
        # Ensure domain database isolation before authentication
        if not ensure_domain_isolation():
            current_app.logger.error(f"Failed to ensure domain database isolation for domain: {domain}")
            return jsonify({
                'status': 'error',
                'message': 'Database not available for this domain'
            }), 503
        
        # Get domain-specific database session
        if not hasattr(g, 'db_session') or g.db_session is None:
            current_app.logger.error("No database session available for domain")
            return jsonify({
                'status': 'error',
                'message': 'Database session not available for this domain'
            }), 503
        
        # Find user by username in domain-specific database
        user = g.db_session.query(User).filter_by(username=username).first()
        current_app.logger.info(f"User found: {user}")
        
        if not user:
            current_app.logger.warning(f"No user found with username: {username}")
            return jsonify({
                'status': 'error',
                'message': 'Invalid username or password'
            }), 401
        
        # Check password using the new hashing method
        if not user.check_password(password):
            current_app.logger.warning(f"Password mismatch for user: {username}")
            return jsonify({
                'status': 'error',
                'message': 'Invalid username or password'
            }), 401
        
        # Create JWT token with additional claims for stateless validation
        # This allows JWT validation without database queries
        access_token = create_access_token(
            identity=username,
            additional_claims={
                'domain': domain,
                'role': user.role,
                'user_id': str(user.user_id) if user.user_id else None,
                'email': user.email,
                'full_name': user.full_name
            }
        )
        
        current_app.logger.info(f"Login successful for user: {username}")
        return jsonify({
            'status': 'success',
            'message': 'Login successful',
            'access_token': access_token,
            'user': user.to_dict()
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in login: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to login'
        }), 500

@login_api_bp.route('/signup', methods=['POST'])
def signup():
    """Unified signup for both admin and recruiter users with domain isolation"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        email = data.get('email')
        full_name = data.get('full_name')
        phone_number = data.get('phone_number')
        role = data.get('role', 'recruiter')  # Default to recruiter if not specified
        
        if not username or not password or not full_name or not email:
            return jsonify({
                'status': 'error',
                'message': 'username, password, full_name, and email are required'
            }), 400
        
        # Validate role
        if role not in ['admin', 'recruiter']:
            return jsonify({
                'status': 'error',
                'message': 'Invalid role. Must be either "admin" or "recruiter"'
            }), 400
        
        # Validate phone number (optional but if present must be 10 digits)
        if phone_number is not None:
            phone_str = str(phone_number)
            if not phone_str.isdigit() or len(phone_str) != 10:
                return jsonify({
                    'status': 'error',
                    'message': 'phone_number must be a 10-digit number'
                }), 400
        
        # Get domain from custom header or fallback to detection
        domain = request.headers.get('X-Original-Domain')
        if not domain:
            domain = request.headers.get('X-Domain')
        
        # Ensure domain database isolation before user creation
        if not ensure_domain_isolation():
            current_app.logger.error(f"Failed to ensure domain database isolation for domain: {domain}")
            return jsonify({
                'status': 'error',
                'message': 'Database not available for this domain'
            }), 503
        
        # Get domain-specific database session
        if not hasattr(g, 'db_session') or g.db_session is None:
            current_app.logger.error("No database session available for domain")
            return jsonify({
                'status': 'error',
                'message': 'Database session not available for this domain'
            }), 503
        
        # Check if username already exists in domain-specific database
        existing_user = g.db_session.query(User).filter_by(username=username).first()
        if existing_user:
            return jsonify({
                'status': 'error',
                'message': 'Username already exists'
            }), 409
        
        # Check if email already exists in domain-specific database (excluding temporary users)
        existing_email = g.db_session.query(User).filter(User.email == email, User.username.notlike('temp_%')).first()
        if existing_email:
            return jsonify({
                'status': 'error',
                'message': 'Email already exists'
            }), 409
        
        # Check if there's a temporary user with this email in domain-specific database (indicating OTP verification)
        temp_user = g.db_session.query(User).filter(User.email == email, User.username.like('temp_%')).first()
        if not temp_user:
            # Check if there's already a permanent user with this email in domain-specific database
            permanent_user = g.db_session.query(User).filter(User.email == email, User.username.notlike('temp_%')).first()
            if permanent_user:
                return jsonify({
                    'status': 'error',
                    'message': 'An account with this email already exists. Please try logging in instead.'
                }), 409
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Please verify your email address first by sending and verifying an OTP'
                }), 400
        
        # Update the temporary user with the actual user data
        role_value = 'admin' if role == 'admin' else 'recruiter'
        
        # Update the temporary user with the real user data
        temp_user.username = username
        temp_user.full_name = full_name
        temp_user.role = role_value
        temp_user.otp = None  # Clear OTP
        temp_user.otp_expiry_time = None  # Clear OTP expiry
        
        if phone_number is not None:
            # store as numeric field; SQLAlchemy Numeric accepts str or int
            temp_user.phone_number = int(phone_number)
        
        # Set the new password
        temp_user.set_password(password)
        
        # Commit the changes using domain-specific database session
        g.db_session.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'{role.capitalize()} account created successfully',
            'user': temp_user.to_dict()
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error in signup: {str(e)}")
        if hasattr(g, 'db_session') and g.db_session is not None:
            g.db_session.rollback()
        
        # Check if it's a unique constraint violation
        if 'UniqueViolation' in str(e) or 'duplicate key' in str(e):
            if 'email' in str(e):
                return jsonify({
                    'status': 'error',
                    'message': 'An account with this email already exists. Please try logging in instead.'
                }), 409
            elif 'username' in str(e):
                return jsonify({
                    'status': 'error',
                    'message': 'Username already exists. Please choose a different username.'
                }), 409
        
        return jsonify({
            'status': 'error',
            'message': 'Failed to create account'
        }), 500

@login_api_bp.route('/auth/current-user', methods=['GET'])
@require_jwt_domain_auth
def get_current_user():
    """Get current authenticated user information with JWT and domain isolation"""
    try:
        # User is already authenticated and available in request context
        user = getattr(request, 'current_user', None)
        if user:
            return jsonify({
                'status': 'success',
                'user': user.to_dict()
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'User not found'
            }), 404
            
    except Exception as e:
        current_app.logger.error(f"Error getting current user: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to get current user'
        }), 500

@login_api_bp.route('/auth/current-user', methods=['PUT'])
@require_jwt_domain_auth
def update_current_user():
    """Update current authenticated user profile with JWT and domain isolation"""
    try:
        # Get user info from JWT (SimpleNamespace)
        jwt_user = getattr(request, 'current_user', None)
        if not jwt_user:
            return jsonify({
                'status': 'error',
                'message': 'User not found'
            }), 404
        
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'No data provided'
            }), 400
        
        # Get domain-specific database session
        if not hasattr(g, 'db_session') or g.db_session is None:
            current_app.logger.error("No database session available for domain")
            return jsonify({
                'status': 'error',
                'message': 'Database session not available for this domain'
            }), 503
        
        session = g.db_session
        
        # Fetch actual User model instance from database (needed for check_password and set_password methods)
        user = session.query(User).filter_by(user_id=jwt_user.user_id).first()
        if not user:
            return jsonify({
                'status': 'error',
                'message': 'User not found in database'
            }), 404
        
        updated = False
        
        # Update full_name if provided
        if 'full_name' in data and data['full_name']:
            user.full_name = data['full_name']
            updated = True
        
        # Update username if provided
        if 'username' in data and data['username']:
            new_username = data['username'].strip()
            if new_username != user.username:
                # Check if username already exists
                existing_user = session.query(User).filter(
                    User.username == new_username,
                    User.user_id != user.user_id
                ).first()
                if existing_user:
                    return jsonify({
                        'status': 'error',
                        'message': 'Username already exists'
                    }), 409
                user.username = new_username
                updated = True
        
        # Update phone_number if provided
        if 'phone_number' in data:
            phone_number = data['phone_number']
            if phone_number is not None and phone_number != '':
                phone_str = str(phone_number).strip()
                # Validate phone number format (10 digits)
                if not phone_str.isdigit() or len(phone_str) != 10:
                    return jsonify({
                        'status': 'error',
                        'message': 'Phone number must be a 10-digit number'
                    }), 400
                # Check if phone number already exists
                existing_user = session.query(User).filter(
                    User.phone_number == int(phone_str),
                    User.user_id != user.user_id
                ).first()
                if existing_user:
                    return jsonify({
                        'status': 'error',
                        'message': 'Phone number already exists'
                    }), 409
                user.phone_number = int(phone_str)
            else:
                user.phone_number = None
            updated = True
        
        # Update password if provided
        if 'password' in data and data['password']:
            new_password = data['password']
            current_password = data.get('current_password')
            
            # Require current password for password change
            if not current_password:
                return jsonify({
                    'status': 'error',
                    'message': 'Current password is required to change password'
                }), 400
            
            # Verify current password
            if not user.check_password(current_password):
                return jsonify({
                    'status': 'error',
                    'message': 'Current password is incorrect'
                }), 401
            
            # Validate new password length
            if len(new_password) < 6:
                return jsonify({
                    'status': 'error',
                    'message': 'Password must be at least 6 characters long'
                }), 400
            
            # Set new password (will be hashed)
            user.set_password(new_password)
            updated = True
        
        if updated:
            # Update updated_at timestamp
            user.updated_at = datetime.utcnow()
            session.commit()
            current_app.logger.info(f"User profile updated: {user.username}")
        
        return jsonify({
            'status': 'success',
            'message': 'Profile updated successfully',
            'user': user.to_dict()
        }), 200
            
    except Exception as e:
        current_app.logger.error(f"Error updating current user: {str(e)}")
        if hasattr(g, 'db_session') and g.db_session is not None:
            g.db_session.rollback()
        return jsonify({
            'status': 'error',
            'message': 'Failed to update profile'
        }), 500

@login_api_bp.route('/auth/send-otp', methods=['POST'])
def send_otp():
    """Send OTP to email for verification"""
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({
                'status': 'error',
                'message': 'Email is required'
            }), 400
        
        # Check if email already exists
        existing_user = get_db_session().query(User).filter_by(email=email).first()
        if existing_user:
            return jsonify({
                'status': 'error',
                'message': 'Email already exists'
            }), 409
        
        # Generate 6-digit OTP
        otp = random.randint(100000, 999999)
        
        # Store OTP in database (we'll create a temporary record or use a separate OTP table)
        # For now, we'll store it in a temporary way
        otp_expiry = datetime.utcnow() + timedelta(minutes=10)  # OTP expires in 10 minutes
        
        # For simplicity, we'll create a temporary user record with OTP
        # In production, you might want to use a separate OTP table
        temp_user = User(
            username=f"temp_{email}_{datetime.utcnow().timestamp()}",
            full_name="Temporary User",
            email=email,
            password="temp_password",  # This will be replaced when user completes signup
            otp=otp,
            otp_expiry_time=otp_expiry
        )
        temp_user.set_password("temp_password")
        
        get_db_session().add(temp_user)
        get_db_session().commit()
        
        # Send OTP via email
        try:
            from app.services.email_service import EmailService
            email_service = EmailService()
            
            subject = "Email Verification OTP"
            html_content = f"""
            <html>
            <body>
                <h2>Email Verification</h2>
                <p>Your verification code is: <strong>{otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
                <p>If you did not request this code, please ignore this email.</p>
            </body>
            </html>
            """
            
            email_sent = email_service.send_email(email, subject, html_content)
            
            if email_sent:
                return jsonify({
                    'status': 'success',
                    'message': 'OTP sent successfully'
                }), 200
            else:
                # If email sending fails, clean up the temp user
                get_db_session().delete(temp_user)
                get_db_session().commit()
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to send OTP email'
                }), 500
                
        except Exception as e:
            # If email sending fails, clean up the temp user
            get_db_session().delete(temp_user)
            get_db_session().commit()
            current_app.logger.error(f"Error sending OTP email: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Failed to send OTP email'
            }), 500
        
    except Exception as e:
        current_app.logger.error(f"Error in send_otp: {str(e)}")
        get_db_session().rollback()
        return jsonify({
            'status': 'error',
            'message': 'Failed to send OTP'
        }), 500

@login_api_bp.route('/auth/verify-otp', methods=['POST'])
def verify_otp():
    """Verify OTP for email verification"""
    try:
        data = request.get_json()
        email = data.get('email')
        otp = data.get('otp')
        
        if not email or not otp:
            return jsonify({
                'status': 'error',
                'message': 'Email and OTP are required'
            }), 400
        
        # Find the temporary user with the email and OTP
        temp_user = get_db_session().query(User).filter_by(email=email, otp=otp).first()
        
        if not temp_user:
            return jsonify({
                'status': 'error',
                'message': 'Invalid OTP'
            }), 400
        
        # Check if OTP has expired
        if temp_user.otp_expiry_time and temp_user.otp_expiry_time < datetime.utcnow():
            get_db_session().delete(temp_user)
            get_db_session().commit()
            return jsonify({
                'status': 'error',
                'message': 'OTP has expired'
            }), 400
        
        # OTP is valid, we can mark it as verified
        # In a real implementation, you might want to store this verification status
        # For now, we'll just return success
        return jsonify({
            'status': 'success',
            'message': 'OTP verified successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in verify_otp: {str(e)}")
        get_db_session().rollback()
        return jsonify({
            'status': 'error',
            'message': 'Failed to verify OTP'
        }), 500

@login_api_bp.route('/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Send OTP to email for password reset - only for permanent users"""
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({
                'status': 'error',
                'message': 'Email is required'
            }), 400
        
        # Get domain-specific database session
        if not hasattr(g, 'db_session') or g.db_session is None:
            # Try to ensure domain isolation
            if not ensure_domain_isolation():
                return jsonify({
                    'status': 'error',
                    'message': 'Database not available for this domain'
                }), 503
            session = g.db_session
        else:
            session = g.db_session
        
        # Check if a permanent (non-temporary) user exists with this email
        # Exclude temporary users (username starting with 'temp_')
        user = session.query(User).filter(
            User.email == email,
            ~User.username.like('temp_%')  # Exclude temporary users
        ).first()
        
        # CRITICAL: Only proceed if a PERMANENT user exists
        # If no permanent user exists, return error - do NOT send email
        if not user:
            return jsonify({
                'status': 'error',
                'message': 'No user found with this email address'
            }), 404
        
        # Double-check: Ensure the user is NOT a temporary user (defensive check)
        if user.username.startswith('temp_'):
            return jsonify({
                'status': 'error',
                'message': 'No user found with this email address'
            }), 404
        
        # Only proceed if a permanent user exists
        # Generate 6-digit OTP
        otp = random.randint(100000, 999999)
        
        # Store OTP in user record
        otp_expiry = datetime.utcnow() + timedelta(minutes=10)  # OTP expires in 10 minutes
        
        user.otp = otp
        user.otp_expiry_time = otp_expiry
        session.commit()
        
        # Send OTP via email - ONLY if permanent user exists
        try:
            from app.services.email_service import EmailService
            email_service = EmailService()
            
            subject = "Password Reset OTP"
            html_content = f"""
            <html>
            <body>
                <h2>Password Reset Request</h2>
                <p>You have requested to reset your password.</p>
                <p>Your verification code is: <strong>{otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
                <p>If you did not request this code, please ignore this email.</p>
            </body>
            </html>
            """
            
            email_sent = email_service.send_email(email, subject, html_content)
            
            if email_sent:
                return jsonify({
                    'status': 'success',
                    'message': 'OTP has been sent to your email'
                }), 200
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to send OTP email'
                }), 500
                
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': 'Failed to send OTP email'
            }), 500
        
    except Exception as e:
        if hasattr(g, 'db_session') and g.db_session is not None:
            g.db_session.rollback()
        return jsonify({
            'status': 'error',
            'message': 'Failed to process password reset request'
        }), 500

@login_api_bp.route('/auth/reset-password', methods=['POST'])
def reset_password():
    """Reset password using OTP"""
    try:
        data = request.get_json()
        email = data.get('email')
        otp = data.get('otp')
        new_password = data.get('new_password')
        
        if not email or not otp or not new_password:
            return jsonify({
                'status': 'error',
                'message': 'Email, OTP, and new password are required'
            }), 400
        
        # Validate new password length
        if len(new_password) < 6:
            return jsonify({
                'status': 'error',
                'message': 'Password must be at least 6 characters long'
            }), 400
        
        # Get domain-specific database session
        if not hasattr(g, 'db_session') or g.db_session is None:
            # Try to ensure domain isolation
            if not ensure_domain_isolation():
                return jsonify({
                    'status': 'error',
                    'message': 'Database not available for this domain'
                }), 503
            session = g.db_session
        else:
            session = g.db_session
        
        # Find user with the email and OTP (exclude temporary users)
        user = session.query(User).filter(
            User.email == email,
            User.otp == otp,
            ~User.username.like('temp_%')  # Exclude temporary users
        ).first()
        
        if not user:
            return jsonify({
                'status': 'error',
                'message': 'Invalid OTP or email'
            }), 400
        
        # Check if OTP has expired
        if user.otp_expiry_time and user.otp_expiry_time < datetime.utcnow():
            user.otp = None
            user.otp_expiry_time = None
            session.commit()
            return jsonify({
                'status': 'error',
                'message': 'OTP has expired'
            }), 400
        
        # Reset password
        user.set_password(new_password)
        user.otp = None
        user.otp_expiry_time = None
        session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Password reset successfully'
        }), 200
        
    except Exception as e:
        if hasattr(g, 'db_session') and g.db_session is not None:
            g.db_session.rollback()
        return jsonify({
            'status': 'error',
            'message': 'Failed to reset password'
        }), 500

@login_api_bp.route('/recruiter/login', methods=['POST'])
def recruiter_login():
    """Login for existing recruiter with domain isolation"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({
                'status': 'error',
                'message': 'Username and password are required'
            }), 400
        
        # Get domain from custom header or fallback to detection
        domain = request.headers.get('X-Original-Domain')
        if not domain:
            domain = request.headers.get('X-Domain')
        
        # Ensure domain database isolation before authentication
        if not ensure_domain_isolation():
            current_app.logger.error(f"Failed to ensure domain database isolation for domain: {domain}")
            return jsonify({
                'status': 'error',
                'message': 'Database not available for this domain'
            }), 503
        
        # Get domain-specific database session
        if not hasattr(g, 'db_session') or g.db_session is None:
            current_app.logger.error("No database session available for domain")
            return jsonify({
                'status': 'error',
                'message': 'Database session not available for this domain'
            }), 503
        
        # Find user by username in domain-specific database
        user = g.db_session.query(User).filter_by(username=username).first()
        
        if not user or not user.check_password(password):
            return jsonify({
                'status': 'error',
                'message': 'Invalid username or password'
            }), 401
        
        # Create JWT token with additional claims for stateless validation
        # This allows JWT validation without database queries
        access_token = create_access_token(
            identity=username,
            additional_claims={
                'domain': domain,
                'role': user.role,
                'user_id': str(user.user_id) if user.user_id else None,
                'email': user.email,
                'full_name': user.full_name
            }
        )
        
        return jsonify({
            'status': 'success',
            'message': 'Login successful',
            'access_token': access_token,
            'user': user.to_dict()
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in recruiter login: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to login'
        }), 500

