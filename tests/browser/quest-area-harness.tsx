import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useQuestArea } from '../../src/location/useQuestArea';

function Area({ enabled }: { enabled: boolean }) {
  const location = useQuestArea({ area: null, enabled });
  return <>
    <output>{location.status.kind}</output>
    <button onClick={location.enable}>Enable</button>
    <button onClick={location.disable}>Stop</button>
    <button onClick={location.retry}>Retry</button>
  </>;
}

function Harness() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(true);
  return <>
    <button onClick={() => setEnabled(value => !value)}>Toggle connection</button>
    <button onClick={() => setMounted(false)}>Unmount</button>
    {mounted && <Area enabled={enabled} />}
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
