import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from './components/AuthScreen';
import './index.css';

(window as any).__AURA_MAIN_LOADED__ = true;

createRoot(document.getElementById('root')!).render(
  <AuthScreen onAuthenticated={() => alert('APK Login Working!')} />
);

