import { useState } from 'react';
import { useAuth } from 'react-oidc-context';

export function SignOutButton() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setSigningOut(true);
    setError(null);
    const idToken = auth.user?.id_token;
    try {
      auth.stopSilentRenew();
      await auth.removeUser();
      await auth.signoutRedirect({ id_token_hint: idToken });
    } catch {
      setError('Sign-out could not be completed. Please try again.');
      setSigningOut(false);
    }
  };

  return (
    <div>
      <button className="secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>
        {signingOut ? 'Signing out...' : 'Sign out'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
