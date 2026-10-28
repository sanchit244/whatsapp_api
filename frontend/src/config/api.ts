export const API_URL = (process.env.REACT_APP_API_URL || 'https://whatsapp-api-backend-ie65.onrender.com').replace(/\/$/, '');
export const SOCKET_URL = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || 'https://whatsapp-api-backend-ie65.onrender.com').replace(/\/$/, '');
