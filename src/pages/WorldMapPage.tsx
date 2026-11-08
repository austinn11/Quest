import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';
import { QuestDate } from '../questboard/QuestDate';
import { QuestMap, type MapViewRequest, type PlayerLocation } from '../map/QuestMap';
import { directionsUrl, locatedQuests, validCoordinates } from '../map/quest-locations';
import { questMapPath, resolveQuestMapTarget } from '../map/quest-navigation';
import { CompleteQuestButton } from '../questboard/CompleteQuestButton';
import { QuestCooldown } from '../questboard/QuestCooldown';
import { CheckIcon } from '../ui/icons';
import { PageHeading } from '../ui/PageHeading';

export function WorldMapPage() {
  const { slots, templates, ready, connected, hasSnapshot, initializing, error, subscriptionError, now, refreshing } = useQuestboard();
  const quests = useMemo(() => locatedQuests(slots, templates), [slots, templates]);
  const { search, key: routeKey } = useLocation();
  const navigateTo = useNavigate();
  const target = resolveQuestMapTarget(search, slots, quests);
  const selected = hasSnapshot && target.kind === 'selected' ? target.quest : undefined;
  const selectedKey = selected?.key;
  const canComplete = connected && ready && !initializing && !error && !subscriptionError && !refreshing;
  const [view, setView] = useState<MapViewRequest>({ target: 'default', sequence: 0 });
  const [playerLocation, setPlayerLocation] = useState<PlayerLocation | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const select = useCallback((key: string) => {
    const quest = quests.find(row => row.key === key);
    if (quest) navigateTo(questMapPath(quest.slot), { replace: true });
  }, [quests, navigateTo]);
  useEffect(() => {
    if (selectedKey) setView(current => ({ target: 'quest', questKey: selectedKey, sequence: current.sequence + 1 }));
  }, [selectedKey, routeKey]);
  const navigate = (target: MapViewRequest['target']) => setView(current => ({ target, sequence: current.sequence + 1 }));

  function locatePlayer() {
    if (!navigator.geolocation) { setLocationMessage('Location is unavailable in this browser. Explore manually or return to the default area.'); return; }
    if (playerLocation) { navigate('player'); return; }
    setLocationPending(true);
    setLocationMessage(null);
    // Requested only on click. This position stays in this page's memory, never in SpacetimeDB.
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current) return;
      setLocationPending(false);
      const { latitude, longitude, accuracy } = position.coords;
      if (!validCoordinates(latitude, longitude)) { setLocationMessage('Your location could not be read. Explore the map manually.'); return; }
      setPlayerLocation({ latitude, longitude, accuracy });
      setLocationMessage(`Your approximate position is shown (within ${Math.round(accuracy)} metres).`);
      navigate('player');
    }, error => {
      if (!mounted.current) return;
      setLocationPending(false);
      setLocationMessage(error.code === 1 ? 'Location permission was declined. You can still pan, zoom, and explore the default area.' : 'Your location could not be determined. Explore manually or return to the default area.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  return (
    <>
      <PageHeading title="World Map">
        <Link to="/questboard">Questboard</Link>
      </PageHeading>
      <QuestSyncNotice page="Questboard" />
      <div className="map-toolbar" aria-label="Map controls">
        <button type="button" className="secondary" onClick={() => navigate('default')}>Default area</button>
        <button type="button" className="secondary" disabled={!quests.length} onClick={() => navigate('quests')}>Show quest locations</button>
        <button type="button" className="secondary" disabled={locationPending} onClick={locatePlayer}>{locationPending ? 'Finding your position...' : 'My location'}</button>
      </div>
      {locationMessage && <p role="status">{locationMessage}</p>}
      <div className="world-map-layout">
        <div className="map-main">
          <QuestMap quests={hasSnapshot ? quests : []} selectedKey={selected?.key ?? null} onSelect={select} view={view} playerLocation={playerLocation} />
          <div className="map-legend" aria-label="Quest marker legend"><span><i className="legend-dot" aria-hidden="true" />Easy</span><span><i className="legend-dot medium" aria-hidden="true" />Medium</span><span><i className="legend-dot hard" aria-hidden="true" />Hard</span><span>✓ / dimmed: Cooldown</span></div>
          <p className="field-help">Map points identify destinations, not verified entrances or routes. Check local access, opening hours, and any admission requirements.</p>
          <section className="map-destinations" aria-labelledby="map-quests-title">
            <h2 id="map-quests-title">Destinations</h2>
            {hasSnapshot && quests.length > 0 && (
              <ul className="map-quest-list">
                {quests.map((quest, index) => (
                  <li key={quest.key}>
                    <button type="button" className="map-quest-option" aria-pressed={selected?.key === quest.key} onClick={() => select(quest.key)}>
                      <span className="map-quest-number" aria-hidden="true">{quest.slot.status.tag === 'Cooldown' ? <CheckIcon /> : index + 1}</span>
                      <span><span className="map-quest-title">{quest.template.title}</span><small>{quest.slot.difficulty.tag} · {quest.slot.status.tag}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {ready && !subscriptionError && !quests.length && <p>Your current quests have no fixed map destinations. New location-based adventures can appear when your slots refresh.</p>}
            {hasSnapshot && slots.length > quests.length && <p className="field-help">{slots.length - quests.length} assigned {slots.length - quests.length === 1 ? 'quest has' : 'quests have'} no mapped destination. You can still work on them from your Questboard.</p>}
            <p><Link to="/questboard">Open your Questboard</Link></p>
          </section>
        </div>
        <aside className="map-detail" aria-labelledby="map-detail-title" aria-live="polite">
          <h2 id="map-detail-title">Adventure details</h2>
          {selected ? (
            <>
              <h3>{selected.template.title}</h3>
              <p>{selected.template.locationName || 'Quest destination'}{selected.template.locationType && <span className="field-help"> · {selected.template.locationType}</span>}</p>
              <p className="quest-meta">{selected.template.category.tag} · {selected.slot.difficulty.tag} · {selected.template.xpReward} XP reward</p>
              <p><span className={`quest-status${selected.slot.status.tag === 'Cooldown' ? ' is-cooldown' : ''}`}>{selected.slot.status.tag}</span></p>
              <p>{selected.template.description}</p>
              <p className="field-help">{selected.coordinates[1].toFixed(5)}, {selected.coordinates[0].toFixed(5)}</p>
              {selected.slot.completedAt && <p>Completed <QuestDate timestamp={selected.slot.completedAt} /></p>}
              {selected.slot.refreshAt && <p>Replacement eligible <QuestDate timestamp={selected.slot.refreshAt} /></p>}
              <QuestCooldown slot={selected.slot} now={now} refreshing={refreshing} />
              <CompleteQuestButton key={selected.key} slot={selected.slot} disabled={!canComplete} bounty={selected.template.category.tag === 'Bestiary'} />
              <div className="map-detail-links"><Link to={`/questboard#quest-slot-${selected.slot.slotIndex}`}>View this quest on your Questboard</Link><a href={directionsUrl(selected)} target="_blank" rel="noopener noreferrer">Walking directions in Google Maps ↗</a></div>
            </>
          ) : target.kind === 'none' ? <p>Select a quest marker or destination to inspect its objective and rewards.</p>
            : !ready ? <p>Waiting for current quest data before opening this adventure.</p>
            : target.kind === 'invalid' ? <p>This quest map link is invalid. Choose a current destination from the list.</p>
            : target.kind === 'unmapped' ? <p>This quest has no fixed map location. <Link to={`/questboard#quest-slot-${target.slot.slotIndex}`}>View it on your Questboard</Link>.</p>
            : <p>That assignment has changed or is no longer on your board. Select a current quest to continue.</p>}
        </aside>
      </div>
    </>
  );
}
