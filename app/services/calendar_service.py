import requests
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from flask import current_app
import json
from functools import lru_cache


# Global storage for meeting information (persists between requests)
_global_meeting_storage = {}

class CalendarService:
    def __init__(self, user_email: str = None):
        self.user_email = user_email or current_app.config.get('MICROSOFT_EMAIL')
        self.cache = {}
        self.cache_ttl = 900  # 15 minutes cache

    def _get_access_token(self) -> Optional[str]:
        """Get Microsoft Graph access token"""
        try:
            # Use the same token mechanism as EmailProcessor
            from .email_processor import EmailProcessor
            email_processor = EmailProcessor()
            return email_processor._get_access_token()
        except Exception as e:
            current_app.logger.error(f"Error getting access token: {str(e)}")
            return None

    def _generate_meeting_marker(self, request_id: str, candidate_id: str, round_type: str) -> str:
        """Generate a unique marker for calendar events"""
        return f"[REQ-{request_id}|CAND-{candidate_id}|{round_type.upper()}]"

    def _extract_meeting_info_from_marker(self, subject: str) -> Optional[Dict[str, str]]:
        """Extract meeting info from subject marker"""
        pattern = r'\[REQ-([^|]+)\|CAND-([^|]+)\|([^\]]+)\]'
        match = re.search(pattern, subject)
        if match:
            return {
                'request_id': match.group(1),
                'candidate_id': match.group(2),
                'round_type': match.group(3)
            }
        return None

    def _is_valid_teams_meeting(self, event: Dict[str, Any]) -> bool:
        """Check if event is a valid Teams meeting"""
        return (
            event.get('isOnlineMeeting') and
            event.get('onlineMeetingProvider') == 'teamsForBusiness' and
            event.get('onlineMeeting', {}).get('joinUrl')
        )

    def _format_meeting_time(self, start_time: str, end_time: str, timezone: str = 'UTC') -> str:
        """Format meeting time for display"""
        try:
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            
            # Format as "Fri, Sep 12 · 10:00–10:45 (UTC)"
            start_str = start_dt.strftime('%a, %b %d · %H:%M')
            end_str = end_dt.strftime('%H:%M')
            
            return f"{start_str}–{end_str} ({timezone})"
        except Exception as e:
            current_app.logger.error(f"Error formatting meeting time: {str(e)}")
            return "Time not available"

    def get_meet_link_for_candidate(self, request_id: str, candidate_id: str, 
                                  round_type: str = 'interview_scheduled') -> Optional[Dict[str, Any]]:
        """
        Get Teams meeting link for a specific candidate and round from calendar
        
        Args:
            request_id: The request ID
            candidate_id: The candidate ID (student_id)
            round_type: The round type (interview_scheduled, interview_round_1, interview_round_2)
        
        Returns:
            Dict with meet_link, start_time, end_time, timezone, or None if not found
        """
        # Check in-memory storage first (fallback when calendar API fails)
        global _global_meeting_storage
        key = f"{request_id}|{candidate_id}|{round_type}"
        if key in _global_meeting_storage:
            current_app.logger.info(f"Found meeting info in global storage for key: {key}")
            return _global_meeting_storage[key]
        
        # Try up to 3 times with a delay to catch recently created meetings
        for attempt in range(3):
            try:
                result = self._get_meet_link_for_candidate_internal(request_id, candidate_id, round_type)
                if result:
                    return result
                
                if attempt < 2:  # Don't sleep on the last attempt
                    import time
                    time.sleep(2)  # Wait 2 seconds before retrying
                    current_app.logger.info(f"Retrying meet link search (attempt {attempt + 2}/3)")
                    
            except Exception as e:
                current_app.logger.error(f"Error in attempt {attempt + 1}: {str(e)}")
                if attempt < 2:
                    import time
                    time.sleep(2)
        
        return None

    def _get_meet_link_for_candidate_internal(self, request_id: str, candidate_id: str, 
                                            round_type: str = 'interview_scheduled') -> Optional[Dict[str, Any]]:
        """
        Internal method to get Teams meeting link for a specific candidate and round from calendar
        """
        try:
            # Check cache first
            cache_key = f"{request_id}_{candidate_id}_{round_type}"
            if cache_key in self.cache:
                cached_data, timestamp = self.cache[cache_key]
                if datetime.now().timestamp() - timestamp < self.cache_ttl:
                    return cached_data

            access_token = self._get_access_token()
            if not access_token:
                current_app.logger.error("Failed to get access token for calendar service")
                return None

            # Search for calendar events with the marker
            marker = self._generate_meeting_marker(request_id, candidate_id, round_type)
            current_app.logger.info(f"Searching for marker: {marker}")
            
            # Search in calendar events
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/calendarView'
            
            # Search for events in the next 30 days (including past events to catch recently created ones)
            start_date = (datetime.now() - timedelta(days=1)).isoformat() + 'Z'
            end_date = (datetime.now() + timedelta(days=30)).isoformat() + 'Z'
            
            # First try with the exact marker
            params = {
                'startDateTime': start_date,
                'endDateTime': end_date,
                '$filter': f"contains(subject, '{marker}')",
                '$orderby': 'start/dateTime desc',
                '$top': 10
            }
            
            current_app.logger.info(f"Trying exact marker search with filter: {params['$filter']}")
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            response = requests.get(endpoint, headers=headers, params=params)
            current_app.logger.info(f"Calendar API response status: {response.status_code}")
            
            if response.status_code == 200:
                events = response.json().get('value', [])
                current_app.logger.info(f"Found {len(events)} calendar events with exact marker")
                
                # Find the most recent valid Teams meeting
                for event in events:
                    current_app.logger.info(f"Checking event: {event.get('subject', 'No subject')}")
                    if self._is_valid_teams_meeting(event):
                        online_meeting = event.get('onlineMeeting', {})
                        meet_link = online_meeting.get('joinUrl')
                        
                        if meet_link:
                            result = {
                                'meet_link': meet_link,
                                'start_time': event.get('start', {}).get('dateTime'),
                                'end_time': event.get('end', {}).get('dateTime'),
                                'timezone': event.get('start', {}).get('timeZone', 'UTC'),
                                'subject': event.get('subject'),
                                'event_id': event.get('id')
                            }
                            
                            # Cache the result
                            cache_key = f"{request_id}_{candidate_id}_{round_type}"
                            self.cache[cache_key] = (result, datetime.now().timestamp())
                            
                            return result
            
            # If not found with exact marker, try broader search
            current_app.logger.info("No events found with exact marker, trying broader search")
            params = {
                'startDateTime': start_date,
                'endDateTime': end_date,
                '$orderby': 'start/dateTime desc',
                '$top': 20
            }
            
            response = requests.get(endpoint, headers=headers, params=params)
            current_app.logger.info(f"Broad search API response status: {response.status_code}")
            
            if response.status_code == 200:
                events = response.json().get('value', [])
                current_app.logger.info(f"Found {len(events)} calendar events in broad search")
                
                # Look for any event with the request ID or candidate ID
                for event in events:
                    subject = event.get('subject', '')
                    current_app.logger.info(f"Checking event in broad search: {subject}")
                    
                    # Check if this event contains our marker or request ID
                    if (marker in subject or 
                        f'REQ-{request_id}' in subject or 
                        f'CAND-{candidate_id}' in subject):
                        
                        current_app.logger.info(f"Found matching event: {subject}")
                        if self._is_valid_teams_meeting(event):
                            online_meeting = event.get('onlineMeeting', {})
                            meet_link = online_meeting.get('joinUrl')
                            
                            if meet_link:
                                result = {
                                    'meet_link': meet_link,
                                    'start_time': event.get('start', {}).get('dateTime'),
                                    'end_time': event.get('end', {}).get('dateTime'),
                                    'timezone': event.get('start', {}).get('timeZone', 'UTC'),
                                    'subject': event.get('subject'),
                                    'event_id': event.get('id')
                                }
                                
                                # Cache the result
                                cache_key = f"{request_id}_{candidate_id}_{round_type}"
                                self.cache[cache_key] = (result, datetime.now().timestamp())
                                
                                return result
            
            # If not found in calendar, try searching in sent emails as fallback
            current_app.logger.info("No calendar events found, trying sent emails fallback")
            return self._search_sent_emails_for_meeting(request_id, candidate_id, round_type, marker)
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            response = requests.get(endpoint, headers=headers, params=params)
            current_app.logger.info(f"Calendar API response status: {response.status_code}")
            
            if response.status_code == 200:
                events = response.json().get('value', [])
                current_app.logger.info(f"Found {len(events)} calendar events")
                
                # Find the most recent valid Teams meeting
                for event in events:
                    current_app.logger.info(f"Checking event: {event.get('subject', 'No subject')}")
                    if self._is_valid_teams_meeting(event):
                        online_meeting = event.get('onlineMeeting', {})
                        meet_link = online_meeting.get('joinUrl')
                        
                        if meet_link:
                            result = {
                                'meet_link': meet_link,
                                'start_time': event.get('start', {}).get('dateTime'),
                                'end_time': event.get('end', {}).get('dateTime'),
                                'timezone': event.get('start', {}).get('timeZone', 'UTC'),
                                'subject': event.get('subject'),
                                'event_id': event.get('id')
                            }
                            
                            # Cache the result
                            self.cache[cache_key] = (result, datetime.now().timestamp())
                            
                            return result
            
            # If not found in calendar, try searching in sent emails as fallback
            current_app.logger.info("No calendar events found, trying sent emails fallback")
            return self._search_sent_emails_for_meeting(request_id, candidate_id, round_type, marker)
            
        except Exception as e:
            current_app.logger.error(f"Error getting meet link for candidate: {str(e)}")
            return None

    def _search_sent_emails_for_meeting(self, request_id: str, candidate_id: str, 
                                      round_type: str, marker: str) -> Optional[Dict[str, Any]]:
        """Fallback: Search sent emails for meeting information"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                return None

            # Search sent emails for the marker
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/mailFolders/sentitems/messages'
            
            params = {
                '$filter': f"contains(subject, '{marker}')",
                '$orderby': 'receivedDateTime desc',
                '$top': 5
            }
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            response = requests.get(endpoint, headers=headers, params=params)
            current_app.logger.info(f"Email API response status: {response.status_code}")
            
            if response.status_code == 200:
                emails = response.json().get('value', [])
                current_app.logger.info(f"Found {len(emails)} sent emails")
                
                for email in emails:
                    current_app.logger.info(f"Checking email: {email.get('subject', 'No subject')}")
                    # Extract Teams link from email body
                    body_content = email.get('body', {}).get('content', '')
                    teams_link = self._extract_teams_link_from_content(body_content)
                    
                    if teams_link:
                        # Try to extract time from email subject or body
                        subject = email.get('subject', '')
                        start_time, end_time = self._extract_time_from_email(subject, body_content)
                        
                        result = {
                            'meet_link': teams_link,
                            'start_time': start_time,
                            'end_time': end_time,
                            'timezone': 'UTC',
                            'subject': subject,
                            'source': 'email'
                        }
                        
                        # Cache the result
                        cache_key = f"{request_id}_{candidate_id}_{round_type}"
                        self.cache[cache_key] = (result, datetime.now().timestamp())
                        
                        return result
            
            return None
            
        except Exception as e:
            current_app.logger.error(f"Error searching sent emails: {str(e)}")
            return None

    def _extract_teams_link_from_content(self, content: str) -> Optional[str]:
        """Extract Teams meeting link from email content"""
        # Teams meeting link patterns
        patterns = [
            r'https?://teams\.microsoft\.com/l/meetup-join/[^\s>"\']+',
            r'https?://teams\.microsoft\.com/dl/launcher/[^\s>"\']+',
            r'https?://teams\.live\.com/meet/[^\s>"\']+'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                return match.group(0)
        
        return None

    def _extract_time_from_email(self, subject: str, body: str) -> tuple[Optional[str], Optional[str]]:
        """Extract meeting time from email subject or body"""
        # This is a simplified implementation
        # In a real scenario, you might want to use more sophisticated date parsing
        try:
            # Look for common time patterns
            time_patterns = [
                r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)',
                r'(\d{1,2}:\d{2})',
            ]
            
            for pattern in time_patterns:
                matches = re.findall(pattern, subject + ' ' + body)
                if len(matches) >= 2:
                    # Assume first two times are start and end
                    return matches[0], matches[1]
            
            return None, None
            
        except Exception as e:
            current_app.logger.error(f"Error extracting time from email: {str(e)}")
            return None, None

    def get_meet_links_for_request(self, request_id: str, round_type: str = None) -> Dict[str, Any]:
        """
        Get meet links for all candidates in a request
        
        Args:
            request_id: The request ID
            round_type: Optional round type filter
        
        Returns:
            Dict mapping candidate_id to meet link info
        """
        try:
            # First check in-memory storage for any stored meetings
            global _global_meeting_storage
            current_app.logger.info(f"Checking global storage for request {request_id}, round_type {round_type}")
            current_app.logger.info(f"Global storage contains {len(_global_meeting_storage)} entries: {list(_global_meeting_storage.keys())}")
            
            result = {}
            for key, meeting_info in _global_meeting_storage.items():
                if key.startswith(f"{request_id}|"):
                    # Extract candidate_id and round_type from key
                    parts = key.split('|')
                    current_app.logger.info(f"Parsing key: {key}, parts: {parts}")
                    
                    if len(parts) >= 3:
                        stored_candidate_id = parts[1]  # STU004
                        stored_round_type = parts[2]    # interview_scheduled
                        
                        current_app.logger.info(f"Found key {key} with candidate {stored_candidate_id}, round_type {stored_round_type}")
                        current_app.logger.info(f"Searching for round_type: {round_type}")
                        
                        # Check if this matches our search criteria
                        if not round_type or stored_round_type == round_type:
                            result[stored_candidate_id] = meeting_info
                            current_app.logger.info(f"Found meeting in global storage for candidate {stored_candidate_id}")
                        else:
                            current_app.logger.info(f"Round type mismatch: stored={stored_round_type}, requested={round_type}")
                    else:
                        current_app.logger.info(f"Key {key} has insufficient parts: {parts}")
            
            # If we found meetings in memory, return them immediately
            if result:
                current_app.logger.info(f"Returning {len(result)} meetings from global storage")
                return result
            
            access_token = self._get_access_token()
            if not access_token:
                return {}

            # Search for all events with this request ID
            endpoint = f'https://graph.microsoft.com/v1.0/users/{self.user_email}/calendarView'
            
            start_date = (datetime.now() - timedelta(days=1)).isoformat() + 'Z'
            end_date = (datetime.now() + timedelta(days=30)).isoformat() + 'Z'
            
            # Search for events containing the request ID
            filter_query = f"contains(subject, 'REQ-{request_id}')"
            if round_type:
                filter_query += f" and contains(subject, '{round_type.upper()}')"
            
            current_app.logger.info(f"Searching for events with filter: {filter_query}")
            
            params = {
                'startDateTime': start_date,
                'endDateTime': end_date,
                '$filter': filter_query,
                '$orderby': 'start/dateTime desc'
            }
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            response = requests.get(endpoint, headers=headers, params=params)
            current_app.logger.info(f"Calendar API response status for request search: {response.status_code}")
            
            if response.status_code == 200:
                events = response.json().get('value', [])
                current_app.logger.info(f"Found {len(events)} events for request search")
                result = {}
                
                for event in events:
                    current_app.logger.info(f"Checking event in request search: {event.get('subject', 'No subject')}")
                    if self._is_valid_teams_meeting(event):
                        meeting_info = self._extract_meeting_info_from_marker(event.get('subject', ''))
                        current_app.logger.info(f"Extracted meeting info: {meeting_info}")
                        if meeting_info:
                            candidate_id = meeting_info['candidate_id']
                            result[candidate_id] = {
                                'meet_link': event.get('onlineMeeting', {}).get('joinUrl'),
                                'start_time': event.get('start', {}).get('dateTime'),
                                'end_time': event.get('end', {}).get('dateTime'),
                                'timezone': event.get('start', {}).get('timeZone', 'UTC'),
                                'subject': event.get('subject'),
                                'round_type': meeting_info['round_type']
                            }
                
                return result
            
            return {}
            
        except Exception as e:
            current_app.logger.error(f"Error getting meet links for request: {str(e)}")
            return {}

    def store_meeting_info(self, request_id: str, candidate_id: str, round_type: str, 
                          meet_link: str, start_time: str, end_time: str, subject: str):
        """Store meeting information in memory for fallback retrieval"""
        global _global_meeting_storage
        # Use a different separator to avoid issues with underscores in round_type
        key = f"{request_id}|{candidate_id}|{round_type}"
        _global_meeting_storage[key] = {
            'meet_link': meet_link,
            'start_time': start_time,
            'end_time': end_time,
            'timezone': 'UTC',
            'subject': subject,
            'source': 'memory'
        }
        current_app.logger.info(f"Stored meeting info for key: {key}")
        current_app.logger.info(f"Global storage now contains {len(_global_meeting_storage)} entries")
        current_app.logger.info(f"Global storage keys: {list(_global_meeting_storage.keys())}")
        current_app.logger.info(f"Stored data: {_global_meeting_storage[key]}")

    def clear_cache(self):
        """Clear the cache"""
        self.cache.clear()
