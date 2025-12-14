// api-config.js - central API base configuration used by frontend pages
(function () {
  // In local/dev, we prefer relative `/api` so `npm run dev` or local server proxies work
  // In production, the backend is hosted at api.smartstudentact.com
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const host = isLocal ? '' : 'https://api.smartstudentact.com';
  window.API_BASE_URL = `${host}/api`;
})();
