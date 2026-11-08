import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import type { PlayerQuestSlots } from '../module_bindings/types';

export function CompleteQuestButton({ slot, disabled }: { slot: PlayerQuestSlots; disabled: boolean }) {
  const complete = useReducer(reducers.completeQuest);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const inFlight = useRef(false);
  const assignment = `${slot.slotId}:${slot.assignedAt.microsSinceUnixEpoch}`;
  const currentAssignment = useRef(assignment);
  currentAssignment.current = assignment;

  useEffect(() => {
    inFlight.current = false;
    setPending(false);
    setError(null);
    setCompleted(false);
  }, [assignment]);

  async function onComplete() {
    if (disabled || inFlight.current || slot.status.tag !== 'Available') return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const submittedAssignment = assignment;
    try {
      await complete({ slotIndex: slot.slotIndex, expectedAssignedAt: slot.assignedAt });
      if (currentAssignment.current === submittedAssignment) setCompleted(true);
    } catch (error) {
      if (currentAssignment.current !== submittedAssignment) return;
      const ambiguous = error instanceof Error && error.name === 'UnknownCallResultError';
      setError(ambiguous
        ? 'The connection changed before completion was confirmed. Your quest may already be completed. Wait for your Questboard to sync before trying again.'
        : error instanceof Error ? error.message : 'Your quest could not be completed. Please try again.');
    } finally {
      if (currentAssignment.current === submittedAssignment) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <div className="quest-completion">
      {slot.status.tag === 'Available' && <button type="button" disabled={disabled || pending || completed} aria-busy={pending} onClick={() => { void onComplete(); }}>{pending ? 'Completing quest...' : completed ? 'Quest completed' : 'Complete quest'}</button>}
      {completed && <p className="success" role="status">Quest completed. Your reward is saved in your <Link to="/journal">Quest Journal</Link>.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
