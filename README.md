# Email Tracker Application

A comprehensive email tracking and management system for processing hiring-related emails and candidate information.

## Features

- **Email Processing**: Automatically fetches and processes emails from Microsoft Graph API
- **Candidate Tracking**: Extracts candidate profiles from email content
- **RFH (Request for Hiring) Management**: Tracks hiring requests with unique IDs
- **Dashboard**: Web-based interface for viewing and managing emails
- **Export Functionality**: Export data to various formats

## Setup Instructions

### Prerequisites

- Python 3.8+
- PostgreSQL database
- Microsoft 365 account with appropriate permissions
- Node.js and npm (for frontend)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd email-tracker
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Configure environment variables**
   
   **IMPORTANT**: Never commit sensitive information to Git!
   
   a. Copy the environment template:
   ```bash
   cp env.example .env
   ```
   
   b. Edit `.env` with your actual values:
   ```
   SECRET_KEY=your-actual-secret-key
   DB_USER=postgres
   DB_PASS=your-actual-database-password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=email_filter
   MS_CLIENT_ID=your-actual-azure-client-id
   MS_CLIENT_SECRET=your-actual-azure-client-secret
   MS_TENANT_ID=your-actual-azure-tenant-id
   MS_USER_EMAIL=your-actual-email@domain.com
   ```
   
   c. Create your local config.py:
   ```bash
   cp config_template.py config.py
   ```

5. **Set up database**
   ```bash
   python reset_db.py
   ```

6. **Run the application**
   ```bash
   python run.py
   ```

7. **Start the frontend**
   ```bash
   cd frontend
   npm run dev
   ```

## Security Configuration

### Important Security Notes

⚠️ **CRITICAL**: Before pushing to GitHub, ensure you have:

1. **Created a `.env` file** with your actual credentials (this file is already in `.gitignore`)
2. **Never commit `config.py`** - it contains sensitive information and is now in `.gitignore`
3. **Use `config_template.py`** as a reference for the configuration structure
4. **Set up environment variables** using the `env_example.txt` as a template

### Environment Setup

1. **Copy the template**:
   ```bash
   cp env_example.txt .env
   ```

2. **Edit `.env`** with your actual values:
   ```
   SECRET_KEY=your-actual-secret-key
   DB_PASS=your-actual-database-password
   MS_CLIENT_ID=your-actual-client-id
   MS_CLIENT_SECRET=your-actual-client-secret
   MS_TENANT_ID=your-actual-tenant-id
   MS_USER_EMAIL=your-actual-email@domain.com
   ```

3. **Update `config.py`** to use environment variables (see `config_template.py` for reference)

### Security Checklist Before Pushing to GitHub

✅ **Essential Steps**:
- [ ] `config.py` is in `.gitignore` (contains hardcoded secrets)
- [ ] `.env` file is created with actual credentials
- [ ] All environment variables are properly set
- [ ] No hardcoded passwords or API keys in any files
- [ ] Database credentials are moved to environment variables
- [ ] Microsoft Graph API secrets are moved to environment variables

⚠️ **Files to Check**:
- `config.py` - Contains hardcoded secrets (now ignored)
- `create_admin_user.py` - Contains default admin password
- `migrate_users_table.py` - Contains default admin credentials
- Any test files with hardcoded credentials

🔒 **Recommended Actions**:
1. Update `config.py` to use environment variables
2. Change default admin password in setup scripts
3. Review all test files for hardcoded credentials
4. Ensure `.env` file is never committed

## Microsoft Graph API Configuration

### App Registration Requirements

1. **Register your application** in Azure Active Directory
2. **Configure API permissions**:
   - `Mail.Read` (Application permission)
   - `Mail.ReadWrite` (Application permission)
   - `User.Read.All` (Application permission)

3. **Grant admin consent** for the permissions

### Common Issues and Solutions

#### 403 Error: "Access to OData is disabled"

**Error Message**: 
```
"ErrorAccessDenied": "Access to OData is disabled: [RAOP] : Blocked by tenant configured AppOnly AccessPolicy settings."
```

**Cause**: Your Microsoft 365 tenant has Application-Only Access Policy (AppOnly AccessPolicy) configured to restrict application access to mailboxes.

**Solutions**:

1. **Option 1: Configure Application Access Policy (Recommended)**
   
   Ask your Microsoft 365 administrator to run these PowerShell commands:
   
   ```powershell
   # Connect to Exchange Online
   Connect-ExchangeOnline
   
   # Create an application access policy for your app
   New-ApplicationAccessPolicy -AppId "YOUR_CLIENT_ID" -PolicyScopeId "recops@rigvedtech.com" -AccessRight RestrictAccess -Description "Allow email tracker app to access recops mailbox"
   
   # Verify the policy was created
   Get-ApplicationAccessPolicy
   ```
   
   Replace `YOUR_CLIENT_ID` with your actual Microsoft App Client ID and `recops@rigvedtech.com` with the target email address.

2. **Option 2: Use Delegated Permissions (Alternative)**
   
   If Application Access Policy cannot be configured, switch to delegated permissions:
   
   - Change API permissions to delegated instead of application permissions
   - Implement user authentication flow (OAuth2 with user consent)
   - This requires user interaction for initial authentication

3. **Option 3: Disable Application Access Policy (Not Recommended)**
   
   Administrator can disable the policy entirely (affects security):
   
   ```powershell
   # Connect to Exchange Online
   Connect-ExchangeOnline
   
   # Disable application access policy
   Set-OrganizationConfig -DefaultPublicFolderProhibitPostQuota Unlimited
   ```

#### Testing the Configuration

After configuration, test the connection:

```bash
python test_email_fetch.py
```

Expected output:
```
Token test result: {'status': 'success', 'message': 'Token acquisition successful'}
Fetched X emails
```

### Debugging Steps

1. **Verify App Registration**:
   - Check client ID, secret, and tenant ID are correct
   - Ensure admin consent is granted for all permissions

2. **Test Token Acquisition**:
   ```bash
   python test_token.py
   ```

3. **Check Application Access Policy**:
   ```powershell
   Get-ApplicationAccessPolicy | Format-Table
   ```

4. **Verify User Permissions**:
   - Ensure the target user (`recops@rigvedtech.com`) has appropriate mailbox permissions
   - Check if the user account is active and accessible

## Usage

1. **Access the dashboard** at `http://localhost:3000`
2. **Click "Process Mail"** to fetch and process emails
3. **View processed emails** in the dashboard
4. **Check the Tracker tab** for RFH emails with assigned request IDs
5. **Export data** using the export functionality

## API Endpoints

- `GET /api/emails/all` - Get all processed emails
- `GET /api/emails/recruiter` - Get recruiter emails only
- `GET /api/tracker` - Get RFH emails with request IDs
- `GET /api/tracker/stats` - Get tracker statistics
- `POST /api/emails/export` - Export email data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License. 