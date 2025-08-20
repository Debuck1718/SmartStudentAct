// auth.js
const API_BASE_URL = "https://smartstudentact.onrender.com/api";

/**
 * Fetches data from a protected API endpoint.
 *
 * @param {string} path - The API endpoint path (e.g., 'users/profile').
 * @param {object} options - Optional fetch request options.
 * @returns {Promise<object|null>} A promise that resolves with the JSON data, or null on failure.
 */
export async function fetchProtectedData(path, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('Authentication token missing. Redirecting to login.');
        window.location.href = "/login.html";
        return null;
    }

    const requestOptions = {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}/${path}`, requestOptions);

        if (response.status === 401) {
            console.error('Token expired or invalid. Redirecting to login.');
            localStorage.removeItem('token');
            window.location.href = "/login.html";
            return null;
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to fetch data');
        }

        return await response.json();
    } catch (error) {
        console.error('Error in fetchProtectedData:', error);
        return null;
    }
}