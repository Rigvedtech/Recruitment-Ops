# PowerShell deployment script for Frontend and Backend

param(
    [string]$ProjectPath = "C:\Rigvedtech\Email-Tracker"
)

Set-StrictMode -Version Latest

# Define NSSM service names
$Recops_frontend = "Recops-frontend"
$Recops_Backend = "Recops-Backend"

# Define paths
$projectPath = $ProjectPath
$FRONTEND_PATH = Join-Path $projectPath "frontend"
$BACKEND_PATH = $projectPath

# Check if the directory exists before trying to navigate
if (-not (Test-Path $projectPath)) {
    if ($env:GITHUB_WORKSPACE) {
        $projectPath = $PWD
        $FRONTEND_PATH = Join-Path $projectPath "frontend"
        $BACKEND_PATH = $projectPath
    } else {
        exit 1
    }
}

Set-Location $projectPath

# Check if we're in a git repository
if (Test-Path ".git") {
    git fetch origin
    git checkout main
    git pull origin main
}

# If we're in GitHub Actions, copy the updated code to the actual project folder
if ($env:GITHUB_WORKSPACE) {
    $actualProjectPath = "C:\Rigvedtech\Email-Tracker"
    Write-Host "Copying updated code from runner workspace to actual project folder..."
    
    # Stop services first
    nssm stop $Recops_frontend
    nssm stop $Recops_Backend
    
    # Copy all files except certain directories
    $excludeDirs = @("node_modules", "venv", ".git", "instance")
    
    # Get all items in current directory
    Get-ChildItem -Path $PWD -Exclude $excludeDirs | ForEach-Object {
        if ($_.PSIsContainer) {
            # Copy directories
            Copy-Item -Path $_.FullName -Destination $actualProjectPath -Recurse -Force
        } else {
            # Copy files
            Copy-Item -Path $_.FullName -Destination $actualProjectPath -Force
        }
    }
    
    # Update the project path to the actual location
    $projectPath = $actualProjectPath
    $FRONTEND_PATH = Join-Path $projectPath "frontend"
    $BACKEND_PATH = $projectPath
    
    # Navigate to the actual project folder
    Set-Location $projectPath
}

# Step 1: Activate Virtual Environment and Install Python Requirements
Set-Location $BACKEND_PATH

# Check if virtual environment exists
$venvPath = Join-Path $BACKEND_PATH "venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvPath)) {
    python -m venv venv
}

# Activate virtual environment
& $venvPath

# Install requirements in virtual environment
pip install -r requirements.txt

# Step 2: Build Frontend
Set-Location $FRONTEND_PATH
npm install
npm run build

# Step 3: Build Backend and Run Database Migrations
Set-Location $BACKEND_PATH

# Run database migrations (if needed)
try {
    python database.py
} catch {
    # Continue if migration fails
}

# Step 4: Start Services (if not already started during copy)
if (-not $env:GITHUB_WORKSPACE) {
    # Stop services first
    nssm stop $Recops_frontend
    nssm stop $Recops_Backend
    
    # Wait a moment for services to stop
    Start-Sleep -Seconds 3
}

# Step 5: Start Services
nssm start $Recops_frontend
nssm start $Recops_Backend

# Wait a moment for services to start
Start-Sleep -Seconds 5

exit 0
