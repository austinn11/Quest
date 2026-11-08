import { useQuestboard } from '../questboard/QuestboardProvider';
import { MapPinIcon } from '../ui/icons';

// Opt-in control and status for quests generated from places near the player.
export function QuestAreaNotice() {
  const { location } = useQuestboard();
  const { status } = location;
  if (status.kind === 'unsupported') return null;
  return (
    <div className={`area-notice area-${status.kind}`} role="status" aria-live="polite">
      <MapPinIcon className="icon-lg" />
      {status.kind === 'off' && (
        <>
          <span className="area-notice-text">Get quests about the parks, landmarks and trails around you. Your board reloads when you travel more than 10 km.</span>
          <button type="button" className="secondary" onClick={location.enable}>Find quests near me</button>
        </>
      )}
      {status.kind === 'locating' && <span className="area-notice-text">Finding your location...</span>}
      {status.kind === 'scouting' && <span className="area-notice-text">Scouting nearby parks, landmarks and trails. This can take a minute or two...</span>}
      {status.kind === 'ready' && (
        <>
          <span className="area-notice-text">{status.message}</span>
          <button type="button" className="link-button" onClick={location.disable}>Stop using my location</button>
        </>
      )}
      {status.kind === 'error' && (
        <>
          <span className="area-notice-text">{status.message}</span>
          <button type="button" className="secondary" onClick={location.retry}>Try again</button>
        </>
      )}
    </div>
  );
}
