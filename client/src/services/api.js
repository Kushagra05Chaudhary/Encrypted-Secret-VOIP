import axios from 'axios';

// Use environment variable or default to localhost
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api';

// Log API URL for debugging
console.log('[API] Base URL:', API_URL);
console.log('[API] Environment:', import.meta.env.MODE);
console.log('[API] VITE_API_URL:', import.meta.env.VITE_API_URL);

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 10000, // 10 second timeout
});

// Add token to requests if available
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
            console.error('[API] Network error - Is the server running on', API_URL.replace('/api', ''), '?');
            error.message = 'Network Error: Cannot connect to server. Please ensure the backend server is running on port 5000.';
        } else if (error.code === 'ERR_NAME_NOT_RESOLVED') {
            console.error('[API] DNS resolution error - Check API URL:', API_URL);
            error.message = 'Connection Error: Cannot resolve server address.';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (userData) => api.post('/auth/register', userData),
    login: (credentials) => api.post('/auth/login', credentials),
    getMe: () => api.get('/auth/me'),
    updatePublicKey: (publicKey) => api.put('/auth/publickey', { publicKey })
};

// Rooms API
export const friendsAPI = {
    getFriends: () => api.get('/friends'),
    sendRequest: (pmi) => api.post('/friends/request', { pmi }),
    respondToRequest: (requestId, action) => api.post('/friends/respond', { requestId, action })
};

export const roomsAPI = {
    getRooms: () => api.get('/rooms'),
    createRoom: (name, options = {}) => api.post('/rooms', { name, ...options }),
    joinRoomByCode: (joinCode) => api.post('/rooms/join', { joinCode }),
    getRoom: (id) => api.get(`/rooms/${id}`),
    deleteRoom: (id) => api.delete(`/rooms/${id}`)
};

export default api;
