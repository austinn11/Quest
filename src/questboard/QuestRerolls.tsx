import { useEffect, useRef } from 'react';
import { FREE_REROLLS } from '../../shared/rerolls';
import type { useQuestRerolls } from './useQuestRerolls';
import { formatCooldown } from './cooldown';

type Controls = ReturnType<typeof useQuestRerolls>;

export function RerollAllowance({ controls }: { controls: Controls }) {
  return (
    <div className="reroll-allowance">
      <div className="reroll-summary">
        <p>Free Rerolls: <span>{controls.allowance ? `${controls.allowance.remaining} / ${FREE_REROLLS}` : 'Syncing...'}</span></p>
        {controls.allowance?.resetAt !== null && controls.allowance?.resetAt !== undefined && <p className="field-help">Next reset: {formatCooldown(Math.max(0, Number(controls.allowance.resetAt / 1000n) - controls.now))}</p>}
      </div>
      {controls.success && <p className="success" role="status">{controls.success}</p>}
      {controls.error && <p className="error" role="alert">{controls.error}</p>}
    </div>
  );
}

export function RerollDialog({ controls, title, enabled }: { controls: Controls; title: string; enabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const isOpen = controls.target !== null;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen && !element.open) element.showModal();
    else if (!isOpen && element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [isOpen]);
  return (
    <dialog ref={dialog} className="reroll-dialog" aria-labelledby="reroll-title" aria-describedby="reroll-description"
      onCancel={event => { event.preventDefault(); controls.cancel(); }}>
      <h2 id="reroll-title">Reroll this quest?</h2>
      <p className="reroll-quest-name">{title}</p>
      <p id="reroll-description">The current quest will be replaced by another quest of the same difficulty. This uses one free reroll and awards no XP.</p>
      <div className="reroll-dialog-actions">
        <button type="button" className="secondary" autoFocus disabled={controls.pending} onClick={controls.cancel}>Cancel</button>
        <button type="button" disabled={!enabled || controls.pending || !controls.allowance?.remaining} aria-busy={controls.pending} onClick={() => { void controls.confirm(); }}>{controls.pending ? 'Rerolling...' : 'Confirm Reroll'}</button>
      </div>
    </dialog>
  );
}
