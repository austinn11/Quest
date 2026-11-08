import { useEffect, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import type { PlayerQuestSlots } from '../module_bindings/types';
import { usePlayer } from '../player/PlayerProvider';
import { effectiveRerolls } from '../../shared/rerolls';

export function useQuestRerolls(slots: readonly PlayerQuestSlots[], enabled: boolean) {
  const { player, ready } = usePlayer();
  const invoke = useReducer(reducers.rerollQuest);
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState<PlayerQuestSlots | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const resetMicros = player?.rerollResetAt?.microsSinceUnixEpoch;
  const allowance = ready && player ? effectiveRerolls(player, BigInt(Math.trunc(now)) * 1000n) : null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setNow(Date.now());
    if (resetMicros === undefined) return;
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (BigInt(current) * 1000n >= resetMicros) window.clearInterval(timer);
    };
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [resetMicros]);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 5000);
    return () => window.clearTimeout(timer);
  }, [success]);
  useEffect(() => {
    if (!target || pending) return;
    const current = slots.find(slot => slot.slotId === target.slotId);
    if (!current || current.assignedAt.microsSinceUnixEpoch !== target.assignedAt.microsSinceUnixEpoch || current.status.tag !== 'Available') {
      setTarget(null);
      setError('This quest changed while you were inspecting it. Choose a current quest to reroll.');
    }
  }, [slots, target, pending]);

  function open(slot: PlayerQuestSlots) {
    if (!enabled || !allowance?.remaining || inFlight.current || slot.status.tag !== 'Available') return;
    setError(null); setSuccess(null); setTarget(slot);
  }

  async function confirm() {
    if (!target || !enabled || !allowance?.remaining || inFlight.current) return;
    const current = slots.find(slot => slot.slotId === target.slotId);
    if (!current || current.status.tag !== 'Available' || current.assignedAt.microsSinceUnixEpoch !== target.assignedAt.microsSinceUnixEpoch) return;
    inFlight.current = true;
    setPending(true); setError(null); setSuccess(null);
    try {
      await invoke({ slotIndex: target.slotIndex, expectedAssignedAt: target.assignedAt });
      if (mounted.current) setSuccess('Quest rerolled. Your next adventure is ready.');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error && failure.name === 'UnknownCallResultError'
        ? 'The connection changed before your reroll was confirmed. It may have succeeded. Wait for your Questboard and allowance to sync before trying again.'
        : typeof failure === 'string' ? failure : failure instanceof Error ? failure.message : 'The reroll could not be confirmed. Check your Questboard before trying again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) { setPending(false); setTarget(null); }
    }
  }

  return { allowance, now, target, pending, error, success, open, confirm, cancel: () => { if (!inFlight.current) setTarget(null); } };
}
