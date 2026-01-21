// Configuration for Socket.io server URL
// Set VERCEL_URL or SOCKET_SERVER_URL environment variable in Vercel dashboard
// For local dev, defaults to current origin
window.SOCKET_SERVER_URL = 
  window.SOCKET_SERVER_URL || 
  (window.location.hostname === 'localhost' 
    ? window.location.origin 
    : `https://${window.location.hostname}`);

