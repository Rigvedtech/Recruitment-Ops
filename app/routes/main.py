from flask import Blueprint, redirect, send_from_directory, current_app
import os

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    """Redirect to Next.js development server"""
    return redirect('http://localhost:3000')

@main_bp.route('/<path:path>')
def serve_static(path):
    """Serve static files from the frontend build"""
    return send_from_directory(
        os.path.join(current_app.root_path, '..', 'frontend', 'dist'),
        path
    ) 