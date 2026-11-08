import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'spacetimedb';
import { cooldownRemainingMs, formatCooldown, nextRefreshDelay, REFRESH_RETRY_DELAY_MS } from '../src/questboard/cooldown.ts';

const slot = (milliseconds, status = 'Cooldown') => ({ status: { tag: status }, refreshAt: new Timestamp(BigInt(milliseconds) * 1000n) });

test('countdowns derive from persisted refresh timestamps and clamp elapsed cooldowns to zero', () => {
  const persisted = slot(7_200_000);
  assert.equal(cooldownRemainingMs(persisted, 0), 7_200_000);
  assert.equal(cooldownRemainingMs(persisted, 1000), 7_199_000);
  assert.equal(cooldownRemainingMs(persisted, 7_200_000), 0);
  assert.equal(cooldownRemainingMs(persisted, 8_000_000), 0);
  assert.equal(cooldownRemainingMs(slot(1000, 'Available'), 0), null);
  assert.equal(cooldownRemainingMs({ status: { tag: 'Cooldown' } }, 0), null);
  assert.equal(persisted.refreshAt.microsSinceUnixEpoch, 7_200_000_000n);
});

test('countdown formatting rounds partial seconds up without showing negative time', () => {
  assert.equal(formatCooldown(7_200_000), '2h 0m 0s');
  assert.equal(formatCooldown(61_001), '1m 2s');
  assert.equal(formatCooldown(1), '1s');
  assert.equal(formatCooldown(0), '0s');
  assert.equal(formatCooldown(-1000), '0s');
});

test('refresh checks target the earliest cooldown while available slots do not schedule requests', () => {
  assert.equal(nextRefreshDelay([], 1000, -Infinity), null);
  assert.equal(nextRefreshDelay([slot(2000, 'Available')], 1000, -Infinity), null);
  assert.equal(nextRefreshDelay([slot(5000), slot(3000)], 1000, -Infinity), 2000);
  assert.equal(nextRefreshDelay([slot(3000)], 2000, 2000), 1000); // A pre-expiry focus check must not delay expiry.
  assert.equal(nextRefreshDelay([slot(1000), slot(5000)], 2000, 2000), 3000); // An exhausted slot must not delay another slot's expiry.
});

test('expired no-op checks are throttled rather than retried in a zero-delay loop', () => {
  assert.equal(nextRefreshDelay([slot(1000)], 1000, -Infinity), 1);
  assert.equal(nextRefreshDelay([slot(1000)], 1000, 1000), REFRESH_RETRY_DELAY_MS);
  assert.equal(nextRefreshDelay([slot(1000)], 2000, 1000), REFRESH_RETRY_DELAY_MS - 1000);
  assert.equal(nextRefreshDelay([slot(1000)], 31_000, 1000), 1);
});

test('clock skew and long timers cannot force availability or overflow browser timeout limits', () => {
  const persisted = slot(1000);
  assert.equal(cooldownRemainingMs(persisted, 50_000), 0);
  assert.equal(persisted.status.tag, 'Cooldown');
  assert.equal(nextRefreshDelay([persisted], 50_000, 50_000), 30_000);
  assert.equal(nextRefreshDelay([slot(3_000_000_000)], 0, -Infinity), 2_147_483_647);
});
