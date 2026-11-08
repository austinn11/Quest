import { usePlayer } from '../player/PlayerProvider';
import { useQuestboard } from './QuestboardProvider';

export function QuestSyncNotice({ page }: { page: 'Questboard' | 'Journal' }) {
  const { connected, ready, hasSnapshot, initializing, error, subscriptionError, retry } = useQuestboard();
  const { error: profileError } = usePlayer();
  if (!connected) {
    return <div className="panel sync-notice" role="status"><p>Waiting for the database connection. {hasSnapshot ? 'Your last synced adventures are shown below; they may be out of date.' : 'Your adventures will appear when the connection returns.'}</p></div>;
  }
  const failure = subscriptionError ?? (page === 'Questboard' ? error : null);
  if (failure) {
    return <div className="panel error" role="alert"><p>Your {page} could not be loaded. {failure}</p>{hasSnapshot && <p>Any adventures shown below are from the last successful sync.</p>}<button type="button" className="secondary" onClick={retry}>Retry {page}</button></div>;
  }
  if (profileError) return <div className="panel" role="status"><p>Your player profile must load before your adventures can sync. Use Retry profile above to try again.</p></div>;
  if (!ready || (page === 'Questboard' && initializing)) {
    return <div className="panel sync-notice" role="status"><p>{hasSnapshot ? 'Syncing your adventures. The last saved records are shown below.' : page === 'Questboard' ? 'Preparing your Questboard...' : 'Opening your Quest Journal...'}</p></div>;
  }
  return null;
}
