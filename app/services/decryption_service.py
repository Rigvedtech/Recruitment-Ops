"""
Decryption service for handling encrypted environment variables from external API
This implements the same AES-256-CBC decryption as client-decryption.js
"""

import base64
import logging
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class DecryptionService:
    """Service for decrypting environment variables using AES-256-CBC"""
    
    def __init__(self, encryption_key: str):
        """
        Initialize decryption service with encryption key
        
        Args:
            encryption_key: The encryption key (same as ENCRYPTION_SECRET_KEY)
        """
        self.encryption_key = encryption_key
    
    def _prepare_key(self, key: str) -> bytes:
        """
        Prepare encryption key - ensure it's 32 bytes (256 bits) for AES-256
        
        Args:
            key: The encryption key string
            
        Returns:
            32-byte key buffer
        """
        if len(key) >= 32:
            prepared_key = key[:32]
        else:
            prepared_key = key.ljust(32, '0')
        
        return prepared_key.encode('utf-8')
    
    def decrypt_value(self, encrypted_data: str) -> str:
        """
        Decrypt environment value using AES-256-CBC
        
        Args:
            encrypted_data: Base64 encoded encrypted data in format "IV:encrypted_data"
            
        Returns:
            Decrypted text
            
        Raises:
            ValueError: If decryption fails
        """
        try:
            # Prepare the key
            key = self._prepare_key(self.encryption_key)
            
            # Split IV and encrypted data (format: "IV:encrypted_data")
            parts = encrypted_data.split(':')
            if len(parts) < 2:
                raise ValueError("Invalid encrypted data format. Expected 'IV:encrypted_data'")
            
            iv_base64 = parts[0]
            encrypted_base64 = parts[1]
            
            # Decode base64 components
            iv = base64.b64decode(iv_base64)
            encrypted = base64.b64decode(encrypted_base64)
            
            # Create cipher
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
            decryptor = cipher.decryptor()
            
            # Decrypt the data
            decrypted_padded = decryptor.update(encrypted) + decryptor.finalize()
            
            # Remove PKCS7 padding
            padding_length = decrypted_padded[-1]
            decrypted = decrypted_padded[:-padding_length]
            
            return decrypted.decode('utf-8')
            
        except Exception as e:
            logger.error(f"Decryption error: {str(e)}")
            raise ValueError(f"Failed to decrypt value: {str(e)}")
    
    def decrypt_api_response(self, api_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Decrypt all environment variables in an API response
        
        Args:
            api_response: The API response object
            
        Returns:
            Response with decrypted environment values
        """
        if not api_response.get('success', False):
            return api_response
        
        data = api_response.get('data', {})
        env_vars = data.get('environment_variables', [])
        
        if not env_vars:
            return api_response
        
        # Decrypt each environment variable
        decrypted_env_vars = []
        for env_var in env_vars:
            try:
                decrypted_var = env_var.copy()
                env_value = env_var.get('env_value', '')
                
                # Check if the value appears to be encrypted (contains base64-like data with colons)
                if ':' in env_value and self._looks_like_encrypted_data(env_value):
                    decrypted_var['env_value'] = self.decrypt_value(env_value)
                    decrypted_var['encrypted'] = False  # Mark as decrypted
                    logger.debug(f"Decrypted environment variable: {env_var.get('env_name')}")
                else:
                    # Value is not encrypted, keep as-is
                    logger.debug(f"Environment variable not encrypted: {env_var.get('env_name')}")
                
                decrypted_env_vars.append(decrypted_var)
                
            except Exception as e:
                logger.error(f"Failed to decrypt environment variable {env_var.get('env_name')}: {str(e)}")
                # Keep original value if decryption fails
                decrypted_env_vars.append(env_var)
        
        # Return response with decrypted values
        decrypted_response = api_response.copy()
        decrypted_response['data'] = data.copy()
        decrypted_response['data']['environment_variables'] = decrypted_env_vars
        
        return decrypted_response
    
    def _looks_like_encrypted_data(self, value: str) -> bool:
        """
        Check if a value looks like encrypted data (base64 with colons)
        
        Args:
            value: The value to check
            
        Returns:
            True if it looks like encrypted data
        """
        try:
            parts = value.split(':')
            if len(parts) < 2:
                return False
            
            # Try to decode the first two parts as base64
            base64.b64decode(parts[0])
            base64.b64decode(parts[1])
            return True
            
        except Exception:
            return False
