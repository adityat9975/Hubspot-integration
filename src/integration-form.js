import { useState, useEffect } from 'react';
import {useAuth } from './context/AuthContext';
import {
    Box,
    Autocomplete,
    TextField,
    Button,
    CircularProgress,
    Alert
} from '@mui/material';
import { AirtableIntegration } from './integrations/airtable';
import { NotionIntegration } from './integrations/notion';
import { HubSpotIntegration } from './integrations/hubspot';
import { DataForm } from './data-form';

const integrationMapping = {
    'Notion': NotionIntegration,
    'Airtable': AirtableIntegration,
    'HubSpot': HubSpotIntegration,
};

export const IntegrationForm = () => {
    const { hubspotAuth, initiateHubspotAuth, handleHubspotCallback } = useAuth();
    const [integrationParams, setIntegrationParams] = useState({});
    const [user, setUser] = useState('TestUser');
    const [org, setOrg] = useState('TestOrg');
    const [currType, setCurrType] = useState(null);
    const CurrIntegration = currType ? integrationMapping[currType] : null;

    // Handle HubSpot callback when component mounts
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        
        if (code && state && currType === 'HubSpot') {
            handleHubspotCallback(code, state)
                .then(() => {
                    // Clean URL after successful auth
                    window.history.replaceState({}, '', window.location.pathname);
                });
        }
    }, [currType, handleHubspotCallback]);

    const handleHubSpotConnect = () => {
        initiateHubspotAuth(user, org);
    };

    return (
        <Box display='flex' justifyContent='center' alignItems='center' flexDirection='column' sx={{ width: '100%' }}>
            <Box display='flex' flexDirection='column' sx={{ width: '100%', maxWidth: 500 }}>
                <TextField
                    label="User"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    sx={{ mt: 2 }}
                />
                <TextField
                    label="Organization"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    sx={{ mt: 2 }}
                />
                <Autocomplete
                    id="integration-type"
                    options={Object.keys(integrationMapping)}
                    sx={{ width: '100%', mt: 2 }}
                    renderInput={(params) => <TextField {...params} label="Integration Type" />}
                    onChange={(e, value) => setCurrType(value)}
                    value={currType}
                />
                
                {hubspotAuth.error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {hubspotAuth.error}
                    </Alert>
                )}
            </Box>

            {currType === 'HubSpot' && !hubspotAuth.isAuthenticated && (
                <Button
                    variant="contained"
                    onClick={handleHubSpotConnect}
                    disabled={hubspotAuth.loading}
                    sx={{ mt: 2 }}
                >
                    {hubspotAuth.loading ? (
                        <CircularProgress size={24} />
                    ) : (
                        'Connect HubSpot Account'
                    )}
                </Button>
            )}

            {CurrIntegration && (
                <Box sx={{ width: '100%', mt: 2 }}>
                    <CurrIntegration 
                        user={user} 
                        org={org}
                        integrationParams={integrationParams} 
                        setIntegrationParams={setIntegrationParams} 
                        isAuthenticated={currType === 'HubSpot' ? hubspotAuth.isAuthenticated : true}
                    />
                </Box>
            )}

            {integrationParams?.credentials && (
                <Box sx={{ mt: 2, width: '100%' }}>
                    <DataForm 
                        integrationType={integrationParams?.type} 
                        credentials={integrationParams?.credentials} 
                    />
                </Box>
            )}
        </Box>
    );
};