import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WebAuthProvider } from '@/auth/WebAuthContext';
import { Toaster } from 'react-hot-toast';
import './index.css';

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <WebAuthProvider>
      <Toaster position="top-right" />
      <App />
    </WebAuthProvider>
  </React.StrictMode>
);
