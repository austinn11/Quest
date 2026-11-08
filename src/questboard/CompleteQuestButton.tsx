import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { useProcedure } from 'spacetimedb/react';
import { procedures } from '../module_bindings';
import type { PlayerQuestSlots } from '../module_bindings/types';
import { CAPTURE_MAX_EDGE, CAPTURE_QUALITY, photoToDataUrl } from './photo';

type Phase = 'idle' | 'preparing' | 'checking' | 'accepted' | 'rejected' | 'error';

// Completing a quest means submitting a photo. The server's AI judge decides, then awards XP once.
// A Bestiary bounty also keeps a smaller copy of the photo in the player's collection.
export function CompleteQuestButton({ slot, disabled, bounty = false }: { slot: PlayerQuestSlots; disabled: boolean; bounty?: boolean }) {
  const submitPhoto = useProcedure(procedures.submitQuestPhoto);
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [observation, setObservation] = useState<string | null>(null);
  const [creature, setCreature] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inFlight = useRef(false);
  const assignment = `${slot.slotId}:${slot.assignedAt.microsSinceUnixEpoch}`;
  const currentAssignment = useRef(assignment);
  currentAssignment.current = assignment;

  useEffect(() => {
    inFlight.current = false;
    setPhase('idle');
    setMessage(null);
    setObservation(null);
    setCreature(null);
    setPreview(null);
  }, [assignment]);

  const busy = phase === 'preparing' || phase === 'checking';

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled || inFlight.current || slot.status.tag !== 'Available') return;
    inFlight.current = true;
    const submittedAssignment = assignment;
    const stillCurrent = () => currentAssignment.current === submittedAssignment;
    setMessage(null);
    setObservation(null);
    setPhase('preparing');
    try {
      const image = await photoToDataUrl(file);
      const capturePhoto = bounty ? await photoToDataUrl(file, CAPTURE_MAX_EDGE, CAPTURE_QUALITY) : undefined;
      if (!stillCurrent()) return;
      setPreview(image);
      setPhase('checking');
      const verdict = await submitPhoto({ slotIndex: slot.slotIndex, expectedAssignedAt: slot.assignedAt, image, capturePhoto });
      if (!stillCurrent()) return;
      setPhase(verdict.accepted ? 'accepted' : 'rejected');
      setMessage(verdict.message);
      setObservation(verdict.observation || null);
      setCreature(verdict.creature || null);
    } catch (error) {
      if (!stillCurrent()) return;
      const ambiguous = error instanceof Error && error.name === 'UnknownCallResultError';
      // Procedure failures arrive as the server's message string rather than an Error.
      const serverMessage = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
      setPhase('error');
      setMessage(ambiguous
        ? 'The connection changed before your photo was confirmed. Your quest may already be complete. Wait for your Questboard to sync before trying again.'
        : serverMessage || 'Your photo could not be checked. Please try again.');
    } finally {
      if (stillCurrent()) inFlight.current = false;
    }
  }

  return (
    <div className="quest-completion">
      {slot.status.tag === 'Available' && phase !== 'accepted' && (
        <>
          <button type="button" disabled={disabled || busy} aria-busy={busy} onClick={() => input.current?.click()}>
            {phase === 'preparing' ? 'Preparing photo...' : phase === 'checking' ? 'Checking photo...' : phase === 'rejected' || phase === 'error' ? 'Try another photo' : bounty ? 'Claim bounty' : 'Complete quest'}
          </button>
          <input ref={input} className="visually-hidden" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={event => { void onPhoto(event); }} />
        </>
      )}
      {preview && phase !== 'idle' && <img className="proof-preview" src={preview} alt="Your submitted photo" />}
      {phase === 'checking' && <p className="field-help" role="status">The guild is inspecting your proof...</p>}
      {phase === 'accepted' && (
        <p className="success" role="status">
          {message}{bounty && creature ? ` Captured: ${creature}.` : ''}{observation ? ` The guild saw: ${observation}.` : ''} {bounty
            ? <>It is filed in your <Link to="/bestiary">Bestiary</Link>.</>
            : <>It is recorded in your <Link to="/journal">Quest Journal</Link>.</>}
        </p>
      )}
      {phase === 'rejected' && <p className="error" role="alert">Not accepted: {message}{observation ? ` (The guild saw: ${observation}.)` : ''}</p>}
      {phase === 'error' && <p className="error" role="alert">{message}</p>}
    </div>
  );
}
