import React, { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from './components/AuthScreen';
import { saveAuthUser } from './utils/storage';
import type { AuthUser } from './types/aura';
import './index.css';

(window as any).__AURA_MAIN_LOADED__ = true;

const LazyApp = React.lazy(() => import('./App.tsx'));

function RootWrapper() {
  const [unlocked, setUnlocked] = useState(false);

  const handleLogin = (user: AuthUser) => {
    saveAuthUser(user);
    setUnlocked(true);
  };

  if (!unlocked) {
    return <AuthScreen onAuthenticated={handleLogin} />;
  }

  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, color: '#38bdf8', background: '#07090E', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          Loading AURA Workspace...
        </div>
      }
    >
      <LazyApp />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(<RootWrapper />);

