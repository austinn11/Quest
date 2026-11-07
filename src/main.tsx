import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Authentication, AuthScreen } from './auth/Authentication';
import { createUserManager } from './auth/settings';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

try {
  const manager = createUserManager();
  root.render(<StrictMode><Authentication manager={manager} /></StrictMode>);
} catch (error) {
  root.render(
    <AuthScreen>
      <h2 id="auth-title">Authentication setup required</h2>
      <p className="error" role="alert">{error instanceof Error ? error.message : 'Unable to initialize authentication.'}</p>
      <p>Ask the project administrator to finish SpacetimeAuth setup. If browser storage is blocked, allow site storage and reload.</p>
      <button type="button" onClick={() => window.location.reload()}>Retry</button>
    </AuthScreen>
  );
}
