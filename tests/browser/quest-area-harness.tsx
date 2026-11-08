import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useQuestArea } from '../../src/location/useQuestArea';
import { QuestAreaNotice } from '../../src/location/QuestAreaNotice';
import { AreaContext } from './quest-area-context';
import '../../src/styles.css';

function Area({ enabled }: { enabled: boolean }) {
  const [area, setArea] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const location = useQuestArea({ area, enabled });
  useEffect(() => {
    const saved = (event: Event) => { setArea((event as CustomEvent).detail); setSlots(Array(6).fill({})); };
    window.addEventListener('region-saved', saved); return () => window.removeEventListener('region-saved', saved);
  }, []);
  return <AreaContext.Provider value={{ location, area, slots, ready: enabled, startAnywhere: () => setSlots(Array(6).fill({})) }}><QuestAreaNotice /><output>{location.status.kind}</output></AreaContext.Provider>;
}
function Harness() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(true);
  return <><button onClick={() => setEnabled(value => !value)}>Toggle connection</button><button onClick={() => setMounted(false)}>Unmount</button>{mounted && <Area enabled={enabled} />}</>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
