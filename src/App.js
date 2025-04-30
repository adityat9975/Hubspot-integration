import { IntegrationForm } from './integration-form';
import { AuthProvider} from './context/AuthContext';
import React  from 'react';

function App() {
  return (
    <AuthProvider>
      <div className="app-container">
          <IntegrationForm />
      </div>
    </AuthProvider>
  );
}

export default App;