import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import type { PlayerQuestSlots } from '../module_bindings/types';
import { nextRefreshDelay } from './cooldown';

export function useQuestRefresh({ slots, enabled, connectionId }: {
  slots: readonly PlayerQuestSlots[];
  enabled: boolean;
  connectionId: string;
}) {
  const invokeRefresh = useReducer(reducers.refreshQuestSlots);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastAttemptAt = useRef(Number.NEGATIVE_INFINITY);
  const canRefresh = useRef(enabled);
  canRefresh.current = enabled;

  const refreshSlots = useCallback((): Promise<void> => {
    if (!canRefresh.current || !mounted.current) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const requestGeneration = generation.current;
    lastAttemptAt.current = Date.now();
    setNow(lastAttemptAt.current);
    setRefreshing(true);
    setRefreshError(null);
    const request = invokeRefresh().catch(error => {
      if (mounted.current && requestGeneration === generation.current) {
        setRefreshError(error instanceof Error ? error.message : 'Unable to check quest replacements.');
      }
    }).finally(() => {
      if (inFlight.current === request) inFlight.current = null;
      if (mounted.current && requestGeneration === generation.current) setRefreshing(false);
    });
    inFlight.current = request;
    return request;
  }, [invokeRefresh]);

  useEffect(() => {
    mounted.current = true;
    generation.current++;
    inFlight.current = null;
    lastAttemptAt.current = Number.NEGATIVE_INFINITY;
    setRefreshing(false);
    setRefreshError(null);
    const check = () => {
      setNow(Date.now());
      void refreshSlots();
    };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    if (enabled) {
      check();
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', visible);
    }
    return () => {
      mounted.current = false;
      generation.current++;
      inFlight.current = null;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, connectionId, refreshSlots]);

  const hasCooldown = slots.some(slot => slot.status.tag === 'Cooldown');
  useEffect(() => {
    if (!hasCooldown) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasCooldown]);

  useEffect(() => {
    if (!enabled || refreshing) return;
    const delay = nextRefreshDelay(slots, Date.now(), lastAttemptAt.current);
    if (delay === null) return;
    const timer = window.setTimeout(() => { void refreshSlots(); }, delay);
    return () => window.clearTimeout(timer);
  }, [slots, enabled, now, refreshing, refreshSlots]);

  return { now, refreshing, refreshError, refreshSlots };
}
