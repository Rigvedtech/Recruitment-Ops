/**
 * Client-side decryption utility for environment values
 * This file can be shared with clients to decrypt environment values
 * 
 * Usage:
 * - Command line: node client-decryption.js "encrypted_value" "encryption_key"
 * - Programmatic: const { decryptEnvironmentValue } = require('./client-decryption');
 */

const crypto = require('crypto');

/**
 * Decrypt environment values using AES-256-CBC (matches server encryption)
 * @param {string} encryptedData - Base64 encoded encrypted data in format "IV:encrypted_data"
 * @param {string} encryptionKey - The encryption key (same as ENCRYPTION_SECRET_KEY)
 * @returns {string} - Decrypted text
 */
function decryptEnvironmentValue(encryptedData, encryptionKey) {
  try {
    const algorithm = 'aes-256-cbc';
    
    // Ensure key is 32 bytes (256 bits) for AES-256
    const key = encryptionKey.length >= 32 
      ? encryptionKey.substring(0, 32)
      : encryptionKey.padEnd(32, '0');
    
    const keyBuffer = Buffer.from(key, 'utf8');
    
    // Split IV and encrypted data (format: "IV:encrypted_data")
    const [ivBase64, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivBase64, 'base64');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt value. Please check your encryption key.');
  }
}

/**
 * Decrypt all environment variables in an API response
 * @param {Object} apiResponse - The API response object
 * @param {string} encryptionKey - The encryption key
 * @returns {Object} - Response with decrypted environment values
 */
function decryptApiResponse(apiResponse, encryptionKey) {
  if (!apiResponse.success || !apiResponse.data.environment_variables) {
    return apiResponse;
  }
  
  const decryptedResponse = {
    ...apiResponse,
    data: {
      ...apiResponse.data,
      environment_variables: apiResponse.data.environment_variables.map(envVar => ({
        ...envVar,
        env_value: decryptEnvironmentValue(envVar.env_value, encryptionKey),
        encrypted: false // Mark as decrypted
      }))
    }
  };
  
  return decryptedResponse;
}

/**
 * Decrypt a single environment variable
 * @param {string} envValue - Encrypted environment value
 * @param {string} encryptionKey - The encryption key
 * @returns {string} - Decrypted value
 */
function decryptSingleValue(envValue, encryptionKey) {
  return decryptEnvironmentValue(envValue, encryptionKey);
}

// Example usage
if (require.main === module) {
  // Command line usage
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node client-decryption.js <encrypted_value> <encryption_key>');
    console.log('Example: node client-decryption.js "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." "your-encryption-key"');
    process.exit(1);
  }
  
  const [encryptedValue, encryptionKey] = args;
  
  try {
    const decryptedValue = decryptEnvironmentValue(encryptedValue, encryptionKey);
    console.log('Decrypted value:', decryptedValue);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  decryptEnvironmentValue,
  decryptApiResponse,
  decryptSingleValue
};
