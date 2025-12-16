// Frontend API base override. This file is intentionally served from the www domain
// so we can control the backend base URL without editing every page.
// Set the production API host (include "/api" because API routes are mounted under /api on the backend)
window.API_BASE_URL = 'https://api.smartstudentact.com/api';
console.log("Using API_BASE_URL from api-config.js:", window.API_BASE_URL);
