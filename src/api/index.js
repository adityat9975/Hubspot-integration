import axios  from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for auth tokens
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        const response = await axios.post('/auth/refresh', { refresh_token: refreshToken });
        localStorage.setItem('access_token', response.data.access_token);
        return api(originalRequest);
      } catch (err) {
        console.error('Refresh token failed', err);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login'; // Redirect to login
      }
    }
    return Promise.reject(error);
  }
);

// HubSpot OAuth endpoints
export const hubspotAPI = {
  getAuthUrl: (user_id, org_id) => api.post('/hubspot/authorize', { user_id, org_id }),
  exchangeCode: (code, state) => api.get(`/hubspot/callback?code=${code}&state=${state}`),
  getContacts: () => api.get('/hubspot/contacts'),
};

export default api;