import { createContext, useContext, useState, useEffect} from 'react';
import { hubspotAPI } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [hubspotAuth, setHubspotAuth] = useState({
    isAuthenticated: false,
    loading: false,
    error: null
  });

  // Check auth status on load
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      setCurrentUser(JSON.parse(localStorage.getItem('user')));
    }
  }, []);

  // HubSpot OAuth functions
  const initiateHubspotAuth = async (user_id, org_id) => {
    setHubspotAuth(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await hubspotAPI.getAuthUrl(user_id, org_id);
      window.location.href = response.data.authUrl;
    } catch (error) {
      setHubspotAuth(prev => ({
        ...prev,
        loading: false,
        error: error.response?.data?.message || 'Failed to initiate HubSpot auth'
      }));
    }
  };

  const handleHubspotCallback = async (code, state) => {
    try {
      const response = await hubspotAPI.exchangeCode(code, state);
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      setCurrentUser(response.data.user);
      setHubspotAuth({
        isAuthenticated: true,
        loading: false,
        error: null
      });
      
      return response.data;
    } catch (error) {
      setHubspotAuth(prev => ({
        ...prev,
        loading: false,
        error: error.response?.data?.message || 'Failed to authenticate with HubSpot'
      }));
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setCurrentUser(null);
    setHubspotAuth({
      isAuthenticated: false,
      loading: false,
      error: null
    });
  };

  const value = {
    currentUser,
    hubspotAuth,
    initiateHubspotAuth,
    handleHubspotCallback,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}