
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './contexts/AuthContext';

// Use environment variable for Client ID
// Fallback to a dummy string if missing to prevent provider crash, 
// but LoginModal handles the UI hiding logic.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "dummy-client-id-for-fallback";

const rootElement = (window as any).document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn("GOOGLE_CLIENT_ID is missing. Google Login will be disabled.");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
            <App />
        </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
