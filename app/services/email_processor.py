import re
from datetime import datetime, timedelta
import html2text
import chardet
from bs4 import BeautifulSoup
import requests
from typing import Any, Dict, List, Optional, Union, cast
from flask import current_app
import os
from app.database import db
from app.models.requirement import Requirement
from app.models.profile import Profile
from app.services.tracker_service import TrackerService
from app.services.resume_parser import ResumeParser
import msal
import base64
import uuid
from sqlalchemy.orm import Session, scoped_session
from flask_sqlalchemy.session import Session
import html
import pandas as pd
from io import StringIO
import time
from config import Config

class EmailProcessor:
    def __init__(self, session: Optional[Session] = None):
        self.html2text = html2text.HTML2Text()
        self.html2text.ignore_links = True
        self.html2text.ignore_images = True
        self.html2text.ignore_tables = False
        self.html2text.body_width = 0
        self.html2text.unicode_snob = True
        self.html2text.ul_item_mark = '-'
        self.html2text.emphasis_mark = '*'
        self.html2text.strong_mark = '**'
        try:
            self.resume_parser = ResumeParser()
        except Exception as e:
            current_app.logger.warning(f"Resume parser initialization failed: {str(e)}")
            self.resume_parser = None
        
        # Initialize tracker service
        self.tracker_service = TrackerService()
        
        # Microsoft Graph API settings from config
        self.client_id = Config.MS_CLIENT_ID
        self.client_secret = Config.MS_CLIENT_SECRET
        self.authority = Config.MS_AUTHORITY
        self.scope = Config.MS_SCOPE
        self.user_email = Config.MS_USER_EMAIL
        self.session = session or db.session

    def extract_profiles_from_html(self, html_content):
        """Extract candidate profiles from HTML tables in email content"""
        profiles = []
        try:
            # Use the original HTML content for pandas.read_html to preserve table structure
            cleaned_html = html_content
            
            # Try to find tables with more flexible parsing
            tables = []
            
            # Method 1: Try pandas.read_html with different configurations
            try:
                # Try with header=0 to use first row as column names
                tables = pd.read_html(StringIO(cleaned_html), header=0)
                current_app.logger.info(f"pandas.read_html found {len(tables)} tables")
                
                # Filter tables to find candidate data tables
                candidate_tables = []
                for i, table in enumerate(tables):
                    # Check if this table contains candidate data
                    table_str = ' '.join([str(col) for col in table.columns]).lower()
                    first_row_str = ' '.join([str(val) for val in table.iloc[0] if pd.notna(val)]).lower() if not table.empty else ''
                    
                    # Look for candidate-related keywords
                    has_candidate_keywords = any(keyword in table_str + first_row_str for keyword in 
                                               ['name', 'candidate', 'experience', 'company', 'ctc', 'skill'])
                    
                    # Check table size (should have multiple rows and columns)
                    has_good_size = table.shape[0] > 1 and table.shape[1] > 3
                    
                    if has_candidate_keywords and has_good_size:
                        current_app.logger.info(f"Found candidate table {i+1}: shape={table.shape}, columns={list(table.columns)}")
                        candidate_tables.append(table)
                
                tables = candidate_tables
                
            except Exception as e:
                current_app.logger.warning(f"pandas.read_html failed: {e}")
                tables = []
                    
            # Only use pandas.read_html for profile extraction - no fallback methods

            # Process each table
            for df in tables:
                if df.empty:
                    continue
                    
                # Normalize column names and log original columns for debugging
                original_columns = list(df.columns)
                current_app.logger.info(f"Original columns: {original_columns}")
                
                # Normalize column names
                normalized_columns = [self._normalize_column_name(str(col)) for col in df.columns]
                df.columns = normalized_columns
                current_app.logger.info(f"Normalized columns: {normalized_columns}")
                
                # Handle duplicate column names by renaming them
                df.columns = pd.Index([f"{col}_{i}" if list(df.columns).count(col) > 1 and list(df.columns)[:i+1].count(col) > 1 else col 
                                     for i, col in enumerate(df.columns)])
                
                # Look for candidate name columns with more variations
                name_indicators = ['name', 'candidate', 'consultant', 'person', 'resource']
                exclude_indicators = ['vendor', 'company', 'firm', 'client', 'position']
                
                def is_candidate_name_col(col):
                    col_lower = str(col).lower()
                    has_name = any(indicator in col_lower for indicator in name_indicators)
                    has_exclude = any(indicator in col_lower for indicator in exclude_indicators)
                    return has_name and not has_exclude
                
                name_cols = [col for col in df.columns if is_candidate_name_col(col)]
                
                # If we have first_name and last_name columns, prioritize them
                if 'first_name' in df.columns and 'last_name' in df.columns:
                    name_cols = ['first_name', 'last_name'] + [col for col in name_cols if col not in ['first_name', 'last_name']]
                
                if name_cols:
                    current_app.logger.info(f"Found candidate name columns: {name_cols}")
                    
                    # Process each row
                    for idx, row in df.iterrows():
                        try:
                            # Skip header-like rows
                            row_values = [str(v) for v in row.values if pd.notna(v)]
                            row_str = ' '.join(row_values)
                            if any(header_word in row_str.lower() for header_word in ['candidate', 'name', 'experience', 'skills']):
                                if idx == 0:  # Allow first row as it might be header
                                    continue
                            
                            # Extract candidate name
                            candidate_name = None
                            
                            # Handle first_name and last_name separately
                            if 'first_name' in name_cols and 'last_name' in name_cols:
                                first_name = row.get('first_name', '') if 'first_name' in row.index else ''
                                last_name = row.get('last_name', '') if 'last_name' in row.index else ''
                                
                                if pd.notna(first_name) and pd.notna(last_name):
                                    candidate_name = f"{str(first_name).strip()} {str(last_name).strip()}".strip()
                                elif pd.notna(first_name):
                                    candidate_name = str(first_name).strip()
                                elif pd.notna(last_name):
                                    candidate_name = str(last_name).strip()
                            
                            # If no name found yet, try other name columns
                            if not candidate_name:
                                for col in name_cols:
                                    if col in row.index and col not in ['first_name', 'last_name']:
                                        value = row[col]
                                        if pd.notna(value) and str(value).strip():
                                            candidate_name = str(value).strip()
                                            break
                            
                            # Validate the extracted name
                            if candidate_name and self._is_valid_candidate_name(candidate_name):
                                pass  # Name is valid, continue
                            else:
                                continue  # Skip this row if name is invalid
                            
                            if not candidate_name or candidate_name.lower() in ['name', 'candidate', '']:
                                continue
                                
                            # Extract profile data with improved field mapping
                            profile = self._extract_profile_from_row(row, candidate_name)
                            
                            if profile and profile.get('candidate_name'):
                                profiles.append(profile)
                        except Exception as e:
                            current_app.logger.error(f"Error processing row {idx}: {str(e)}")
                            continue
            
            current_app.logger.info(f"Extracted {len(profiles)} profiles from HTML tables")
            return profiles
            
        except Exception as e:
            current_app.logger.error(f"Error extracting profiles from HTML: {str(e)}")
            return profiles

    def _normalize_column_name(self, col_name: str) -> str:
        """Normalize column names to standard format"""
        if not col_name or pd.isna(col_name):
            return ''
            
        # Convert to string and clean
        col_name = str(col_name).strip().lower()
        
        # Remove special characters but keep spaces and dots
        col_name = re.sub(r'[^\w\s\.]', '', col_name)
        
        # Handle dots in column names (e.g., "T.Exp" -> "t exp")
        col_name = col_name.replace('.', ' ')
        
        # Map common variations - updated with actual column names from the table
        mappings = {
            'sr no': 'sr_no',
            'candidate name': 'candidate_name',
            'name of candidate': 'candidate_name', 
            'first name': 'first_name',
            'last name': 'last_name',
            'total w exp': 'total_experience',
            'total exp': 'total_experience',
            'total experience': 'total_experience',
            't exp': 'total_experience',  # T.Exp from the table
            'texp': 'total_experience',
            'relevant exp': 'relevant_experience',
            'relevant experience': 'relevant_experience',
            'r exp': 'relevant_experience',  # R.Exp from the table
            'rexp': 'relevant_experience',
            'current company': 'current_company',
            'current employer': 'current_company',
            'company': 'current_company',
            'current location': 'current_location',
            'location': 'current_location',
            'contact no': 'contact_no',
            'contact number': 'contact_no',
            'mobile no': 'contact_no',
            'phone': 'contact_no',
            'mobile': 'contact_no',
            'email id': 'email_id',
            'email': 'email_id',
            'c ctc': 'current_ctc',
            'current ctc': 'current_ctc',
            'ctc current': 'current_ctc',
            'c ctc': 'current_ctc',  # C.CTC from the table
            'cctc': 'current_ctc',
            'e ctc': 'expected_ctc',
            'expected ctc': 'expected_ctc',
            'ctc expected': 'expected_ctc',
            'ectc': 'expected_ctc',  # E.CTC from the table
            'notice period': 'notice_period',
            'np': 'notice_period',
            'np days': 'notice_period',
            'education': 'education',
            'qualification': 'education',
            'graduation': 'education',
            'skills': 'skills',
            'key skills': 'skills',
            'technical skills': 'skills',
            'exp in below skills': 'skills',
            'experience in skills': 'skills',
            'skill': 'skills',
        }
        
        # Check for exact match first
        if col_name in mappings:
            return mappings[col_name]
        
        # Check for partial matches
        for key, value in mappings.items():
            if key in col_name:
                return value
                
        return col_name.replace(' ', '_')

    def _extract_profile_from_row(self, row, candidate_name: str) -> dict:
        """Extract profile data from a table row"""
        profile = {'candidate_name': candidate_name}
        
        # Field mappings with multiple possible column names - using database model field names
        field_mappings = {
            'total_experience': ['total_experience', 'total_exp', 'total_w_exp', 'exp', 't_exp'],
            'relevant_experience': ['relevant_experience', 'relevant_exp', 'r_exp'],
            'current_company': ['current_company', 'company', 'current_employer'],
            'ctc_current': ['current_ctc', 'c_ctc', 'ctc_current', 'current_salary'],
            'ctc_expected': ['expected_ctc', 'e_ctc', 'ctc_expected', 'expected_salary'],
            'notice_period_days': ['notice_period', 'np', 'np_days'],
            'location': ['current_location', 'location'],
            'education': ['education', 'qualification', 'graduation'],
            'key_skills': ['skills', 'key_skills', 'technical_skills', 'skill'],
            'contact_no': ['contact_no', 'contact_number', 'mobile_no', 'phone', 'mobile'],
            'email_id': ['email_id', 'email'],
        }
        
        for field, possible_cols in field_mappings.items():
            value = None
            for col in possible_cols:
                if col in row.index:
                    val = row.get(col)
                    if pd.notna(val) and str(val).strip() and str(val).strip().lower() not in ['nan', '', '-', 'na']:
                        value = str(val).strip()
                        break
            
            if value:
                # Clean and normalize the value
                profile[field] = self._clean_and_normalize_field_value(field, value)
        
        return profile

    def _clean_and_normalize_field_value(self, field: str, value: str) -> str:
        """Clean and normalize field values"""
        if not value or pd.isna(value):
            return ''
            
        value = str(value).strip()
        
        # Remove common unwanted text
        value = re.sub(r'(?i)\b(nan|na|n/a|nil|null)\b', '', value).strip()
        
        if not value:
            return ''
        
        if field in ['ctc_current', 'ctc_expected']:
            # Extract numeric values from CTC fields
            # Handle formats like "4Lpa", "₹16 LPA", "25k", "4.5 lac"
            value = value.lower().replace('₹', '').replace('rs.', '').replace('inr', '')
            
            # Extract numbers
            number_match = re.search(r'(\d+(?:\.\d+)?)', value)
            if number_match:
                num = float(number_match.group(1))
                
                if 'k' in value:  # Convert k to lakhs
                    num = num / 100
                elif 'lac' in value or 'lpa' in value or 'l' in value:
                    pass  # Already in lakhs
                elif num > 100:  # Assume it's in thousands if > 100
                    num = num / 100
                
                return f"{num:.1f} LPA"
            
        elif field == 'total_experience' or field == 'relevant_experience':
            # Normalize experience format
            # Handle formats like "4yrs", "5.5 years", "4+ years"
            years_match = re.search(r'(\d+(?:\.\d+)?)', value)
            if years_match:
                years = float(years_match.group(1))
                return f"{years:.1f} years"
                
        elif field == 'notice_period_days':
            # Normalize notice period
            if 'immediate' in value.lower() or 'immed' in value.lower():
                return 'Immediate'
            
            days_match = re.search(r'(\d+)\s*(?:day|month)', value.lower())
            if days_match:
                num = int(days_match.group(1))
                if 'month' in value.lower():
                    return f"{num} months"
                else:
                    return f"{num} days"
                    
        elif field == 'contact_no':
            # Clean phone numbers
            value = re.sub(r'[^\d+\-\s]', '', value)
            value = re.sub(r'\s+', '', value)
            if len(value) >= 10:
                return value
                
        return value

    def _is_valid_candidate_name(self, name: str) -> bool:
        """Validate if the extracted text looks like a valid candidate name"""
        if not name or len(name) < 2:
            return False
        
        # Check if it's too long (likely not a name)
        if len(name) > 100:
            return False
            
        # Check if it contains email or phone patterns
        if '@' in name or re.search(r'\d{10,}', name):
            return False
            
        # Check if it's mostly numbers or special characters
        if re.search(r'^[\d\s\-\+\(\)\.]+$', name):
            return False
            
        # Check if it contains common non-name patterns
        non_name_patterns = [
            r'www\.',
            r'\.com',
            r'\.in',
            r'http',
            r'toll.?free',
            r'pvt\.?\s*ltd',
            r'limited',
            r'corporation',
            r'company',
            r'technologies',
            r'solutions',
            r'services',
            r'systems',
            r'floor',
            r'building',
            r'road',
            r'street',
            r'mumbai',
            r'bangalore',
            r'delhi',
            r'pune',
            r'hyderabad',
            r'chennai',
            r'kolkata'
        ]
        
        for pattern in non_name_patterns:
            if re.search(pattern, name.lower()):
                return False
                
        return True

    def _normalize_field_name(self, field: str) -> str:
        """Normalize field names from email to match database fields"""
        if not field:
            return ''
            
        field = field.lower().strip()
        field = re.sub(r'[^a-z0-9\s_]', '', field)  # Remove special chars except underscore
        field = field.replace('**', '')  # Remove markdown bold
        
        # Map common variations to our database fields
        field_mapping = {
            'sr no': 'id',
            'name': 'candidate_name',
            'candidate': 'candidate_name',
            'candidate name': 'candidate_name',
            'name of candidate': 'candidate_name',
            'full name': 'candidate_name',
            'consultant name': 'candidate_name',
            'total experience': 'total_experience',
            'total exp': 'total_experience',
            'exp': 'total_experience',
            'relevant experience': 'relevant_experience',
            'relevant exp': 'relevant_experience',
            'notice period': 'notice_period',
            'current location': 'current_location',
            'location': 'current_location',
            'qualification': 'qualification',
            'skills': 'skills',
            'exp in below skills': 'skills',
            'experience in skills': 'skills',
            'current ctc': 'current_ctc',
            'expected ctc': 'expected_ctc',
            'contact': 'contact_no',
            'contact no': 'contact_no',
            'phone': 'contact_no',
            'mobile': 'contact_no',
            'email': 'email',
            'email id': 'email',
            'position': 'position_name',
            'position name': 'position_name',
            'job title': 'position_name'
        }
        
        # Try exact match first
        if field in field_mapping:
            return field_mapping[field]
            
        # Try partial match
        for key, value in field_mapping.items():
            if key in field:
                return value
                
        return field  # Return original if no mapping found

    def _clean_profile_data(self, value: Optional[str]) -> Optional[str]:
        """Clean profile data by removing image URLs, email signatures, and other unwanted content"""
        if not value or not isinstance(value, str):
            return None
            
        # Remove image URLs and markdown links
        value = re.sub(r'\[!\[.*?\]\(.*?\)\]\(.*?\)', '', value)
        value = re.sub(r'!\[.*?\]\(.*?\)', '', value)
        value = re.sub(r'\[.*?\]\(.*?\)', '', value)
        
        # Remove email signatures and disclaimers
        signature_patterns = [
            r'---.*$',  # Common signature separator
            r'Disclaimer:.*$',
            r'This email.*confidential.*$',
            r'\*\*.*Ltd\*\*.*$',  # Company names in bold
            r'Human Resource.*$'
        ]
        
        for pattern in signature_patterns:
            value = re.sub(pattern, '', value, flags=re.IGNORECASE | re.MULTILINE | re.DOTALL)
        
        # Clean up whitespace
        value = re.sub(r'\s+', ' ', value).strip()
        
        return value if value else None

    def _normalize_value(self, field: str, value: Optional[str]) -> Any:
        """Normalize field values based on field type"""
        if not value:
            return None
            
        value = str(value).strip()
        
        if field in ['total_experience', 'relevant_experience']:
            # Extract years and months
            years_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:year|yr)', value.lower())
            months_match = re.search(r'(\d+)\s*(?:month|mon)', value.lower())
            
            years = float(years_match.group(1)) if years_match else 0
            months = float(months_match.group(1))/12 if months_match else 0
            
            total_years = years + months
            return f"{total_years:.1f} Years"
            
        elif field == 'notice_period_days':
            # Convert various notice period formats to days
            if 'immediate' in value.lower():
                return '0'
            
            # Check for date format
            date_match = re.search(r'\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?', value)
            if date_match:
                try:
                    # Parse the date and calculate days remaining
                    from dateutil import parser
                    date = parser.parse(date_match.group(0))
                    days = (date - datetime.now()).days
                    return str(max(0, days))
                except:
                    pass
            
            # Extract numeric values
            days = 0
            months_match = re.search(r'(\d+)\s*month', value.lower())
            if months_match:
                days += int(months_match.group(1)) * 30
            
            days_match = re.search(r'(\d+)\s*day', value.lower())
            if days_match:
                days += int(days_match.group(1))
            
            return str(days) if days > 0 else None
            
        elif field in ['ctc_current', 'ctc_expected']:
            # Extract numeric value and convert to lakhs
            match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lac|lakh|lpa|l)', value.lower())
            if match:
                return f"{float(match.group(1)):.2f} LPA"
            return value
            
        elif field == 'key_skills':
            # Clean and standardize skills list
            skills = []
            for skill in re.split(r'[,|;]', value):
                skill = skill.strip()
                # Remove ratings if present
                skill = re.sub(r'\s*-\s*\d+(?:\.\d+)?\s*$', '', skill)
                if skill and skill != '---':
                    skills.append(skill)
            return ', '.join(skills)
            
        return value

    def _find_existing_profile(self, profile_data: Dict[str, Any]) -> Optional[Profile]:
        """Find existing profile by candidate name and other identifiers"""
        if not profile_data.get('candidate_name'):
            return None

        # Try to find by exact name match
        profile = Profile.query.filter(
            Profile.candidate_name.ilike(profile_data['candidate_name'])
        ).first()

        if profile:
            return profile

        # If no exact match, try fuzzy matching using similar names
        name_parts = profile_data['candidate_name'].lower().split()
        if len(name_parts) > 1:
            # Try matching first name + last name in different combinations
            for i in range(len(name_parts)-1):
                name_pattern = f"%{name_parts[i]}%{name_parts[-1]}%"
                profile = Profile.query.filter(
                    Profile.candidate_name.ilike(name_pattern)
                ).first()
                if profile:
                    return profile

        return None

    def _generate_student_id(self):
        """Generate a unique student ID with retry logic to prevent duplicates"""
        from app.models.profile import Profile
        max_retries = 10
        
        for attempt in range(max_retries):
            try:
                # Get the highest existing student_id and increment
                last_profile = Profile.query.order_by(Profile.student_id.desc()).first()
                if last_profile and last_profile.student_id and last_profile.student_id.startswith('STU'):
                    try:
                        last_num = int(last_profile.student_id[3:])
                        next_num = last_num + 1 + attempt  # Add attempt to avoid conflicts
                    except Exception:
                        next_num = 1 + attempt
                else:
                    next_num = 1 + attempt
                
                student_id = f'STU{next_num:03d}'
                
                # Check if this ID already exists
                existing = Profile.query.filter_by(student_id=student_id).first()
                if not existing:
                    return student_id
                    
            except Exception as e:
                current_app.logger.warning(f"Error generating student ID (attempt {attempt + 1}): {str(e)}")
                continue
        
        # If all attempts failed, use timestamp-based ID
        timestamp = int(time.time() * 1000) % 1000000
        return f'STU{timestamp:06d}'
    


    def _create_or_update_profile(self, profile_data: Dict[str, Any], email_id: str, from_table: bool = True) -> Optional[Profile]:
        """Create or update a profile record with correct model fields and types. Prevent duplicates and only update if data changes."""
        try:
            candidate_name = profile_data.get('candidate_name') or profile_data.get('name_of_candidate')
            if not candidate_name:
                current_app.logger.warning("No candidate name found in profile data")
                return None
                
            # Validate and clean candidate name
            candidate_name = str(candidate_name).strip()
            if not self._is_valid_candidate_name(candidate_name):
                current_app.logger.warning(f"Invalid candidate name: {candidate_name}")
                return None
                
            # Truncate candidate name if too long for database
            if len(candidate_name) > 100:
                candidate_name = candidate_name[:100]

            # Enhanced duplicate detection - check by contact, email, and name
            contact_no = profile_data.get('contact_no', '').strip()
            profile_email_id = profile_data.get('email_id', '').strip()
            
            # Check for duplicates based on the logic:
            # 1. If email is same AND contact is same → It's a duplicate
            # 2. If email is same OR contact is same → It's also a duplicate
            # 3. Only if both email AND contact are different → It's NOT a duplicate
            
            profile = None
            
            # Check for duplicates by email OR contact
            if profile_email_id and '@' in str(profile_email_id):
                # Check by email
                profile = Profile.query.filter(Profile.email_id == profile_email_id).first()
                if profile:
                    current_app.logger.info(f"Found duplicate profile by email match: {candidate_name} (Email: {profile_email_id})")
            
            # If no email match found, check by contact
            if not profile and contact_no:
                profile = Profile.query.filter(Profile.contact_no == contact_no).first()
                if profile:
                    current_app.logger.info(f"Found duplicate profile by contact match: {candidate_name} (Contact: {contact_no})")

            def to_float(val):
                try:
                    return float(re.sub(r'[^0-9.]', '', str(val))) if val else None
                except:
                    return None

            def to_int(val):
                try:
                    return int(re.sub(r'[^0-9]', '', str(val))) if val else None
                except:
                    return None

            # Prepare new data for comparison - handle both old and new field names
            new_data = {
                'total_experience': to_float(profile_data.get('total_experience')),
                'relevant_experience': to_float(profile_data.get('relevant_experience')),
                'current_company': profile_data.get('current_company'),
                'ctc_current': to_float(profile_data.get('ctc_current') or profile_data.get('current_ctc')),
                'ctc_expected': to_float(profile_data.get('ctc_expected') or profile_data.get('expected_ctc')),
                'notice_period_days': to_int(profile_data.get('notice_period_days') or profile_data.get('notice_period')),
                'location': profile_data.get('location') or profile_data.get('current_location'),
                'education': profile_data.get('education') or profile_data.get('qualification'),
                'key_skills': profile_data.get('key_skills') or profile_data.get('skills'),
                'source': profile_data.get('source'),
                'email_id': profile_email_id if (profile_email_id and '@' in str(profile_email_id)) else None,
                'contact_no': profile_data.get('contact_no'),
                'candidate_email': profile_data.get('candidate_email'),
                'oracle_id': profile_data.get('oracle_id'),
                'offer_in_hand': profile_data.get('offer_in_hand'),
                'availability': profile_data.get('availability')
            }

            from app.database import db
            if not profile:
                # Generate a short unique student_id
                student_id = self._generate_student_id()
                profile = Profile(student_id=student_id, candidate_name=candidate_name, **new_data)
                db.session.add(profile)
                db.session.commit()
                current_app.logger.info(f"Created new profile for {candidate_name}")
                return profile
            else:
                # Only update if any field has changed, but protect key_skills from being overwritten with empty values
                updated = False
                for k, v in new_data.items():
                    current_value = getattr(profile, k)
                    
                    # Special handling for key_skills - only update if data comes from table extraction
                    if k == 'key_skills':
                        if from_table and v and v.strip() and (not current_value or current_value.strip() != v.strip()):
                            current_app.logger.info(f"Updating key_skills for {candidate_name} (from table): '{current_value}' -> '{v}'")
                            setattr(profile, k, v)
                            updated = True
                        elif not from_table and v and v.strip():
                            current_app.logger.info(f"Skipping key_skills update for {candidate_name} (not from table): '{v}'")
                        elif v and v.strip() and current_value and current_value.strip() == v.strip():
                            current_app.logger.info(f"key_skills already match for {candidate_name}: '{v}'")
                        elif not v or not v.strip():
                            current_app.logger.info(f"Skipping empty key_skills update for {candidate_name}")
                    else:
                        # For other fields, update if different
                        if current_value != v:
                            setattr(profile, k, v)
                            updated = True
                            
                if updated:
                    db.session.commit()
                    current_app.logger.info(f"Updated profile for {candidate_name}")
                else:
                    current_app.logger.info(f"No changes for profile {candidate_name}, skipping update.")
                return profile
        except Exception as e:
            current_app.logger.error(f"Error creating/updating profile: {str(e)}")
            from app.database import db
            db.session.rollback()
            return None

    def _save_attachment(self, attachment_data: bytes, filename: str) -> str:
        """Save attachment to disk and return the file path"""
        upload_dir = os.path.join(current_app.root_path, 'uploads', 'attachments')
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"{timestamp}_{filename}"
        file_path = os.path.join(upload_dir, safe_filename)
        
        with open(file_path, 'wb') as f:
            f.write(attachment_data)
        
        return file_path



    def _get_access_token(self) -> Optional[str]:
        """Get Microsoft Graph API access token"""
        try:
            app = msal.ConfidentialClientApplication(
                self.client_id,
                authority=self.authority,
                client_credential=self.client_secret
            )
            
            result = app.acquire_token_silent(self.scope, account=None)
            if not result:
                result = app.acquire_token_for_client(scopes=self.scope)
            
            if result and "access_token" in result:
                return result["access_token"]
            else:
                error_desc = result.get("error_description", "No error description") if result else "No result"
                print(f"Error getting token: {error_desc}")
                return None
        except Exception as e:
            print(f"Error in _get_access_token: {str(e)}")
            return None

    def _clean_text(self, text: str) -> str:
        """Clean and format email text content"""
        if not text:
            return ''
            
        try:
            # Convert HTML to text if needed
            if '<' in text and '>' in text:  # Simple check for HTML content
                text = self.html2text.handle(text)
            
            # Basic text cleaning
            text = text.strip()
            text = re.sub(r'\s+', ' ', text)  # Replace multiple spaces with single space
            text = re.sub(r'\n\s*\n', '\n\n', text)  # Replace multiple newlines with double newline
            
            return text
        except Exception as e:
            current_app.logger.error(f"Error cleaning text: {str(e)}")
            return text  # Return original text if cleaning fails

    def _clean_cid_urls(self, content: str) -> str:
        """Remove CID URLs from email content to prevent browser errors"""
        if not content:
            return content
        
        try:
            # Remove cid: URLs that cause browser errors
            cleaned_content = re.sub(r'cid:[^\s"\'<>]+', '', content)
            return cleaned_content
        except Exception as e:
            current_app.logger.error(f"Error cleaning CID URLs: {str(e)}")
            return content

    def _clean_value(self, value: str) -> str:
        """Clean extracted value by removing noise and normalizing format"""
        if not value or not isinstance(value, str):
            return ''
            
        # Convert to string and clean basic formatting
        value = str(value).strip()
        value = re.sub(r'\s+', ' ', value)  # Normalize whitespace
        value = value.replace('|', '')  # Remove table separators
        value = re.sub(r'[\u00A0\u200B\u200C\u200D\uFEFF]', '', value)  # Remove zero-width spaces and nbsp
        
        # Remove email signatures and disclaimers
        signature_patterns = [
            r'(?i)Disclaimer:.*$',
            r'(?i)This email (?:and|&) any.*$',
            r'(?i)The information contained.*$',
            r'(?i)Confidentiality Notice:.*$',
            r'(?i)www\.[\w\.-]+\.[a-z]{2,}.*$',  # Website URLs
            r'(?i)(?:T|Tel|M|Mob|E|Email)[\s:]+[\d\w\.-]+@[\w\.-]+\.[a-z]{2,}.*$',  # Contact details
            r'(?i)(?:T|Tel|M|Mob)[\s:]+(?:\+\d{1,4}[-\s]?)?\d[-\d\s]{8,}.*$',  # Phone numbers
            r'(?i)(?:regards|thank(?:s|ing) you|best|sincerely|yours truly).*$',  # Email closings
            r'(?i)(?:floor|building|road|street|lane|area).*(?:pin|zip)?.*\d{6}.*$',  # Addresses
        ]
        
        for pattern in signature_patterns:
            value = re.sub(pattern, '', value)
            
        # Remove any remaining lines that look like contact info or signatures
        lines = value.split('\n')
        cleaned_lines = []
        for line in lines:
            # Skip lines that look like signatures or contact info
            if any(x in line.lower() for x in ['@', 'www.', 'http', '.com', '.in', '.org', 'copyright', 'all rights']):
                continue
            if re.search(r'^[\w\s\.-]+\s*[|:]\s*[\w\s\.-]+$', line):  # Simple key-value contact info
                continue
            cleaned_lines.append(line)
        
        value = ' '.join(cleaned_lines)
        
        # Final cleanup
        value = value.strip()
        value = re.sub(r'\s+', ' ', value)  # Final whitespace normalization
        
        return value

    def _clean_html_content(self, html_content: str) -> str:
        """Clean HTML content and extract text while preserving structure"""
        try:
            # Remove style tags and their contents
            html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL)
            
            # Remove script tags and their contents
            html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL)
            
            # Replace <br> and <div> with newlines
            html_content = re.sub(r'<br[^>]*>', '\n', html_content)
            html_content = re.sub(r'</div>\s*<div[^>]*>', '\n', html_content)
            
            # Parse with BeautifulSoup - use 'html.parser' as fallback if html5lib fails
            try:
                soup = BeautifulSoup(html_content, 'html5lib')
            except Exception as e:
                current_app.logger.warning(f"html5lib parser failed, using html.parser: {str(e)}")
                soup = BeautifulSoup(html_content, 'html.parser')
            
            # Remove all style attributes
            for tag in soup.find_all(style=True):
                del tag['style']
            
            # Get text while preserving some structure
            lines = []
            for element in soup.stripped_strings:
                line = element.strip()
                if line:
                    lines.append(line)
            
            # Join lines with proper spacing
            text = '\n'.join(lines)
            
            # Clean up extra whitespace
            text = re.sub(r'\n\s*\n', '\n\n', text)  # Remove multiple blank lines
            text = re.sub(r'[ \t]+', ' ', text)  # Normalize horizontal whitespace
            text = text.strip()
            
            # Decode HTML entities
            text = html.unescape(text)
            
            return text
            
        except Exception as e:
            current_app.logger.error(f"Error cleaning HTML content: {str(e)}")
            return html_content  # Return original content if cleaning fails

    def _extract_job_requirements(self, text: str, email_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extract job requirements from email text and subject"""
        try:
            # Clean the text first
            text = self._clean_html_content(text)
            current_app.logger.info(f"Cleaned text for requirements extraction: {text[:500]}...")  # Log first 500 chars
            
            requirements: Dict[str, Any] = {
                'job_title': None,
                'department': None,
                'location': None,
                'shift': None,
                'job_type': None,
                'hiring_manager': None,
                'experience_range': None,
                'skills_required': None,
                'minimum_qualification': None,
                'number_of_positions': None,
                'budget_ctc': None,
                'priority': None,
                'tentative_doj': None,
                'additional_remarks': None
            }

            # First, try to extract job title from email subject
            if email_data and email_data.get('subject'):
                job_title_from_subject = self._extract_job_title_from_subject(email_data['subject'])
                if job_title_from_subject:
                    requirements['job_title'] = job_title_from_subject
                    current_app.logger.info(f"Extracted job title from subject: {job_title_from_subject}")

            # Check if this is an RFH format email (check both subject and body)
            subject = email_data.get('subject', '').lower() if email_data else ''
            is_rfh_email = (
                'request for hire' in text.lower() or 
                'rfh' in text.lower() or
                'rfh' in subject or
                'request for hire' in subject or
                'request for hiring' in subject
            )
            
            if is_rfh_email:
                current_app.logger.info(f"Detected RFH format email, extracting detailed fields")
                
                # First, try to extract from HTML list items if present
                html_extracted = self._extract_from_html_lists(text)
                if html_extracted:
                    current_app.logger.info(f"Extracted data from HTML lists: {html_extracted}")
                    for field, value in html_extracted.items():
                        if value and not requirements.get(field):
                            requirements[field] = value
                
                # Extract each field using more flexible patterns
                field_patterns = {
                    'job_title': [
                        r'job\s*title\s*:?\s*([^:\n]+?)(?=\s*(?:department|location|experience|$))',
                        r'position\s*:?\s*([^:\n]+?)(?=\s*(?:department|location|experience|$))',
                        r'role\s*:?\s*([^:\n]+?)(?=\s*(?:department|location|experience|$))'
                    ],
                    'department': [
                        r'department\s*:?\s*([^:\n]+?)(?=\s*(?:location|shift|$))',
                        r'dept\s*:?\s*([^:\n]+?)(?=\s*(?:location|shift|$))',
                        r'division\s*:?\s*([^:\n]+?)(?=\s*(?:location|shift|$))'
                    ],
                    'location': [
                        r'location\s*:?\s*([^:\n]+?)(?=\s*(?:shift|job\s*type|$))',
                        r'work\s*location\s*:?\s*([^:\n]+?)(?=\s*(?:shift|job\s*type|$))',
                        r'job\s*location\s*:?\s*([^:\n]+?)(?=\s*(?:shift|job\s*type|$))',
                        r'place\s*of\s*work\s*:?\s*([^:\n]+?)(?=\s*(?:shift|job\s*type|$))'
                    ],
                    'shift': [
                        r'shift\s*:?\s*([^:\n]+?)(?=\s*(?:job\s*type|hiring|$))',
                        r'timing\s*:?\s*([^:\n]+?)(?=\s*(?:job\s*type|hiring|$))'
                    ],
                    'job_type': [
                        r'job\s*type\s*:?\s*([^:\n]+?)(?=\s*(?:hiring\s*manager|experience|$))',
                        r'employment\s*type\s*:?\s*([^:\n]+?)(?=\s*(?:hiring\s*manager|experience|$))'
                    ],
                    'hiring_manager': [
                        r'hiring\s*manager\s*:?\s*([^:\n]+?)(?=\s*(?:justification|experience|$))',
                        r'manager\s*:?\s*([^:\n]+?)(?=\s*(?:justification|experience|$))'
                    ],
                    'experience_range': [
                        r'experience\s*range\s*:?\s*([^:\n]+?)(?=\s*(?:skills|minimum|$))',
                        r'experience\s*:?\s*([^:\n]+?)(?=\s*(?:skills|minimum|$))',
                        r'years\s*of\s*experience\s*:?\s*([^:\n]+?)(?=\s*(?:skills|minimum|$))'
                    ],
                    'skills_required': [
                        r'skills\s*required\s*:?\s*([^:\n]+?)(?=\s*(?:minimum|number|$))',
                        r'skills\s*:?\s*([^:\n]+?)(?=\s*(?:minimum|number|$))',
                        r'technical\s*skills\s*:?\s*([^:\n]+?)(?=\s*(?:minimum|number|$))'
                    ],
                    'minimum_qualification': [
                        r'minimum\s*qualification\s*:?\s*([^:\n]+?)(?=\s*(?:preferred|number|budget|$))',
                        r'qualification\s*:?\s*([^:\n]+?)(?=\s*(?:preferred|number|budget|$))',
                        r'education\s*:?\s*([^:\n]+?)(?=\s*(?:preferred|number|budget|$))'
                    ],
                    'number_of_positions': [
                        r'number\s*of\s*positions\s*:?\s*(\d+)',
                        r'positions\s*:?\s*(\d+)',
                        r'openings\s*:?\s*(\d+)'
                    ],
                    'budget_ctc': [
                        r'budgeted\s*ctc\s*range\s*:?\s*([^:\n]+?)(?=\s*(?:internal|tentative|additional|$))',
                        r'budget\s*:?\s*([^:\n]+?)(?=\s*(?:internal|tentative|additional|$))',
                        r'ctc\s*:?\s*([^:\n]+?)(?=\s*(?:internal|tentative|additional|$))',
                        r'salary\s*:?\s*([^:\n]+?)(?=\s*(?:internal|tentative|additional|$))'
                    ],
                    'tentative_doj': [
                        r'tentative\s*doj\s*:?\s*\[?([^:\]\n]+?)(?:\]|\s*(?:additional|thanks|regards|$))',
                        r'date\s*of\s*joining\s*:?\s*\[?([^:\]\n]+?)(?:\]|\s*(?:additional|thanks|regards|$))',
                        r'joining\s*date\s*:?\s*\[?([^:\]\n]+?)(?:\]|\s*(?:additional|thanks|regards|$))'
                    ],
                    'additional_remarks': [
                        r'additional\s*remarks\s*:?\s*\[?([^:\]\n]+?)(?:\]|\s*(?:thanks|regards|$))',
                        r'remarks\s*:?\s*\[?([^:\]\n]+?)(?:\]|\s*(?:thanks|regards|$))',
                        r'notes\s*:?\s*\[?([^:\]\n]+?)(?:\]|\s*(?:thanks|regards|$))'
                    ]
                }

                for field, patterns in field_patterns.items():
                    # Don't override job title if we already extracted it from subject
                    if field == 'job_title' and requirements['job_title']:
                        continue
                    
                    # Skip if we already have this field from HTML extraction
                    if requirements.get(field):
                        continue
                    
                    # Try each pattern for this field
                    for pattern in patterns:
                        match = re.search(pattern, text, re.IGNORECASE)
                        if match:
                            value = match.group(1).strip()
                            # Clean up the value - remove formatting characters
                            value = re.sub(r'^\s*[\[•\-\*]\s*', '', value)  # Remove leading brackets, bullets, dashes
                            value = re.sub(r'\s*[\]•\-\*]\s*$', '', value)  # Remove trailing brackets, bullets, dashes
                            value = re.sub(r'\s+', ' ', value)  # Normalize whitespace
                            value = value.strip(':-,. \t\n')  # Remove common punctuation from edges
                            
                            # Special handling for certain fields
                            if field == 'skills_required' and value:
                                # Split skills and format as bullet points
                                skills = [s.strip() for s in re.split(r'[,;&]', value) if s.strip()]
                                if skills:
                                    value = '\n'.join(f'• {skill}' for skill in skills)
                            
                            elif field == 'number_of_positions' and value:
                                try:
                                    value = int(value)
                                except ValueError:
                                    value = None
                            
                            elif field == 'tentative_doj' and value:
                                value = self._parse_date_value(value)
                            
                            elif field == 'budget_ctc' and value:
                                # Clean up CTC value
                                value = re.sub(r'(?i)(?:inr|rs\.?|rupees|\(.*?\))', '', value)
                                value = value.replace('₹', '').strip()
                            
                            requirements[field] = value
                            current_app.logger.info(f"Extracted {field}: {value}")
                            break  # Found a match, move to next field

            else:
                current_app.logger.info(f"Not an RFH format email, using fallback extraction methods")
                # Fallback to previous extraction methods for non-RFH emails
                # Only try to extract job title from body if we didn't get it from subject
                if not requirements['job_title']:
                    title_patterns = [
                        r'requirement\s+for\s+["\']?([^"\']+?)["\']?(?=\s|$)',
                        r'urgent\s+requirement\s+([^,\n]+)',
                        r'opening\s+for\s+([^,\n]+)',
                        r'position:\s*([^,\n:]+?)(?=\s*(?:department|location|experience|skills|$))',
                        r'role:\s*([^,\n:]+?)(?=\s*(?:department|location|experience|skills|$))',
                        r'job\s+title:\s*([^,\n:]+?)(?=\s*(?:department|location|experience|skills|$))',
                        r'hiring\s+for\s+([^,\n]+)'
                    ]
                    
                    for pattern in title_patterns:
                        match = re.search(pattern, text, re.IGNORECASE)
                        if match:
                            job_title = match.group(1).strip()
                            if job_title and len(job_title) > 3:  # Ensure meaningful title
                                requirements['job_title'] = job_title
                                current_app.logger.info(f"Extracted job title from body: {job_title}")
                                break

                # Extract other fields using existing patterns
                location_patterns = [
                    r'location:\s*([^,\n]+)',
                    r'place\s+of\s+work:\s*([^,\n]+)',
                    r'job\s+location:\s*([^,\n]+)',
                    r'work\s+location:\s*([^,\n]+)'
                ]
                for pattern in location_patterns:
                    match = re.search(pattern, text, re.IGNORECASE)
                    if match:
                        requirements['location'] = match.group(1).strip()
                        break

            # Set default job type if not found
            if not requirements.get('job_type'):
                requirements['job_type'] = 'Full Time'

            current_app.logger.info(f"Extracted requirements: {requirements}")
            return requirements

        except Exception as e:
            current_app.logger.error(f"Error extracting requirements: {str(e)}")
            return {}

    def _extract_job_title_from_subject(self, subject: str) -> Optional[str]:
        """Extract job title from email subject using various patterns"""
        # Remove any Re:, Fwd:, etc. and get the original subject
        cleaned_subject = re.sub(r'^(?:Re|Fwd|Forward|FW|RE|FWD):\s*', '', subject.strip())
        
        current_app.logger.info(f"Extracting job title from subject: '{subject}' -> cleaned: '{cleaned_subject}'")
        
        # Handle RFH format with company and location: "RFH: Job Title - Company - Location"
        # This pattern should match: "RFH: Nokia FlowOne Developer - BOSCH - Bangalore"
        rfh_company_location_pattern = r'RFH\s*:\s*([^-]+?)\s*-\s*[^-]+\s*-\s*[^-]+$'
        rfh_match = re.search(rfh_company_location_pattern, cleaned_subject, re.IGNORECASE)
        if rfh_match:
            job_title = rfh_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (RFH company-location pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"RFH pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"RFH pattern 1 did not match: '{cleaned_subject}'")
        
        # Handle RFH format with space after colon: "RFH : Job Title - Company - Location"
        # This pattern should match: "RFH : API developer - BOSCH - Bangalore"
        rfh_space_pattern = r'RFH\s*:\s*([^-]+?)\s*-\s*[^-]+\s*-\s*[^-]+$'
        rfh_space_match = re.search(rfh_space_pattern, cleaned_subject, re.IGNORECASE)
        if rfh_space_match:
            job_title = rfh_space_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (RFH space pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"RFH space pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"RFH space pattern did not match: '{cleaned_subject}'")
        
        # Handle RFH format with just company: "RFH: Job Title - Company"
        rfh_company_pattern = r'RFH\s*:\s*([^-]+?)\s*-\s*[^-]+$'
        rfh_match = re.search(rfh_company_pattern, cleaned_subject, re.IGNORECASE)
        if rfh_match:
            job_title = rfh_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (RFH company pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"RFH company pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"RFH company pattern did not match: '{cleaned_subject}'")
        
        # Handle non-RFH format with company and location: "Job Title - Company - Location"
        # This pattern should match: "Chatbot Developer - BOSCH - Bangalore"
        company_location_pattern = r'^([^-]+?)\s*-\s*[^-]+\s*-\s*[^-]+$'
        company_location_match = re.search(company_location_pattern, cleaned_subject, re.IGNORECASE)
        if company_location_match:
            job_title = company_location_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (company-location pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"Company-location pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"Company-location pattern did not match: '{cleaned_subject}'")
        
        # Handle non-RFH format with just company: "Job Title - Company"
        company_pattern = r'^([^-]+?)\s*-\s*[^-]+$'
        company_match = re.search(company_pattern, cleaned_subject, re.IGNORECASE)
        if company_match:
            job_title = company_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (company pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"Company pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"Company pattern did not match: '{cleaned_subject}'")
        
        # Handle "Request for Hire (RFH) for Job Title" format
        # This pattern should match: "Request for Hire (RFH) for Full Stack Developer."
        rfh_request_pattern = r'Request for Hire\s*\(RFH\)\s+for\s+([^.\n]+)'
        rfh_request_match = re.search(rfh_request_pattern, cleaned_subject, re.IGNORECASE)
        if rfh_request_match:
            job_title = rfh_request_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (RFH request pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"RFH request pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"RFH request pattern did not match: '{cleaned_subject}'")
        
        # Handle "Request for hiring for role Job Title" format
        # This pattern should match: "Request for hiring for role AWS Engineer"
        hiring_role_pattern = r'Request for hiring for role\s+([^.\n]+)'
        hiring_role_match = re.search(hiring_role_pattern, cleaned_subject, re.IGNORECASE)
        if hiring_role_match:
            job_title = hiring_role_match.group(1).strip()
            # Clean up the job title
            job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
            if job_title and len(job_title) > 3:
                current_app.logger.info(f"Extracted job title (hiring role pattern): '{job_title}'")
                return job_title
            else:
                current_app.logger.warning(f"Hiring role pattern matched but job title invalid: '{job_title}'")
        else:
            current_app.logger.debug(f"Hiring role pattern did not match: '{cleaned_subject}'")
        
        # First, try to extract after ":-" (most specific pattern for your case)
        colon_dash_match = re.search(r'[:-]\s*([^:-]+)$', cleaned_subject)
        if colon_dash_match:
            extracted = colon_dash_match.group(1).strip()
            # If the extracted part looks like a job title (not too long, contains technical terms)
            if extracted and len(extracted) < 100 and not any(word in extracted.lower() for word in ['resume', 'tracker', 'sheet', 'submission']):
                # Clean up the extracted title
                title = re.sub(r'[^\w\s-]', '', extracted).strip()
                if title:
                    current_app.logger.info(f"Extracted job title (colon-dash pattern): '{title}'")
                    return title
        
        # Try to extract after "Resume & Tracker sheet"
        tracker_match = re.search(r'Resume & Tracker sheet[^:]*[:-]\s*([^:-]+)$', cleaned_subject, re.IGNORECASE)
        if tracker_match:
            extracted = tracker_match.group(1).strip()
            if extracted and len(extracted) < 100:
                title = re.sub(r'[^\w\s-]', '', extracted).strip()
                if title:
                    current_app.logger.info(f"Extracted job title (tracker pattern): '{title}'")
                    return title
        
        # Try to extract after "Candidate Submission"
        submission_match = re.search(r'Candidate Submission[^:]*[:-]\s*([^:-]+)$', cleaned_subject, re.IGNORECASE)
        if submission_match:
            extracted = submission_match.group(1).strip()
            if extracted and len(extracted) < 100:
                title = re.sub(r'[^\w\s-]', '', extracted).strip()
                if title:
                    current_app.logger.info(f"Extracted job title (submission pattern): '{title}'")
                    return title
        
        # Try to extract after "Hiring Manager profile + RFH Req"
        hiring_manager_pattern = r'Hiring Manager profile \+ RFH Req'
        if re.search(hiring_manager_pattern, cleaned_subject, re.IGNORECASE):
            # For this pattern, try to extract from the end of the subject
            # Remove the pattern and get what's left
            remaining = re.sub(hiring_manager_pattern, '', cleaned_subject, flags=re.IGNORECASE).strip()
            if remaining:
                title = re.sub(r'[^\w\s-]', '', remaining).strip()
                if title and len(title) > 3:
                    current_app.logger.info(f"Extracted job title (hiring manager pattern): '{title}'")
                    return title
        
        # Generic patterns for job titles
        generic_patterns = [
            r'requirement\s+for\s+["\']?([^"\']+?)["\']?(?=\s|$)',
            r'urgent\s+requirement\s+([^,\n]+)',
            r'opening\s+for\s+([^,\n]+)',
            r'position:\s*([^,\n:]+?)(?=\s*(?:department|location|experience|skills|$))',
            r'role:\s*([^,\n:]+?)(?=\s*(?:department|location|experience|skills|$))',
            r'job\s+title:\s*([^,\n:]+?)(?=\s*(?:department|location|experience|skills|$))',
            r'hiring\s+for\s+([^,\n]+)'
        ]
        
        for pattern in generic_patterns:
            match = re.search(pattern, cleaned_subject, re.IGNORECASE)
            if match:
                job_title = match.group(1).strip()
                if job_title and len(job_title) > 3:
                    # Clean up the job title
                    job_title = re.sub(r'[^\w\s-]', '', job_title).strip()
                    if job_title:
                        current_app.logger.info(f"Extracted job title (generic pattern): '{job_title}'")
                        return job_title
        
        current_app.logger.warning(f"No job title pattern matched for subject: '{cleaned_subject}'")
        return None

    def _get_thread_id(self, email_data: Dict[str, Any]) -> str:
        """Extract or generate a thread ID to group related emails"""
        # Try to get conversation ID from email metadata
        conversation_id = email_data.get('conversationId', '')
        if conversation_id:
            return conversation_id
            
        # If no conversation ID, try to extract from subject
        subject = email_data.get('subject', '')
        # Remove Re:, Fwd:, etc. and clean the subject
        clean_subject = re.sub(r'^(?:Re|Fwd|Forward|FW|RE|FWD):\s*', '', subject).strip()
        # Use cleaned subject as thread ID
        return f"thread_{clean_subject}"

    def _extract_requirements_from_table(self, html_content: str) -> Dict[str, Any]:
        """Extract requirements data from table in email"""
        try:
            current_app.logger.info("Starting table extraction for requirements")
            soup = BeautifulSoup(html_content, 'html.parser')
            tables = soup.find_all('table')
            current_app.logger.info(f"Found {len(tables)} tables in the email")
            
            requirements: Dict[str, Any] = {
                'job_title': None,
                'department': None,
                'location': None,
                'shift': None,
                'job_type': None,
                'hiring_manager': None,
                'experience_range': None,
                'skills_required': None,
                'minimum_qualification': None,
                'number_of_positions': None,
                'budget_ctc': None,
                'priority': None,
                'tentative_doj': None,
                'additional_remarks': None
            }

            if not tables:
                current_app.logger.warning("No tables found in email content")
                return {}

            # First try to get job title from the text before the table
            first_table = tables[0]
            text_before_table = first_table.find_previous_sibling(string=True)
            if text_before_table:
                text = text_before_table.strip()
                current_app.logger.info(f"Text before table: {text}")
                job_matches = re.findall(r'(?:for|hiring)\s+(?:a\s+)?([^,\n]+?)(?:\s+along|\s+with|\s*$)', text, re.IGNORECASE)
                if job_matches:
                    requirements['job_title'] = self._clean_value(job_matches[0])
                    current_app.logger.info(f"Found job title from text: {requirements['job_title']}")

            # Map common field variations to our database fields
            field_mapping = {
                'position': 'job_title',
                'role': 'job_title',
                'designation': 'job_title',
                'dept': 'department',
                'team': 'department',
                'business unit': 'department',
                'work location': 'location',
                'city': 'location',
                'base location': 'location',
                'timing': 'shift',
                'work hours': 'shift',
                'employment type': 'job_type',
                'contract type': 'job_type',
                'hiring lead': 'hiring_manager',
                'manager': 'hiring_manager',
                'reporting to': 'hiring_manager',
                'experience': 'experience_range',
                'exp': 'experience_range',
                'yoe': 'experience_range',
                'skills': 'skills_required',
                'technical skills': 'skills_required',
                'requirements': 'skills_required',
                'qualification': 'minimum_qualification',
                'education': 'minimum_qualification',
                'degree': 'minimum_qualification',
                'positions': 'number_of_positions',
                'headcount': 'number_of_positions',
                'openings': 'number_of_positions',
                'budget': 'budget_ctc',
                'salary': 'budget_ctc',
                'package': 'budget_ctc',
                'urgency': 'priority',
                'importance': 'priority',
                'joining date': 'tentative_doj',
                'start date': 'tentative_doj',
                'doj': 'tentative_doj',
                'remarks': 'additional_remarks',
                'comments': 'additional_remarks',
                'notes': 'additional_remarks'
            }

            # Try pandas table extraction first
            try:
                tables_df = pd.read_html(html_content)
                if tables_df:
                    # Process each table
                    for df in tables_df:
                        # Skip tables that look like candidate profiles
                        if any(col.lower() in ['name', 'candidate', 'consultant'] for col in df.columns):
                            continue
                            
                        # Try to identify requirement tables
                        if any(col.lower() in field_mapping for col in df.columns):
                            # Map columns to our fields
                            for col in df.columns:
                                col_lower = str(col).lower()
                                for pattern, field_name in field_mapping.items():
                                    if pattern in col_lower:
                                        # Get the first non-null value
                                        value = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
                                        if value is not None:
                                            value = str(value).strip()
                                            if field_name == 'number_of_positions':
                                                try:
                                                    value = int(re.search(r'\d+', str(value)).group())
                                                except (ValueError, AttributeError):
                                                    continue
                                            elif field_name == 'tentative_doj':
                                                try:
                                                    for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y']:
                                                        try:
                                                            value = datetime.strptime(value, fmt).date()
                                                            break
                                                        except ValueError:
                                                            continue
                                                except Exception:
                                                    continue
                                            requirements[field_name] = value
                                        break
            except Exception as e:
                current_app.logger.warning(f"Pandas table extraction failed: {str(e)}")

            # Fallback to BeautifulSoup if pandas didn't find anything
            if not any(requirements.values()):
                for table_idx, table in enumerate(tables):
                    current_app.logger.info(f"Processing table {table_idx + 1}")
                    rows = table.find_all('tr')
                    if not rows:
                        current_app.logger.warning(f"No rows found in table {table_idx + 1}")
                        continue

                    # Get headers
                    headers = []
                    header_row = rows[0]
                    for th in header_row.find_all(['th', 'td']):
                        header = th.get_text(strip=True).lower()
                        # Map header to our field name
                        for pattern, field_name in field_mapping.items():
                            if pattern in header:
                                header = field_name
                                break
                        headers.append(header)
                    current_app.logger.info(f"Table headers: {headers}")

                    # Process first data row only (we want requirements, not candidate data)
                    if len(rows) > 1:
                        data_row = rows[1]
                        cells = data_row.find_all(['td', 'th'])
                        current_app.logger.info(f"Processing data row with {len(cells)} cells")

                        for header, cell in zip(headers, cells):
                            if header in requirements:
                                value = self._clean_value(cell.get_text(strip=True))
                                if value:
                                    # Handle special fields
                                    if header == 'number_of_positions':
                                        try:
                                            match = re.search(r'\d+', value)
                                            if match:
                                                value = int(match.group())
                                        except (ValueError, TypeError):
                                            continue
                                    elif header == 'tentative_doj':
                                        value = self._parse_date_value(value)
                                        if value is None:
                                            continue
                                        
                                        # Store the full value without truncation
                                        requirements[header] = value
                                    current_app.logger.info(f"Found {header}: {requirements[header]}")

                    # Look for budget/CTC information in the text after the table
                    text_after_table = table.find_next_sibling(string=True)
                    if text_after_table:
                        text = text_after_table.strip()
                        current_app.logger.info(f"Text after table: {text}")
                        ctc_matches = re.findall(r'(?:budget|ctc|package)[\s:]+([^\n.]+)', text, re.IGNORECASE)
                        if ctc_matches:
                            value = self._clean_value(ctc_matches[0])
                            requirements['budget_ctc'] = value
                            current_app.logger.info(f"Found budget/CTC: {requirements['budget_ctc']}")

                # Set some default values
                if not requirements.get('job_type'):
                    requirements['job_type'] = 'Full Time'

                # Remove None values
                final_requirements = {k: v for k, v in requirements.items() if v is not None}

                current_app.logger.info(f"Final extracted requirements: {final_requirements}")
                return final_requirements

        except Exception as e:
            current_app.logger.error(f"Error extracting requirements from table: {str(e)}")
            return {}

    def _create_requirement(self, requirement_data: Dict[str, Any], email_data: Dict[str, Any]) -> Optional['Requirement']:
        """Create a new requirement record from extracted data and email metadata"""
        try:
            from app.models.requirement import Requirement
            from app.database import db

            # Generate request_id
            request_id = self._generate_request_id()
            
            # Log the requirement data being processed
            current_app.logger.info(f"Creating requirement with data: {requirement_data}")
            current_app.logger.info(f"Email subject: {email_data.get('subject')}")
            current_app.logger.info(f"Job title from requirement_data: {requirement_data.get('job_title')}")

            # Parse received_datetime if present
            received_datetime = email_data.get('receivedDateTime')
            if received_datetime and isinstance(received_datetime, str):
                try:
                    received_datetime = datetime.fromisoformat(received_datetime.replace('Z', '+00:00'))
                except Exception:
                    received_datetime = None

            requirement = Requirement(
                request_id=request_id,
                job_title=requirement_data.get('job_title'),
                department=requirement_data.get('department'),
                location=requirement_data.get('location'),
                shift=requirement_data.get('shift'),
                job_type=requirement_data.get('job_type'),
                hiring_manager=requirement_data.get('hiring_manager'),
                experience_range=requirement_data.get('experience_range'),
                skills_required=requirement_data.get('skills_required'),
                minimum_qualification=requirement_data.get('minimum_qualification'),
                number_of_positions=requirement_data.get('number_of_positions'),
                budget_ctc=requirement_data.get('budget_ctc'),
                priority=requirement_data.get('priority'),
                tentative_doj=requirement_data.get('tentative_doj'),
                additional_remarks=requirement_data.get('additional_remarks'),
                thread_id=self._get_thread_id(email_data),
                email_id=email_data.get('id'),
                email_subject=email_data.get('subject'),
                sender_email=email_data.get('sender'),
                sender_name=email_data.get('sender_name'),
                company_name=email_data.get('company_name'),
                received_datetime=received_datetime,
            )

            # Log the requirement object before saving
            current_app.logger.info(f"Requirement object created with job_title: {requirement.job_title}")

            db.session.add(requirement)
            db.session.commit()
            current_app.logger.info(f"Created new requirement: {requirement.request_id} with job_title: {requirement.job_title}")
            return requirement
        except Exception as e:
            current_app.logger.error(f"Error creating requirement: {str(e)}")
            db.session.rollback()
            return None

    def _clean_email_subject(self, subject: str) -> str:
        """Clean email subject by removing Re:, Fw:, Fwd: prefixes and other unwanted text"""
        if not subject:
            return ''
            
        subject = str(subject).strip()
        
        # Remove reply/forward prefixes (case insensitive)
        prefixes_to_remove = [
            r'^re:\s*',
            r'^fw:\s*', 
            r'^fwd:\s*',
            r'^forward:\s*',
            r'^reply:\s*'
        ]
        
        for prefix in prefixes_to_remove:
            subject = re.sub(prefix, '', subject, flags=re.IGNORECASE).strip()
        
        # Remove extra whitespace
        subject = re.sub(r'\s+', ' ', subject).strip()
        
        return subject

    def _is_duplicate_requirement(self, email_data: Dict[str, Any]) -> bool:
        """Check if a requirement already exists for this email to avoid duplicates"""
        try:
            from app.models.requirement import Requirement
            
            email_id = email_data.get('id', '')
            subject = email_data.get('subject', '')
            
            # If we have an email ID, check for exact match first
            if email_id:
                existing_by_email_id = Requirement.query.filter(
                    Requirement.email_id == email_id
                ).first()
                
                if existing_by_email_id:
                    current_app.logger.info(f"Found duplicate requirement by email_id: {email_id}")
                    return True
            
            # Second check: subject and sender combination for reply chains
            sender = email_data.get('sender', '')
            
            if not subject:
                return False
                
            # Clean the subject to remove reply/forward prefixes for comparison
            cleaned_subject = self._clean_email_subject(subject)
            
            # Skip very short or generic subjects
            if len(cleaned_subject) < 10:
                return False
            
            # Get thread/conversation ID for better duplicate detection
            thread_id = self._get_thread_id(email_data)
            
            # Check if we already have a requirement with the same thread_id
            if thread_id and thread_id != f"thread_{cleaned_subject}":
                existing_by_thread = Requirement.query.filter(
                    Requirement.thread_id == thread_id
                ).first()
                
                if existing_by_thread:
                    current_app.logger.info(f"Found duplicate requirement by thread_id: {thread_id}")
                    return True
            
            # Third check: exact subject match from same sender (only exact matches)
            similar_requirements = Requirement.query.filter(
                Requirement.sender_email == sender,
                Requirement.email_subject.isnot(None)
            ).all()
            
            for req in similar_requirements:
                if req.email_subject:
                    # Clean the existing requirement's subject for comparison
                    existing_cleaned_subject = self._clean_email_subject(req.email_subject)
                    
                    # Check for exact subject match after cleaning
                    if existing_cleaned_subject.lower().strip() == cleaned_subject.lower().strip():
                        current_app.logger.info(f"Found duplicate requirement by exact subject match from same sender: '{existing_cleaned_subject}' vs '{cleaned_subject}'")
                        return True
                    
                    # Only check for very high similarity (95% or more) from same sender to avoid false positives
                    similarity = self._calculate_subject_similarity(existing_cleaned_subject.lower(), cleaned_subject.lower())
                    if similarity > 0.95:
                        current_app.logger.info(f"Found very similar requirement from same sender: '{existing_cleaned_subject}' vs '{cleaned_subject}' (similarity: {similarity:.2f})")
                        return True
            
            # Fourth check: job title based duplicate detection (MOST IMPORTANT)
            # Extract job title from current email
            current_job_title = self._extract_job_title_from_subject(subject)
            if current_job_title:
                # Normalize job title for comparison
                normalized_current_title = self._normalize_job_title(current_job_title)
                
                if normalized_current_title:
                    # Check all existing requirements for job title duplicates (across all senders)
                    existing_requirements = Requirement.query.filter(
                        Requirement.job_title.isnot(None)
                    ).all()
                    
                    for req in existing_requirements:
                        if req.job_title:
                            # Normalize existing job title
                            normalized_existing_title = self._normalize_job_title(req.job_title)
                            
                            # Check if normalized titles match (EXACT MATCH)
                            if normalized_existing_title:
                                if normalized_current_title.lower().strip() == normalized_existing_title.lower().strip():
                                    current_app.logger.info(f"Found duplicate requirement by job title match: '{current_job_title}' vs '{req.job_title}' (normalized: '{normalized_current_title}')")
                                    return True
                                
                                # Check for high similarity in job titles (MORE AGGRESSIVE)
                                title_similarity = self._calculate_subject_similarity(normalized_current_title.lower(), normalized_existing_title.lower())
                                if title_similarity > 0.85:  # Lowered threshold for more aggressive detection
                                    current_app.logger.info(f"Found very similar job title: '{current_job_title}' vs '{req.job_title}' (similarity: {title_similarity:.2f})")
                                    return True
                                
                                # Additional check: if both titles contain the same key words
                                current_words = set(normalized_current_title.lower().split())
                                existing_words = set(normalized_existing_title.lower().split())
                                if len(current_words) >= 2 and len(existing_words) >= 2:
                                    common_words = current_words.intersection(existing_words)
                                    if len(common_words) >= min(len(current_words), len(existing_words)) * 0.8:  # 80% word overlap
                                        current_app.logger.info(f"Found duplicate by word overlap: '{current_job_title}' vs '{req.job_title}' (common words: {common_words})")
                                        return True
            
            # No duplicate found
            return False
            
        except Exception as e:
            current_app.logger.error(f"Error checking for duplicate requirement: {str(e)}")
            # If there's an error, don't skip creation
            return False
    
    def _normalize_job_title(self, job_title: str) -> str:
        """Normalize job title for better duplicate detection"""
        if not job_title:
            return ''
        
        # Convert to lowercase and strip
        normalized = job_title.lower().strip()
        
        # Remove common prefixes/suffixes and noise
        normalized = re.sub(r'^\[?\s*', '', normalized)  # Remove leading [ and spaces
        normalized = re.sub(r'\s*\]?$', '', normalized)  # Remove trailing ] and spaces
        normalized = re.sub(r'[^\w\s]', '', normalized)  # Remove special characters
        normalized = re.sub(r'\s+', ' ', normalized)     # Normalize whitespace
        
        # Remove RFH prefixes and variations
        rfh_prefixes = [
            r'^rfh\s*:?\s*',
            r'^request\s+for\s+hiring?\s*:?\s*',
            r'^request\s+for\s+hire\s*:?\s*',
            r'^hiring\s+request\s*:?\s*',
            r'^requirement\s+for\s+',
            r'^urgent\s+requirement\s*:?\s*'
        ]
        
        for prefix in rfh_prefixes:
            normalized = re.sub(prefix, '', normalized, flags=re.IGNORECASE)
        
        # Remove common noise words
        noise_words = [
            'position', 'role', 'job', 'opening', 'vacancy', 'requirement', 
            'hiring', 'urgent', 'developer', 'engineer', 'specialist',
            'for', 'the', 'a', 'an', 'and', 'or', 'with', 'in', 'at'
        ]
        
        for word in noise_words:
            normalized = re.sub(rf'\b{word}\b', '', normalized, flags=re.IGNORECASE)
        
        # Clean up again after removing words
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        return normalized

    def _calculate_subject_similarity(self, subject1: str, subject2: str) -> float:
        """Calculate similarity between two subjects using simple word overlap"""
        try:
            # Remove common words and split into sets
            common_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'}
            
            words1 = set(word.lower().strip() for word in subject1.split() if word.lower().strip() not in common_words and len(word) > 2)
            words2 = set(word.lower().strip() for word in subject2.split() if word.lower().strip() not in common_words and len(word) > 2)
            
            if not words1 or not words2:
                return 0.0
            
            # Calculate Jaccard similarity (intersection over union)
            intersection = len(words1.intersection(words2))
            union = len(words1.union(words2))
            
            return intersection / union if union > 0 else 0.0
            
        except Exception:
            return 0.0

    def _process_email(self, email_data: dict, create_requirements: bool = False) -> dict:
        """Process a single email to extract profiles and optionally create requirements"""
        try:
            email_id = email_data.get('id', '')
            content = email_data.get('body', '')
            
            # Extract sender information
            sender_info = email_data.get('sender', '')
            sender_name = ''
            sender_email = ''
            
            if isinstance(sender_info, dict):
                sender_name = sender_info.get('name', '')
                sender_email = sender_info.get('email', '')
            elif isinstance(sender_info, str):
                # Try to parse email from string
                if '<' in sender_info and '>' in sender_info:
                    # Format: "Name <email@domain.com>"
                    match = re.search(r'"?([^"<]*)"?\s*<([^>]+)>', sender_info)
                    if match:
                        sender_name = match.group(1).strip()
                        sender_email = match.group(2).strip()
                else:
                    sender_email = sender_info
            
            # Update email_data with extracted sender info
            email_data['sender_name'] = sender_name
            email_data['sender'] = sender_email
            
            # Extract company name from sender info
            company_name = self._extract_company_name(email_data)
            if company_name:
                email_data['company_name'] = company_name
            
            # REMOVED: Automatic profile extraction from emails
            # Profiles should only be uploaded manually through the upload interface
            created_profiles = []
            
            # Extract requirements
            cleaned_text = self._clean_text(content)
            requirements_data = self._extract_job_requirements(cleaned_text, email_data)
            
            current_app.logger.info(f"Requirements extraction result for email {email_data.get('subject', '')}: {requirements_data}")
            
            # Get thread_id for this email
            thread_id = self._get_thread_id(email_data)
            current_app.logger.info(f"Thread ID for email {email_data.get('subject', '')}: {thread_id}")
            
            # Check if we already have a requirement for this thread
            existing_requirement = None
            if thread_id:
                existing_requirement = Requirement.query.filter_by(thread_id=thread_id).first()
                if existing_requirement:
                    current_app.logger.info(f"Found existing requirement {existing_requirement.request_id} for thread {thread_id}")
            
            # Create or update requirement - ONLY for RFH emails
            requirement = None
            if create_requirements:
                current_app.logger.info(f"create_requirements=True for email {email_data.get('subject', '')}")
                
                # Check if this is an RFH email
                is_rfh_email = self._is_rfh_email(email_data)
                
                if is_rfh_email:
                    current_app.logger.info(f"Processing RFH email: {email_data.get('subject', '')}")
                    
                    if existing_requirement:
                        # Update existing requirement with new information
                        current_app.logger.info(f"Updating existing requirement {existing_requirement.request_id}")
                        
                        # Update requirement with new data if available
                        if requirements_data and self._is_valid_requirement(requirements_data, is_rfh_email=True):
                            for key, value in requirements_data.items():
                                if hasattr(existing_requirement, key) and value is not None:
                                    setattr(existing_requirement, key, value)
                        
                        # Update email metadata
                        existing_requirement.email_id = email_id
                        existing_requirement.email_subject = email_data.get('subject')
                        existing_requirement.sender_email = sender_email
                        existing_requirement.sender_name = sender_name
                        existing_requirement.company_name = company_name
                        existing_requirement.received_datetime = datetime.fromisoformat(email_data.get('receivedDateTime', '').replace('Z', '+00:00')) if email_data.get('receivedDateTime') else None
                        existing_requirement.updated_at = datetime.utcnow()
                        
                        from app.database import db
                        db.session.commit()
                        requirement = existing_requirement
                        current_app.logger.info(f"Updated existing requirement {requirement.request_id}")
                        
                    else:
                        # Create new requirement for RFH email
                        if requirements_data and self._is_valid_requirement(requirements_data, is_rfh_email=True):
                            current_app.logger.info(f"Creating new requirement for RFH thread {thread_id}")
                            if not self._is_duplicate_requirement(email_data):
                                requirement = self._create_requirement(requirements_data, email_data)
                                if requirement:
                                    current_app.logger.info(f"Successfully created requirement with ID {requirement.id} for RFH thread {thread_id}")
                                else:
                                    current_app.logger.warning(f"Failed to create requirement for RFH thread {thread_id}")
                            else:
                                current_app.logger.info(f"Skipping duplicate requirement for RFH thread {thread_id}")
                        else:
                            current_app.logger.info(f"No valid requirements data found for RFH thread {thread_id}")
                else:
                    current_app.logger.info(f"Not an RFH email, skipping requirement creation: {email_data.get('subject', '')}")
            else:
                current_app.logger.info(f"create_requirements=False for email {email_data.get('subject', '')}")
                
                # No automatic requirement creation for non-RFH emails
                # Profiles are extracted but no requirement is created automatically
            
            return {
                'email_id': email_id, 
                'profiles_created': len(created_profiles), 
                'requirement_created': bool(requirement),
                'requirements_data': requirements_data if requirements_data else None,
                'thread_id': thread_id,
                'existing_requirement_updated': existing_requirement is not None,
                'is_rfh_email': self._is_rfh_email(email_data)
            }
        except Exception as e:
            current_app.logger.error(f"Error processing email: {e}")
            return {'error': str(e)}

    def fetch_emails(self, days: int = None) -> List[Dict[str, Any]]:
        """Fetch all emails (no date limit) or from the last N days if specified"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                print("Failed to get access token")
                return []

            # Microsoft Graph API endpoint - fetch only from inbox
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/mailFolders/inbox/messages'
            
            # Query parameters - request HTML content
            params = {
                '$select': 'id,subject,sender,receivedDateTime,body,from,hasAttachments,bodyPreview',
                '$expand': 'attachments',
                '$orderby': 'receivedDateTime desc',
                '$top': 200  # Increased limit to 200 emails per request to get more historical emails
            }
            
            # Add date filter only if days parameter is specified
            if days is not None:
                end_date = datetime.utcnow()
                start_date = end_date - timedelta(days=days)
                start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
                params['$filter'] = f"receivedDateTime ge {start_date_str}"
                current_app.logger.info(f"Fetching emails from {start_date_str} to {end_date.strftime('%Y-%m-%dT%H:%M:%SZ')} (last {days} days)")
            else:
                current_app.logger.info("Fetching all emails (no date filter)")
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json',
                'Prefer': 'outlook.body-content-type="html"'  # Request HTML content
            }
            
            # Make the request
            response = requests.get(endpoint, headers=headers, params=params)
            if response.status_code != 200:
                print(f"Error fetching emails: {response.status_code} - {response.text}")
                return []
            
            data = response.json()
            emails = data.get('value', [])
            print(f"Found {len(emails)} emails in the date range")
            current_app.logger.info(f"Fetched {len(emails)} emails from Microsoft Graph API (days parameter: {days})")
            
            processed_emails = []
            errors = 0
            
            for email in emails:
                try:
                    # Get body content
                    body = email.get('body', {})
                    if isinstance(body, dict):
                        body_content = body.get('content', '')
                        content_type = body.get('contentType', 'text')
                    else:
                        body_content = str(body)
                        content_type = 'text'

                    # Get sender info
                    from_info = email.get('from', {})
                    if isinstance(from_info, dict):
                        sender = from_info.get('emailAddress', {}).get('address', '')
                    else:
                        sender = email.get('sender', '')

                    # Process attachments
                    attachments = []
                    for attachment in email.get('attachments', []):
                        if attachment.get('contentType', '').lower() in ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
                            attachment_data = base64.b64decode(attachment.get('contentBytes', ''))
                            file_path = self._save_attachment(attachment_data, attachment.get('name', ''))
                            if file_path:
                                attachments.append({
                                    'filename': attachment.get('name', ''),
                                    'contentType': attachment.get('contentType', ''),
                                    'size': attachment.get('size', 0),
                                    'path': file_path
                                })

                    # Clean CID URLs from body content
                    cleaned_body_content = self._clean_cid_urls(body_content)

                    # Create processed email
                    processed_email = {
                        'id': email.get('id', ''),
                        'subject': email.get('subject', ''),
                        'sender': sender,
                        'receivedDateTime': email.get('receivedDateTime', ''),
                        'body': cleaned_body_content,
                        'body_content_type': content_type,
                        'clean_body': self._clean_text(cleaned_body_content) if content_type.lower() == 'html' else cleaned_body_content,
                        'full_body': cleaned_body_content,
                        'body_preview': email.get('bodyPreview', ''),
                        'attachments': attachments
                    }
                    processed_emails.append(processed_email)
                except Exception as e:
                    print(f"Error processing email {email.get('subject', '')}: {str(e)}")
                    errors += 1
            
            print(f"Successfully processed {len(processed_emails)} emails, errors on {errors} emails")
            return processed_emails
            
        except Exception as e:
            print(f"Error in fetch_emails: {str(e)}")
            return []

    def filter_recruiter_emails(self, emails: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Return all emails without filtering"""
        return emails 

    def test_token(self) -> Dict[str, str]:
        """Test Microsoft Graph API token"""
        try:
            access_token = self._get_access_token()
            if access_token:
                return {'status': 'success', 'message': 'Token acquisition successful'}
            else:
                return {'status': 'error', 'message': 'Failed to acquire token'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_recruiter_emails(self, days: int = None) -> List[Dict[str, Any]]:
        """Get recruiter emails with more precise filtering (exclude replies)"""
        try:
            all_emails = self.fetch_emails(days)
            hiring_keywords = [
                'rfh', 'request for hiring', 'requirement', 'urgent requirement', 'candidates required', 'very urgent :'
            ]
            email_threads = {}
            for email in all_emails:
                subject = email.get('subject', '').strip()
                subject_lower = subject.lower()
                # Exclude replies (subject starts with 're:')
                if subject_lower.startswith('re:'):
                    continue
                if not any(keyword in subject_lower for keyword in hiring_keywords):
                    continue
                clean_subject = self._clean_email_subject(subject_lower)
                received_time = email.get('receivedDateTime', '')
                is_reply = any(prefix in subject_lower for prefix in ['re:', 'fw:', 'fwd:', 'forward:'])
                if clean_subject in email_threads:
                    existing_time = email_threads[clean_subject].get('receivedDateTime', '')
                    if (not is_reply and received_time < existing_time) or \
                       (is_reply and all(prefix in email_threads[clean_subject].get('subject', '').lower() 
                                       for prefix in ['re:', 'fw:', 'fwd:', 'forward:'])):
                        email_threads[clean_subject] = email
                else:
                    if not is_reply or not any(
                        self._clean_email_subject(e.get('subject', '')).lower() == clean_subject 
                        for e in all_emails 
                        if not any(prefix in e.get('subject', '').lower() 
                                 for prefix in ['re:', 'fw:', 'fwd:', 'forward:'])
                    ):
                        email_threads[clean_subject] = email
            return list(email_threads.values())
        except Exception as e:
            current_app.logger.error(f"Error fetching recruiter emails: {str(e)}")
            return []

    def _generate_request_id(self) -> str:
        """Generate a unique request ID in the format Req001, Req002, etc."""
        from app.models.requirement import Requirement
        
        try:
            # Get the latest requirement with a request_id
            latest_req = Requirement.query.filter(
                Requirement.request_id.isnot(None)
            ).order_by(
                Requirement.request_id.desc()
            ).first()
            
            if latest_req and latest_req.request_id:
                # Extract the number from the latest request ID
                match = re.search(r'Req(\d+)', latest_req.request_id)
                if match:
                    next_num = int(match.group(1)) + 1
                else:
                    next_num = 1
            else:
                next_num = 1
            
            # Generate the new request ID
            request_id = f"Req{next_num:03d}"
            
            # Ensure uniqueness (in case of race conditions)
            while Requirement.query.filter_by(request_id=request_id).first():
                next_num += 1
                request_id = f"Req{next_num:03d}"
            
            return request_id
            
        except Exception as e:
            current_app.logger.error(f"Error generating request ID: {str(e)}")
            # Fallback to timestamp-based ID
            import time
            return f"Req{int(time.time() % 10000):04d}"

    def _is_rfh_email(self, email_data: Dict[str, Any]) -> bool:
        """Detect if an email is an RFH (Request for Hiring) email"""
        try:
            subject = email_data.get('subject', '').lower()
            body = email_data.get('body', '')
            clean_body = email_data.get('clean_body', '').lower()
            
            # EXCLUDE reply/forward emails from being considered as RFH
            if subject.startswith(('re:', 'fw:', 'fwd:', 'forward:')):
                current_app.logger.info(f"Excluding reply/forward email from RFH detection: {subject[:50]}...")
                return False
            
            # RFH keywords in subject
            rfh_subject_keywords = [
                'request for hire', 'request for hiring', 'rfh', 'hiring request', 'requirement',
                'urgent requirement', 'job opening', 'position opening',
                'hiring', 'recruitment', 'job posting', 'vacancy'
            ]
            
            # RFH keywords in body
            rfh_body_keywords = [
                'request for hire', 'rfh', 'hiring manager', 'job title',
                'experience range', 'skills required', 'minimum qualification',
                'number of positions', 'budget', 'ctc', 'tentative doj',
                'department', 'location', 'shift', 'job type'
            ]
            
            # Check subject
            subject_match = any(keyword in subject for keyword in rfh_subject_keywords)
            
            # Check body for multiple RFH indicators
            body_matches = sum(1 for keyword in rfh_body_keywords if keyword in clean_body)
            
            # Consider it an RFH email if:
            # 1. Subject contains RFH keywords, OR
            # 2. Body contains 3+ RFH keywords
            is_rfh = subject_match or body_matches >= 3
            
            if is_rfh:
                current_app.logger.info(f"Detected RFH email: {subject[:50]}... (subject_match: {subject_match}, body_matches: {body_matches})")
            
            return is_rfh
            
        except Exception as e:
            current_app.logger.error(f"Error detecting RFH email: {str(e)}")
            return False

    def _is_hiring_email(self, email_data: Dict[str, Any]) -> bool:
        """Determine if an email is a hiring-related email based on subject keywords"""
        try:
            subject = email_data.get('subject', '').strip()
            if not subject:
                return False
            
            subject_lower = subject.lower()
            
            # Exclude replies (subject starts with 're:')
            if subject_lower.startswith('re:'):
                return False
            
            # Check for hiring keywords (matching frontend hiring data tab logic)
            hiring_keywords = [
                'rfh', 'request for hiring', 'requirement', 'urgent requirement', 'candidates required', 'very urgent :'
            ]
            
            # Check if any hiring keyword is present in the subject
            if any(keyword in subject_lower for keyword in hiring_keywords):
                return True
            
            # Also check for offer recommendation emails
            if self._is_offer_recommendation_email(email_data):
                return True
            
            return False
        except Exception as e:
            current_app.logger.error(f"Error checking if email is hiring-related: {str(e)}")
            return False

    def _extract_company_name(self, email_data: Dict[str, Any]) -> Optional[str]:
        """Extract company name from email content, not from sender or email signature"""
        try:
            # First, try to extract company name from subject line for RFH emails
            subject = email_data.get('subject', '')
            if subject:
                # Handle RFH format: "RFH : Job Title - Company - Location"
                rfh_company_location_pattern = r'RFH\s*:\s*[^-]+?\s*-\s*([^-]+?)\s*-\s*[^-]+$'
                rfh_match = re.search(rfh_company_location_pattern, subject, re.IGNORECASE)
                if rfh_match:
                    company = rfh_match.group(1).strip()
                    if company and len(company) >= 3 and company.lower() != 'rfh':
                        current_app.logger.info(f"Extracted company name from RFH subject (company-location pattern): '{company}'")
                        return company
                
                # Handle RFH format: "RFH : Job Title - Company"
                rfh_company_pattern = r'RFH\s*:\s*[^-]+?\s*-\s*([^-]+?)$'
                rfh_match = re.search(rfh_company_pattern, subject, re.IGNORECASE)
                if rfh_match:
                    company = rfh_match.group(1).strip()
                    if company and len(company) >= 3 and company.lower() != 'rfh':
                        current_app.logger.info(f"Extracted company name from RFH subject (company pattern): '{company}'")
                        return company
            
            content = email_data.get('body', '')
            if not content:
                return None
            
            # Clean the content to remove email signatures and common noise
            cleaned_content = self._clean_text(content)
            
            # Remove email signatures and common footer text
            signature_patterns = [
                r'---\s*Original Message\s*---.*$',
                r'From:.*?Sent:.*?To:.*?Subject:.*$',
                r'Phone:.*?Mobile:.*?Email:.*?Address:.*$',
                r'www\.[^\s]+',
                r'RIGVED TECHNOLOGIES[^.]*',
                r'rigvedtech\.com[^.]*',
                r'Anshu Baranwal[^.]*',
                r'HR[^.]*Talent Acquisition[^.]*',
                r'Unit No\. 315[^.]*',
                r'Millennuim Business Park[^.]*',
                r'Mahape[^.]*Navi Mumbai[^.]*',
                r'District[^.]*Thane[^.]*Maharashtra[^.]*',
                r'India[^.]*400710[^.]*',
                r'The content of this email is confidential[^.]*',
                r'This email and any files transmitted with it[^.]*',
                r'Best regards[^.]*',
                r'Thanks[^.]*',
                r'Regards[^.]*',
                r'Sincerely[^.]*',
                r'Kind regards[^.]*'
            ]
            
            for pattern in signature_patterns:
                cleaned_content = re.sub(pattern, '', cleaned_content, flags=re.IGNORECASE | re.DOTALL)
            
            # Look for company names in the email content
            company_patterns = [
                # Look for "Company:" or "Client:" patterns
                r'(?:Company|Client|Organization|Employer)\s*(?::|-)\s*([A-Za-z\s&\.\-]{3,30})(?:\s+Location|\s+Address|\s+City|\s+State)?',
                # Look for "About [Company]" patterns
                r'About\s+([A-Za-z\s&\.\-]{3,30})',
                # Look for "working with [Company]" patterns
                r'(?:working\s+with|partnered\s+with|collaborating\s+with)\s+([A-Za-z\s&\.\-]{3,30})',
                # Look for "hiring for [Company]" patterns
                r'(?:hiring\s+for|requirement\s+for|position\s+at)\s+([A-Za-z\s&\.\-]{3,30})',
                # Look for company names in quotes or brackets
                r'["\[\(]([A-Za-z\s&\.\-]{3,30})["\]\)]',
                # Look for company names followed by common words
                r'([A-Za-z\s&\.\-]{3,30})\s+(?:Technologies|Solutions|Systems|Services|Corporation|Inc|Ltd|Limited|Pvt|Private)',
                # Look for specific company mentions
                r'(?:Bosch|Eclerx|Tata|Infosys|TCS|Wipro|HCL|Tech\s+Mahindra|Cognizant|Accenture|IBM|Oracle|Microsoft|Google|Amazon|Meta|Apple|Netflix|Uber|Airbnb)',
                # Look for company names in subject line patterns
                r'([A-Za-z\s&\.\-]{3,30})\s*[-–]\s*(?:Technical|Developer|Engineer|Lead|Manager|Design|Full\s+Stack)'
            ]
            
            found_companies = []
            for pattern in company_patterns:
                matches = re.findall(pattern, cleaned_content, re.IGNORECASE)
                for match in matches:
                    company = match.strip()
                    # Remove trailing words like Location, Address, City, State, etc.
                    company = re.sub(r'\b(Location|Address|City|State|Region|Area|Zone|Branch|Office|Place|Country|Site|Campus|Unit|Division|Dept|Department|Section|Block|Floor|Wing|Building|Tower|Room|Suite|Lab|Plant|Factory|Works|Complex|Park|Plaza|Centre|Center|Mall|Market|Road|Street|Avenue|Lane|Drive|Boulevard|Circle|Court|Square|Terrace|View|Heights|Gardens|Residency|Estate|Enclave|Colony|Society|Nagar|Vihar|Chowk|Gali|Bypass|Expressway|Highway|Junction|Cross|Gate|Stop|Stand|Depot|Yard|Warehouse|Store|Shop|Outlet|Showroom|Studio|Hall|Auditorium|Theater|Cinema|Club|Bar|Restaurant|Cafe|Hotel|Inn|Motel|Resort|Lodge|Guesthouse|Hostel|PG|Apartment|Flat|House|Villa|Bungalow|Cottage|Farmhouse|Farm|Plot|Land|Site|Premises|Property|Building|Complex|Tower|Block|Floor|Room|Suite|Lab|Plant|Factory|Works|Campus|Park|Plaza|Centre|Center|Mall|Market|Road|Street|Avenue|Lane|Drive|Boulevard|Circle|Court|Square|Terrace|View|Heights|Gardens|Residency|Estate|Enclave|Colony|Society|Nagar|Vihar|Chowk|Gali|Bypass|Expressway|Highway|Junction|Cross|Gate|Stop|Stand|Depot|Yard|Warehouse|Store|Shop|Outlet|Showroom|Studio|Hall|Auditorium|Theater|Cinema|Club|Bar|Restaurant|Cafe|Hotel|Inn|Motel|Resort|Lodge|Guesthouse|Hostel|PG|Apartment|Flat|House|Villa|Bungalow|Cottage|Farmhouse|Farm|Plot|Land|Site|Premises|Property)\b.*$', '', company, flags=re.IGNORECASE)
                    # Clean up the company name
                    company = re.sub(r'\s+', ' ', company)
                    company = re.sub(r'[^\w\s&\.\-]', '', company)
                    company = company.strip()
                    # Skip if it's too short or contains common noise
                    if (len(company) >= 3 and 
                        company.lower() not in ['rigved', 'technologies', 'pvt', 'ltd', 'limited', 'inc', 'corporation', 'company', 'client', 'organization', 'rfh'] and
                        not any(word in company.lower() for word in ['phone', 'mobile', 'email', 'address', 'contact', 'hr', 'recruiter', 'talent'])):
                        found_companies.append(company)
            
            # If we found multiple companies, prefer the first one that's not Rigved
            for company in found_companies:
                if 'rigved' not in company.lower():
                    return company
            
            # If no company found in content, try to extract from subject line (fallback for non-RFH emails)
            if subject:
                # Look for company names in subject
                subject_companies = re.findall(r'([A-Za-z\s&\.\-]{3,30})\s*[-–]\s*(?:Technical|Developer|Engineer|Lead|Manager|Design|Full\s+Stack)', subject, re.IGNORECASE)
                for company in subject_companies:
                    company = company.strip()
                    if (len(company) >= 3 and 
                        company.lower() not in ['rigved', 'technologies', 'pvt', 'ltd', 'limited', 'rfh'] and
                        'rigved' not in company.lower()):
                        return company
            
            return None
            
        except Exception as e:
            current_app.logger.error(f"Error extracting company name: {str(e)}")
            return None

    def _clean_job_title(self, title: str) -> str:
        """Clean job title by removing contact info and other unwanted text"""
        if not title:
            return ''
        
        # Remove contact info sections
        title = re.sub(r'\|[^|]*(?:Phone|Mobile|Email|Address)[^|]*\|', '|', title)
        # Remove email addresses
        title = re.sub(r'\S+@\S+\.\S+', '', title)
        # Remove phone numbers
        title = re.sub(r'[\+\d\-\(\)\s]{10,}', '', title)
        # Remove multiple pipes and dashes
        title = re.sub(r'[\|\-]{2,}', '|', title)
        # Remove asterisks and brackets
        title = re.sub(r'[\*\[\]\(\)]', '', title)
        # Remove HR/recruiter info
        title = re.sub(r'\|[^|]*(?:HR|Recruiter|Talent)[^|]*\|', '|', title, flags=re.IGNORECASE)
        # Remove company names
        title = re.sub(r'\|[^|]*(?:Technologies|Pvt|Ltd|Limited)[^|]*\|', '|', title, flags=re.IGNORECASE)
        # Clean up pipes
        title = re.sub(r'\|\s*\|', '|', title)
        title = re.sub(r'^\s*\|\s*|\s*\|\s*$', '', title)
        # Clean up whitespace
        title = re.sub(r'\s+', ' ', title).strip()
        
        return title

    def _extract_contact_info(self, text: str) -> Dict[str, str]:
        """Extract contact information from text"""
        info = {
            'contact_no': None,
            'current_company': None,
            'current_salary': None
        }
        
        # Extract phone numbers
        phone_matches = re.findall(r'(?:Phone|Mobile|Tel|Contact|Ph)[^\w\+]*?([\+\d\-\(\)\s]{10,})', text, re.IGNORECASE)
        if phone_matches:
            # Clean and format phone number
            number = re.sub(r'[^\d]', '', phone_matches[0])
            if len(number) >= 10:
                info['contact_no'] = number
        
        # Extract current company
        company_patterns = [
            r'(?:Current\s+Company|Company|Organization|Employer|Client)\s*(?::|-)?\s*([^,\n]{3,50})',
            r'(?:working|employed)\s+(?:at|with|in)\s+([^,\n]{3,50})',
            r'(?:present|current)\s+(?:company|employer|organization)\s*(?::|-)?\s*([^,\n]{3,50})'
        ]
        
        for pattern in company_patterns:
            company_matches = re.findall(pattern, text, re.IGNORECASE)
            if company_matches:
                company = company_matches[0].strip()
                # Remove common noise words
                company = re.sub(r'\b(?:pvt|private|limited|ltd|inc|llc)\b', '', company, flags=re.IGNORECASE)
                company = re.sub(r'\s+', ' ', company).strip()
                if company:
                    info['current_company'] = company
                    break
        
        # Extract current salary/CTC
        salary_patterns = [
            r'(?:Current\s+(?:CTC|Salary)|Present\s+CTC)\s*(?::|-)?\s*([\d\.,]+\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum))',
            r'(?:drawing|earning)\s+(?:salary|package|ctc)\s+(?:of\s+)?([\d\.,]+\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum))',
            r'(?:salary|package|ctc)\s*(?::|-)?\s*([\d\.,]+\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum))'
        ]
        
        for pattern in salary_patterns:
            salary_matches = re.findall(pattern, text, re.IGNORECASE)
            if salary_matches:
                salary = salary_matches[0].strip()
                # Clean up the salary value
                salary = re.sub(r'[^\d\.-]', '', salary)
                if salary:
                    info['current_salary'] = salary
                    break
        
        return info

    def _extract_budget_ctc(self, text: str) -> Optional[str]:
        """Extract budget CTC from text"""
        # Look for budget/CTC patterns
        patterns = [
            r'(?:Budget(?:ed)?\s+)?(?:CTC|Cost|Package|Salary)\s*(?:Range|Band)?\s*(?::|-)?\s*([\d\.,]+(?:\s*-\s*[\d\.,]+)?\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum))',
            r'(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum)',
            r'(?:Budget|CTC|Salary)\s*(?::|-)?\s*([\d\.,]+(?:\s*-\s*[\d\.,]+)?)\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum)',
            r'(?:range|band)\s*(?::|-)?\s*([\d\.,]+(?:\s*-\s*[\d\.,]+)?)\s*(?:LPA|Lakhs?|L|Lacs|PA|per\s+annum)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # Clean and format the CTC value
                ctc = matches[0].strip()
                # Remove currency symbols and extra text
                ctc = re.sub(r'[₹Rs\.]', '', ctc)
                # Clean up whitespace around hyphen
                ctc = re.sub(r'\s*-\s*', '-', ctc)
                # Remove any non-numeric chars except - and .
                ctc = re.sub(r'[^\d\.-]', '', ctc)
                if ctc:
                    return ctc
        
        return None

    def _extract_skills(self, text: str) -> Optional[str]:
        """Extract skills from text"""
        skills = set()
        
        # Look for skills section
        skills_section_patterns = [
            r'(?:Key\s+)?Skills\s*(?:Required|Needed|:|-)([^.]*)',
            r'Technical\s+Skills\s*(?::|-)([^.]*)',
            r'(?:Must|Should)\s+Have\s*(?:Skills)?(?::|-)([^.]*)',
            r'Requirements?\s*(?::|-)([^.]*)',
            r'(?:Technical\s+)?(?:Expertise|Knowledge)\s*(?::|-)([^.]*)',
            r'(?:Core\s+)?Competencies\s*(?::|-)([^.]*)'
        ]
        
        for pattern in skills_section_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                # Split by common delimiters
                for skill in re.split(r'[,;•\n]', match):
                    skill = skill.strip()
                    if skill and len(skill) > 2 and not any(x in skill.lower() for x in [
                        'year', 'month', 'experience', 'ctc', 'salary', 'lpa', 'location',
                        'qualification', 'degree', 'education', 'certification'
                    ]):
                        skills.add(skill)
        
        # If no skills found in sections, try to extract from bullet points
        if not skills:
            bullet_points = re.findall(r'(?:^|\n)\s*[•\-\*]\s*([^\n]+)', text)
            for point in bullet_points:
                point = point.strip()
                if point and len(point) > 2 and not any(x in point.lower() for x in [
                    'year', 'month', 'experience', 'ctc', 'salary', 'lpa', 'location',
                    'qualification', 'degree', 'education', 'certification'
                ]):
                    skills.add(point)
        
        # Look for technology stacks
        tech_patterns = [
            r'(?:tech(?:nology)?\s+stack|stack|technologies)\s*(?::|-)([^.]*)',
            r'(?:programming\s+)?languages?\s*(?::|-)([^.]*)',
            r'(?:frameworks?|tools)\s*(?::|-)([^.]*)'
        ]
        
        for pattern in tech_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                for skill in re.split(r'[,;•\n]', match):
                    skill = skill.strip()
                    if skill and len(skill) > 2 and not any(x in skill.lower() for x in [
                        'year', 'month', 'experience', 'ctc', 'salary', 'lpa', 'location',
                        'qualification', 'degree', 'education', 'certification'
                    ]):
                        skills.add(skill)
        
        if skills:
            return '\n'.join(f'• {skill}' for skill in sorted(skills))
        return None

    def _is_valid_requirement(self, requirement_data, is_rfh_email=False):
        def is_meaningful(val):
            return val and str(val).strip().lower() not in ["", "none", "not specified", "na", "null"]
        
        # For RFH emails, be much more lenient - just check if we have ANY meaningful data
        if is_rfh_email:
            current_app.logger.info(f"Validating RFH email requirement with lenient rules")
            
            # Check all possible fields for meaningful data
            all_fields = [
                requirement_data.get('job_title'),
                requirement_data.get('department'),
                requirement_data.get('location'),
                requirement_data.get('experience_range'),
                requirement_data.get('skills_required'),
                requirement_data.get('hiring_manager'),
                requirement_data.get('budget_ctc'),
                requirement_data.get('number_of_positions'),
                requirement_data.get('shift'),
                requirement_data.get('job_type'),
                requirement_data.get('minimum_qualification'),
                requirement_data.get('tentative_doj'),
                requirement_data.get('additional_remarks')
            ]
            
            # If we have ANY meaningful field, consider it valid for RFH emails
            meaningful_fields = [f for f in all_fields if is_meaningful(f)]
            if meaningful_fields:
                current_app.logger.info(f"RFH requirement validation passed: Found {len(meaningful_fields)} meaningful fields")
                return True
            else:
                current_app.logger.warning(f"RFH requirement validation failed: No meaningful data found in any field")
                return False
        
        # Original strict validation for non-RFH emails
        # Job title is mandatory - a requirement without a job title is not valid
        job_title = requirement_data.get('job_title')
        if not is_meaningful(job_title):
            current_app.logger.warning(f"Requirement validation failed: No meaningful job title found")
            return False
        
        # Check if this looks like an RFH email by examining the job title
        # RFH emails often have technical job titles that are meaningful
        if job_title and len(job_title) > 3:
            # If job title looks like a real job title (not a request ID like "Req014")
            if not re.match(r'^Req\d+$', job_title, re.IGNORECASE):
                # For RFH emails, we can be more lenient - just job title is enough
                # But we should still check for at least one additional meaningful field
                additional_fields = [
                    requirement_data.get('department'),
                    requirement_data.get('location'),
                    requirement_data.get('experience_range'),
                    requirement_data.get('skills_required'),
                    requirement_data.get('hiring_manager'),
                    requirement_data.get('budget_ctc'),
                    requirement_data.get('number_of_positions'),
                ]
                
                # If we have at least one additional meaningful field, it's valid
                if any(is_meaningful(f) for f in additional_fields):
                    current_app.logger.info(f"Requirement validation passed: Job title '{job_title}' + additional fields")
                    return True
                
                # For RFH emails with just job title, still consider valid if job title is substantial
                if len(job_title) > 5 and any(word in job_title.lower() for word in [
                    'developer', 'engineer', 'analyst', 'manager', 'lead', 'architect', 
                    'consultant', 'specialist', 'tester', 'admin', 'support', 'designer'
                ]):
                    current_app.logger.info(f"Requirement validation passed: Substantial job title '{job_title}'")
                    return True
                else:
                    current_app.logger.warning(f"Requirement validation failed: Job title '{job_title}' not substantial enough")
            else:
                current_app.logger.warning(f"Requirement validation failed: Job title '{job_title}' looks like a request ID")
            
        current_app.logger.warning(f"Requirement validation failed: Job title '{job_title}' too short or invalid")
        return False

    def process_emails(self, days=30):
        """Process emails and extract requirements"""
        try:
            emails = self.fetch_emails(days)
            current_app.logger.info(f"Processing {len(emails)} emails")
            
            for email_data in emails:
                try:
                    requirement_data = self._extract_job_requirements(email_data.get('body', ''), email_data)
                    is_rfh = self._is_rfh_email(email_data)
                    if requirement_data and self._is_valid_requirement(requirement_data, is_rfh_email=is_rfh):
                        if not self._is_duplicate_requirement(email_data):
                            self._create_requirement(requirement_data, email_data)
                        else:
                            current_app.logger.info(f"Skipping duplicate requirement for email {email_data.get('subject')}")
                    else:
                        current_app.logger.info(f"Skipping empty/invalid requirement for email {email_data.get('subject')}")
                except Exception as e:
                    current_app.logger.error(f"Error processing email {email_data.get('subject', 'Unknown')}: {str(e)}")
                    continue
                    
        except Exception as e:
            current_app.logger.error(f"Error in process_emails: {str(e)}")
            raise

    def _extract_from_html_lists(self, text: str) -> Dict[str, Any]:
        """Extract requirement data from HTML list items"""
        try:
            # Look for list items with field names
            list_patterns = {
                'job_title': [
                    r'<li[^>]*>.*?job\s*title\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?position\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?role\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'department': [
                    r'<li[^>]*>.*?department\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?dept\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?division\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'location': [
                    r'<li[^>]*>.*?location\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?work\s*location\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?job\s*location\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'shift': [
                    r'<li[^>]*>.*?shift\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?timing\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'job_type': [
                    r'<li[^>]*>.*?job\s*type\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?employment\s*type\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'hiring_manager': [
                    r'<li[^>]*>.*?hiring\s*manager\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?manager\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'experience_range': [
                    r'<li[^>]*>.*?experience\s*range\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?experience\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?years\s*of\s*experience\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'skills_required': [
                    r'<li[^>]*>.*?skills\s*required\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?skills\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?technical\s*skills\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'minimum_qualification': [
                    r'<li[^>]*>.*?minimum\s*qualification\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?qualification\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?education\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'number_of_positions': [
                    r'<li[^>]*>.*?number\s*of\s*positions\s*:?\s*(\d+)(?:</li>|$)',
                    r'<li[^>]*>.*?positions\s*:?\s*(\d+)(?:</li>|$)',
                    r'<li[^>]*>.*?openings\s*:?\s*(\d+)(?:</li>|$)'
                ],
                'budget_ctc': [
                    r'<li[^>]*>.*?budgeted\s*ctc\s*range\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?budget\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?ctc\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?salary\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'tentative_doj': [
                    r'<li[^>]*>.*?tentative\s*doj\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?date\s*of\s*joining\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?joining\s*date\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ],
                'additional_remarks': [
                    r'<li[^>]*>.*?additional\s*remarks\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?remarks\s*:?\s*([^<>\n]+?)(?:</li>|$)',
                    r'<li[^>]*>.*?notes\s*:?\s*([^<>\n]+?)(?:</li>|$)'
                ]
            }
            
            extracted = {}
            for field, patterns in list_patterns.items():
                for pattern in patterns:
                    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
                    if match:
                        value = match.group(1).strip()
                        # Clean up the value
                        value = re.sub(r'^\s*[\[•\-\*]\s*', '', value)  # Remove leading bullets
                        value = re.sub(r'\s*[\]•\-\*]\s*$', '', value)  # Remove trailing bullets
                        value = re.sub(r'\s+', ' ', value)  # Normalize whitespace
                        value = value.strip(':-,. \t\n')  # Remove punctuation
                        
                        if value and value.lower() not in ['none', 'not specified', 'na', 'null', '']:
                            extracted[field] = value
                            current_app.logger.info(f"Extracted {field} from HTML list: {value}")
                            break
            
            return extracted
            
        except Exception as e:
            current_app.logger.error(f"Error extracting from HTML lists: {str(e)}")
            return {}

    def _parse_date_value(self, value: str) -> Optional[datetime.date]:
        """Parse date value and return a proper date object or None if invalid"""
        if not value:
            return None
            
        value = str(value).strip().lower()
        
        # Handle immediate/urgent cases
        if any(keyword in value for keyword in ['immediate', 'urgent', 'asap', 'need', 'joiners']):
            return None
            
        # Try common date formats
        date_formats = [
            '%Y-%m-%d',
            '%d-%m-%Y', 
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%d-%m-%y',
            '%d/%m/%y',
            '%Y/%m/%d'
        ]
        
        for fmt in date_formats:
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
                
        # Try to extract date from text like "15th July 2025"
        try:
            from dateutil import parser
            return parser.parse(value).date()
        except:
            pass
            
        return None



    def _is_offer_recommendation_email(self, email_data: Dict[str, Any]) -> bool:
        """Determine if an email is an offer recommendation email based on subject and content keywords"""
        try:
            subject = email_data.get('subject', '').strip()
            body = email_data.get('body', '') or email_data.get('clean_body', '')
            
            if not subject and not body:
                return False
            
            subject_lower = subject.lower()
            body_lower = body.lower()
            
            # Define offer recommendation keywords and patterns
            offer_keywords = [
                'offer recommendation', 'offer letter', 'job offer',
                'offer for', 'recommendation for offer', 'selected for offer',
                'offer approval', 'offer extended', 'compensation discussion',
                'we can offer', 'pleased to offer', 'extend an offer',
                'make an offer', 'candidate is selected', 'cleared all rounds',
                'final round cleared', 'fitment', 'ctc approved'
            ]
            
            # Check subject keywords
            for keyword in offer_keywords:
                if keyword in subject_lower:
                    current_app.logger.info(f"Detected offer recommendation email by subject keyword: {keyword}")
                    return True
            
            # Check body keywords
            for keyword in offer_keywords:
                if keyword in body_lower:
                    current_app.logger.info(f"Detected offer recommendation email by body keyword: {keyword}")
                    return True
            
            # Check regex patterns for more complex matches
            offer_patterns = [
                r'(?i)offer\s+recommendation',
                r'(?i)recommend(?:ed|ing)?\s+for\s+(?:an\s+)?offer',
                r'(?i)we\s+(?:can|would\s+like\s+to)\s+(?:make\s+an\s+)?offer',
                r'(?i)(?:candidate|profile)\s+(?:is\s+)?selected\s+for\s+(?:an\s+)?offer',
                r'(?i)pleased\s+to\s+(?:make|extend)\s+an?\s+offer',
                r'(?i)offer\s+(?:letter|approval|package)',
                r'(?i)compensation\s+(?:discussion|package|details)',
                r'(?i)cleared\s+(?:all|final)\s+rounds?'
            ]
            
            for pattern in offer_patterns:
                if re.search(pattern, subject_lower) or re.search(pattern, body_lower):
                    current_app.logger.info(f"Detected offer recommendation email by pattern: {pattern}")
                    return True
            
            return False
            
        except Exception as e:
            current_app.logger.error(f"Error checking if email is offer recommendation: {str(e)}")
            return False

    def _is_interview_scheduled_email(self, email_data: Dict[str, Any]) -> bool:
        """Determine if an email is an interview scheduled email based on subject and content keywords"""
        try:
            subject = email_data.get('subject', '').strip()
            body = email_data.get('body', '') or email_data.get('clean_body', '')
            
            if not subject and not body:
                return False
            
            subject_lower = subject.lower()
            body_lower = body.lower()
            
            # Define interview scheduled keywords and patterns
            interview_keywords = [
                'interview scheduled', 'interview schedule', 'interview arranged',
                'interview confirmed', 'interview setup', 'interview booking',
                'interview appointment', 'interview date', 'interview time',
                'candidates selected for interview', 'profiles selected for interview',
                'interview scheduled for today', 'interview scheduled for tomorrow',
                'interview scheduled for next week', 'interview scheduled for',
                'interview call scheduled', 'technical interview scheduled',
                'hr interview scheduled', 'final interview scheduled',
                'interview round scheduled', 'interview process scheduled',
                'interview meeting scheduled', 'interview discussion scheduled',
                'interview evaluation scheduled', 'interview assessment scheduled',
                'interview screening scheduled', 'interview selection scheduled',
                'interview shortlisting scheduled', 'interview finalization scheduled'
            ]
            
            # Check subject keywords
            for keyword in interview_keywords:
                if keyword in subject_lower:
                    current_app.logger.info(f"Detected interview scheduled email by subject keyword: {keyword}")
                    return True
            
            # Check body keywords
            for keyword in interview_keywords:
                if keyword in body_lower:
                    current_app.logger.info(f"Detected interview scheduled email by body keyword: {keyword}")
                    return True
            
            # Check regex patterns for more complex matches
            interview_patterns = [
                r'(?i)interview\s+scheduled\s+(?:for|on|at)',
                r'(?i)interview\s+(?:has\s+been|is)\s+scheduled',
                r'(?i)(?:candidates?|profiles?)\s+selected\s+for\s+interview',
                r'(?i)interview\s+(?:call|round|process|meeting)\s+scheduled',
                r'(?i)(?:technical|hr|final)\s+interview\s+scheduled',
                r'(?i)interview\s+(?:discussion|evaluation|assessment)\s+scheduled',
                r'(?i)interview\s+(?:screening|selection|shortlisting)\s+scheduled',
                r'(?i)interview\s+finalization\s+scheduled',
                r'(?i)scheduled\s+(?:an?\s+)?interview',
                r'(?i)arranged\s+(?:an?\s+)?interview',
                r'(?i)confirmed\s+(?:an?\s+)?interview',
                r'(?i)setup\s+(?:an?\s+)?interview',
                r'(?i)booked\s+(?:an?\s+)?interview'
            ]
            
            for pattern in interview_patterns:
                if re.search(pattern, subject_lower) or re.search(pattern, body_lower):
                    current_app.logger.info(f"Detected interview scheduled email by pattern: {pattern}")
                    return True
            
            return False
            
        except Exception as e:
            current_app.logger.error(f"Error checking if email is interview scheduled: {str(e)}")
            return False

    def _update_requirement_status_for_interview_scheduled(self, requirement: 'Requirement', email_data: Dict[str, Any]) -> bool:
        """Update requirement status to 'Interview Scheduled' if email contains interview scheduled content"""
        try:
            if self._is_interview_scheduled_email(email_data):
                # Use enum-safe comparison and assignment
                from app.models.requirement import RequirementStatusEnum
                current_status_value = getattr(requirement.status, 'value', str(requirement.status))
                if current_status_value in [RequirementStatusEnum.Open.value, RequirementStatusEnum.Candidate_Submission.value]:
                    old_status = requirement.status
                    requirement.status = RequirementStatusEnum.Interview_Scheduled
                    requirement.updated_at = datetime.utcnow()
                    current_app.logger.info(f"Updated requirement {requirement.request_id} status from '{old_status}' to 'Interview Scheduled' based on email content")
                    return True
            return False
        except Exception as e:
            current_app.logger.error(f"Error updating requirement status for interview scheduled: {str(e)}")
            return False

    def _update_requirement_status_for_offer_recommendation(self, requirement: 'Requirement', email_data: Dict[str, Any]) -> bool:
        """Update requirement status to 'Offer Recommendation' if email contains offer recommendation content"""
        try:
            if self._is_offer_recommendation_email(email_data):
                # Use enum-safe comparison and assignment
                from app.models.requirement import RequirementStatusEnum
                current_status_value = getattr(requirement.status, 'value', str(requirement.status))
                if current_status_value in [RequirementStatusEnum.Open.value, RequirementStatusEnum.Candidate_Submission.value]:
                    old_status = requirement.status
                    requirement.status = RequirementStatusEnum.Offer_Recommendation
                    requirement.updated_at = datetime.utcnow()
                    current_app.logger.info(f"Updated requirement {requirement.request_id} status from '{old_status}' to 'Offer Recommendation' based on email content")
                    return True
            return False
        except Exception as e:
            current_app.logger.error(f"Error updating requirement status for offer recommendation: {str(e)}")
            return False

    def send_email(self, to_email: str, subject: str, body: str, request_id: str = None) -> Dict[str, Any]:
        """Send email using Microsoft Graph API"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}
            
            # Microsoft Graph API endpoint for sending emails
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/sendMail'
            
            # Prepare email message
            message = {
                'message': {
                    'subject': subject,
                    'body': {
                        'contentType': 'HTML',
                        'content': body
                    },
                    'toRecipients': [
                        {
                            'emailAddress': {
                                'address': to_email
                            }
                        }
                    ]
                },
                'saveToSentItems': True
            }
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Send the email
            response = requests.post(endpoint, headers=headers, json=message)
            
            if response.status_code == 202:  # 202 Accepted is the expected response
                current_app.logger.info(f"Email sent successfully to {to_email} for request {request_id}")
                return {
                    'success': True,
                    'message': 'Email sent successfully',
                    'email_data': {
                        'to': to_email,
                        'subject': subject,
                        'body': body,
                        'request_id': request_id,
                        'sent_at': datetime.utcnow().isoformat()
                    }
                }
            else:
                current_app.logger.error(f"Failed to send email: {response.status_code} - {response.text}")
                return {
                    'success': False,
                    'error': f'Failed to send email: {response.status_code} - {response.text}'
                }
                
        except Exception as e:
            current_app.logger.error(f"Error sending email: {str(e)}")
            return {
                'success': False,
                'error': f'Error sending email: {str(e)}'
            }

    def fetch_emails_since(self, since_datetime) -> List[Dict[str, Any]]:
        """Fetch emails received after the specified datetime"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                current_app.logger.error("Failed to get access token")
                return []

            # Format the datetime for Microsoft Graph API
            since_str = since_datetime.strftime('%Y-%m-%dT%H:%M:%SZ')

            # Microsoft Graph API endpoint - fetch only from inbox
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/mailFolders/inbox/messages'
            
            # Query parameters - request HTML content
            params = {
                '$select': 'id,subject,sender,receivedDateTime,body,from,hasAttachments,bodyPreview',
                '$expand': 'attachments',
                '$orderby': 'receivedDateTime desc',
                '$top': 200,  # Increased limit to 200 emails per request
                '$filter': f"receivedDateTime gt {since_str}"  # Only emails after last refresh
            }
            
            current_app.logger.info(f"Fetching emails since {since_str}")
            
            headers = {'Authorization': f'Bearer {access_token}'}
            all_emails = []
            next_link = endpoint
            
            # Handle pagination to get all emails since the specified time
            while next_link:
                if next_link == endpoint:
                    # First request
                    response = requests.get(next_link, headers=headers, params=params)
                else:
                    # Subsequent requests (next_link already contains full URL with params)
                    response = requests.get(next_link, headers=headers)
                
                current_app.logger.info(f"Response status: {response.status_code}")
                
                if response.status_code != 200:
                    current_app.logger.error(f"Error fetching emails: {response.text}")
                    break
                
                data = response.json()
                emails = data.get('value', [])
                all_emails.extend(emails)
                
                current_app.logger.info(f"Fetched {len(emails)} emails in this batch, total: {len(all_emails)}")
                
                # Check for more pages
                next_link = data.get('@odata.nextLink')
                if next_link:
                    current_app.logger.info("More emails available, fetching next page...")
            
            current_app.logger.info(f"Total emails fetched since {since_str}: {len(all_emails)}")
            return all_emails
            
        except Exception as e:
            current_app.logger.error(f"Error in fetch_emails_since: {str(e)}")
            return []

    def create_teams_meeting(self, subject: str, start_time: str, end_time: str, 
                            attendees: List[str] = None, request_id: str = None, 
                            meeting_type: str = 'interview', candidate_id: str = None) -> Dict[str, Any]:
        """Create a Microsoft Teams meeting using Microsoft Graph API"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}
            
            # Microsoft Graph API endpoint for creating events
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/events'
            
            # Generate unique marker for calendar tracking
            marker = ""
            if request_id and candidate_id:
                marker = f" [REQ-{request_id}|CAND-{candidate_id}|{meeting_type.upper()}]"
            
            # Prepare meeting data
            meeting_data = {
                'subject': subject + marker,
                'start': {
                    'dateTime': start_time,
                    'timeZone': 'UTC'
                },
                'end': {
                    'dateTime': end_time,
                    'timeZone': 'UTC'
                },
                'isOnlineMeeting': True,
                'onlineMeetingProvider': 'teamsForBusiness',
                'body': {
                    'contentType': 'HTML',
                    'content': f'''
                    <p><strong>Interview Meeting</strong></p>
                    <p>Request ID: {request_id}</p>
                    <p>Meeting Type: {meeting_type.replace('_', ' ').title()}</p>
                    <p>Subject: {subject}</p>
                    <p>Start Time: {start_time}</p>
                    <p>End Time: {end_time}</p>
                    <p>Please join the Teams meeting using the link provided.</p>
                    '''
                }
            }
            
            # Don't add attendees to avoid automatic email sending
            # Attendees will be added manually via the email sending process
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Create the meeting
            response = requests.post(endpoint, headers=headers, json=meeting_data)
            
            if response.status_code == 201:
                meeting_info = response.json()
                
                # Extract Teams meeting link
                teams_meeting_link = meeting_info.get('onlineMeeting', {}).get('joinUrl')
                
                if teams_meeting_link:
                    return {
                        'success': True,
                        'meeting_id': meeting_info.get('id'),
                        'teams_meeting_link': teams_meeting_link,
                        'subject': meeting_info.get('subject'),
                        'start_time': meeting_info.get('start', {}).get('dateTime'),
                        'end_time': meeting_info.get('end', {}).get('dateTime'),
                        'request_id': request_id,
                        'meeting_type': meeting_type
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Teams meeting created but no join link available'
                    }
            else:
                error_msg = f"Failed to create Teams meeting: {response.status_code} - {response.text}"
                current_app.logger.error(error_msg)
                return {'success': False, 'error': error_msg}
                
        except Exception as e:
            current_app.logger.error(f"Error creating Teams meeting: {str(e)}")
            return {'success': False, 'error': str(e)}

    def send_interview_email(self, to_email: str, subject: str, body: str, 
                           cc_email: str = '', teams_meeting_link: str = None,
                           meeting_details: Dict[str, Any] = None, request_id: str = None,
                           requirement: 'Requirement' = None, interview_step: str = 'interview_scheduled',
                           attachments=None) -> Dict[str, Any]:
        """Send interview email with Teams meeting link using Microsoft Graph API"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}
            
            # Microsoft Graph API endpoint for sending emails
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/sendMail'
            
            # Prepare email message
            message = {
                'message': {
                    'subject': subject,
                    'body': {
                        'contentType': 'HTML',
                        'content': body
                    },
                    'toRecipients': [
                        {
                            'emailAddress': {
                                'address': to_email
                            }
                        }
                    ]
                },
                'saveToSentItems': True
            }
            
            # Add Cc recipients if provided
            if cc_email and cc_email.strip():
                cc_emails = [email.strip() for email in cc_email.split(',') if email.strip()]
                if cc_emails:
                    message["message"]["ccRecipients"] = [
                        {
                            "emailAddress": {
                                "address": email
                            }
                        }
                        for email in cc_emails
                    ]
            
            # Add attachments if provided
            if attachments:
                import base64
                message["message"]["attachments"] = []
                for attachment in attachments:
                    try:
                        # Read file content
                        attachment.seek(0)  # Ensure we're at the beginning of the file
                        file_content = attachment.read()
                        encoded_content = base64.b64encode(file_content).decode('utf-8')
                        
                        # Determine content type
                        content_type = "application/octet-stream"  # Default
                        if attachment.filename.lower().endswith('.pdf'):
                            content_type = "application/pdf"
                        elif attachment.filename.lower().endswith('.docx'):
                            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        
                        message["message"]["attachments"].append({
                            "@odata.type": "#microsoft.graph.fileAttachment",
                            "name": attachment.filename,
                            "contentType": content_type,
                            "contentBytes": encoded_content
                        })
                    except Exception as e:
                        current_app.logger.error(f"Error processing attachment {attachment.filename}: {str(e)}")
                        continue
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Send the email
            response = requests.post(endpoint, headers=headers, json=message)
            
            if response.status_code == 202:  # 202 Accepted is the expected response
                current_app.logger.info(f"Interview email sent successfully to {to_email} for request {request_id}")
                return {
                    'success': True,
                    'message': 'Interview email sent successfully',
                    'email_data': {
                        'to': to_email,
                        'subject': subject,
                        'body': body,
                        'teams_meeting_link': teams_meeting_link,
                        'request_id': request_id,
                        'interview_step': interview_step,
                        'sent_at': datetime.utcnow().isoformat()
                    }
                }
            else:
                current_app.logger.error(f"Failed to send interview email: {response.status_code} - {response.text}")
                return {
                    'success': False,
                    'error': f'Failed to send interview email: {response.status_code} - {response.text}'
                }
                
        except Exception as e:
            current_app.logger.error(f"Error sending interview email: {str(e)}")
            return {
                'success': False,
                'error': f'Error sending interview email: {str(e)}'
            }