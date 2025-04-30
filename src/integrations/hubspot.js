import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, List, ListItem, ListItemText, Typography, Alert,Divider } from '@mui/material';
import axios from 'axios' ;

const API_BASE = 'http://localhost:8000';
const ENDPOINTS = {
  authorize: `${API_BASE}/integrations/hubspot/authorize`,
  credentials: `${API_BASE}/integrations/hubspot/credentials`,
  items: `${API_BASE}/integrations/hubspot/load`, // Corrected endpoint
};

export const HubSpotIntegration = ({ user, org, integrationParams, setIntegrationParams }) => {
  const [state, setState] = useState({
    isConnected: !!integrationParams?.credentials,
    isLoading: false,
    items: [],
    error: null
  });

  const navigate = useNavigate();

  const checkConnection = useCallback(async () => {
    if (!integrationParams?.credentials) return;
    try {
      const { data } = await axios.get(ENDPOINTS.credentials, { 
        params: { 
          user_id: user.id, 
          org_id: org.id 
        } 
      });
      setState(prev => ({ ...prev, isConnected: !!data }));
    } catch (error) {
      console.error('Connection check failed:', error);
      setState(prev => ({ ...prev, isConnected: false }));
    }
  }, [user, org, integrationParams?.credentials]);

  const handleAuth = useCallback(async (action) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      if (action === 'connect') {
        const formData = new URLSearchParams();
        formData.append('user_id', user.id);
        formData.append('org_id', org.id);
  
        const { data } = await axios.post(ENDPOINTS.authorize, formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
  
        if (!data?.url) throw new Error('Authorization URL missing');
        localStorage.setItem('hubspot_connection', JSON.stringify({ user, org }));
        window.location.href = data.url;
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Operation failed';
      setState(prev => ({ ...prev, error: errorMsg }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user, org]);

  const fetchItems = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const { data } = await axios.get(ENDPOINTS.items, { 
        params: { 
          user_id: user.id, 
          org_id: org.id 
        } 
      });
      setState(prev => ({ ...prev, items: data || [] }));
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Fetch failed';
      setState(prev => ({ ...prev, error: errorMsg }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user, org, setIntegrationParams]);

  useEffect(() => { 
    checkConnection(); 
  }, [checkConnection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      setState(prev => ({ ...prev, error: `Authorization failed: ${error}` }));
      return;
    }

    if (code) {
      const completeConnection = async () => {
        try {
          const connection = JSON.parse(localStorage.getItem('hubspot_connection') || '{}');
          if (connection.user?.id !== user.id || connection.org?.id !== org.id) {
            throw new Error('User mismatch');
          }
          
          const { data } = await axios.post(ENDPOINTS.credentials, { 
            user_id: user.id, 
            org_id: org.id, 
            code 
          });
          
          if (!data?.access_token) throw new Error('Invalid credentials');
          
          setState(prev => ({ ...prev, isConnected: true }));
          setIntegrationParams(prev => ({ 
            ...prev, 
            credentials: data, 
            type: 'HubSpot' 
          }));
          localStorage.removeItem('hubspot_connection');
          navigate('/integrations', { replace: true });
        } catch (error) {
          const errorMsg = error.response?.data?.detail || error.message || 'Connection failed';
          setState(prev => ({ ...prev, error: errorMsg }));
        }
      };
      completeConnection();
    }
  }, [navigate, user, org, setIntegrationParams]);

  return (
    <Box sx={{ mt: 2, p: 2, border: '1px solid #ddd', borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom>HubSpot Integration</Typography>
      
      {state.error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setState(prev => ({ ...prev, error: null }))}>
          {state.error.includes('404') ? 'Endpoint not found' : state.error}
        </Alert>
      )}

      <Box display="flex" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color={state.isConnected ? 'success' : 'primary'}
          onClick={() => handleAuth(state.isConnected ? 'disconnect' : 'connect')}
          disabled={state.isLoading}
          startIcon={state.isLoading && <CircularProgress size={20} color="inherit" />}
        >
          {state.isConnected ? 'Disconnect' : state.isLoading ? 'Processing...' : 'Connect'}
        </Button>
        
        {state.isConnected && (
          <Button
            variant="outlined"
            onClick={fetchItems}
            disabled={state.isLoading}
            startIcon={state.isLoading && <CircularProgress size={20} />}
          >
            {state.isLoading ? 'Fetching...' : 'Fetch Companies'}
          </Button>
        )}
      </Box>

      {state.isConnected && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom>HubSpot Companies</Typography>
          
          {state.items.length > 0 ? (
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {state.items.map((item, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={item.name || 'Unnamed Company'}
                    secondary={
                      <>
                        {item.domain && `Domain: ${item.domain}`}
                        {item.id && ` • ID: ${item.id}`}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {state.isLoading ? 'Loading...' : 'No companies found'}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
};

export default HubSpotIntegration;