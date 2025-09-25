import requests
import logging
from urllib.parse import quote
from typing import Dict, Optional, Any
from flask import current_app
from app.services.decryption_service import DecryptionService

logger = logging.getLogger(__name__)

class ExternalEnvironmentAPIClient:
    """Client for communicating with the external environment API"""
    
    def __init__(self, base_url: str, timeout: int = 30):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        
    def get_environment_variables(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Get environment variables for a given URL from external API
        
        Args:
            url: Complete URL like 'http://rgvdit-rops.rigvedtech.com:3000/'
            
        Returns:
            Dictionary containing the API response or None if failed
        """
        try:
            # URL encode the parameter
            encoded_url = quote(url, safe='')
            
            # Construct the API endpoint
            api_endpoint = f"{self.base_url}/api/external/environment/{encoded_url}"
            
            logger.info(f"Calling external API: {api_endpoint}")
            print(f"DEBUG: Calling external API: {api_endpoint}")  # Debug print
            
            # Make the API call
            response = requests.get(api_endpoint, timeout=self.timeout)
            
            # Check if request was successful
            if response.status_code == 200:
                data = response.json()
                if data.get('success', False):
                    logger.info(f"Successfully retrieved environment variables for URL: {url}")
                    
                    # Decrypt the response using hardcoded encryption key
                    encryption_key = "4f9d6e5a3c2b7f18d92c47a1e8b5f64c7d4e2f918f3a1c6b0d7e5f9a3c1b8e6d"
                    if encryption_key:
                        try:
                            decryption_service = DecryptionService(encryption_key)
                            decrypted_data = decryption_service.decrypt_api_response(data)
                            logger.info("Successfully decrypted API response")
                            return decrypted_data
                        except Exception as e:
                            logger.error(f"Failed to decrypt API response: {str(e)}")
                            logger.warning("Proceeding with encrypted data - this may cause connection issues")
                            return data
                    else:
                        logger.warning("No encryption key configured - proceeding with raw API response")
                        return data
                else:
                    logger.error(f"API returned success=false for URL {url}: {data.get('message', 'Unknown error')}")
                    return None
            else:
                logger.error(f"API request failed with status {response.status_code} for URL {url}")
                try:
                    error_data = response.json()
                    logger.error(f"Error response: {error_data}")
                except:
                    logger.error(f"Error response (raw): {response.text}")
                return None
                
        except requests.exceptions.Timeout:
            logger.error(f"API request timeout for URL: {url}")
            return None
        except requests.exceptions.ConnectionError:
            logger.error(f"API connection error for URL: {url}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"API request exception for URL {url}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error calling API for URL {url}: {str(e)}")
            return None
    
    def extract_postgres_credentials(self, api_response: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """
        Extract PostgreSQL credentials from API response
        
        Args:
            api_response: The full API response dictionary
            
        Returns:
            Dictionary with PostgreSQL connection parameters or None if extraction failed
        """
        try:
            if not api_response.get('success', False):
                return None
                
            data = api_response.get('data', {})
            env_vars = data.get('environment_variables', [])
            
            # Extract PostgreSQL credentials
            postgres_creds = {}
            for env_var in env_vars:
                env_name = env_var.get('env_name')
                env_value = env_var.get('env_value')
                
                if env_name in ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']:
                    postgres_creds[env_name] = env_value
                    # Log full decrypted values for debugging
                    logger.info(f"Decrypted {env_name}: {env_value}")
                    print(f"DEBUG: Decrypted {env_name}: {env_value}")
            
            # Validate that we have all required credentials
            required_creds = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']
            missing_creds = [cred for cred in required_creds if cred not in postgres_creds]
            
            if missing_creds:
                logger.error(f"Missing required PostgreSQL credentials: {missing_creds}")
                return None
            
            logger.info("Successfully extracted PostgreSQL credentials from API response")
            return postgres_creds
            
        except Exception as e:
            logger.error(f"Error extracting PostgreSQL credentials: {str(e)}")
            return None
