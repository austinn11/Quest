import type { AuthCtx } from 'spacetimedb/server';

// The host verifies JWT signatures. This policy restricts valid tokens to Quest's client.
export function authenticationError(auth: AuthCtx, clientId: string): string | null {
  if (!clientId.trim()) return 'SpacetimeAuth is not configured on the server.';
  const jwt = auth.jwt;
  if (
    auth.isInternal || !auth.hasJWT || !jwt ||
    jwt.issuer !== 'https://auth.spacetimedb.com/oidc' ||
    !jwt.subject || !jwt.audience.includes(clientId)
  ) {
    return 'Sign in to Quest with SpacetimeAuth to continue.';
  }
  return null;
}
