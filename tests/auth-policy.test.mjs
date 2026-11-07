import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticationError } from '../spacetimedb/src/auth-policy.ts';

const clientId = 'quest-test-client';
const signedIn = {
  isInternal: false,
  hasJWT: true,
  jwt: { issuer: 'https://auth.spacetimedb.com/oidc', subject: 'player-one', audience: [clientId] },
};

test('accepts the configured SpacetimeAuth client and subject', () => {
  assert.equal(authenticationError(signedIn, clientId), null);
});

test('rejects anonymous callers and internal calls without a player session', () => {
  assert.ok(authenticationError({ isInternal: false, hasJWT: false, jwt: null }, clientId));
  assert.ok(authenticationError({ ...signedIn, isInternal: true }, clientId));
});

test('rejects a different issuer, including a lookalike issuer', () => {
  for (const issuer of ['https://accounts.google.com', 'https://auth.spacetimedb.com/oidc/attacker']) {
    assert.ok(authenticationError({ ...signedIn, jwt: { ...signedIn.jwt, issuer } }, clientId));
  }
});

test('rejects valid tokens intended for another application', () => {
  assert.ok(authenticationError({ ...signedIn, jwt: { ...signedIn.jwt, audience: ['another-client'] } }, clientId));
  assert.ok(authenticationError({ ...signedIn, jwt: { ...signedIn.jwt, audience: [] } }, clientId));
});

test('requires a subject and fails closed when server configuration is missing', () => {
  assert.ok(authenticationError({ ...signedIn, jwt: { ...signedIn.jwt, subject: '' } }, clientId));
  assert.ok(authenticationError(signedIn, ''));
  assert.ok(authenticationError(signedIn, '   '));
});

test('accepts a token listing the intended client among multiple audiences', () => {
  assert.equal(authenticationError({ ...signedIn, jwt: { ...signedIn.jwt, audience: ['other', clientId] } }, clientId), null);
});
