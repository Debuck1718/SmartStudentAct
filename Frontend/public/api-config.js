// Frontend API base override. This file is intentionally served from the www domain
// so we can control the backend base URL without editing every page.
// Set the production API host (no trailing "/api" suffix because public routes are mounted at root)
window.API_BASE_URL = 'https://api.smartstudentact.com';
