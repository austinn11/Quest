import { useEffect, useState, type FormEvent } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import { PlayerAccount } from './auth/PlayerAccount';

function App() {
  const { isActive, identity, connectionError } = useSpacetimeDB();
  const [people, peopleReady] = useTable(tables.person);
  const addPerson = useReducer(reducers.add);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [lastSavedName, setLastSavedName] = useState<string | null>(null);
  const [syncDelayed, setSyncDelayed] = useState(false);

  useEffect(() => {
    setSyncDelayed(false);
    if (!isActive || peopleReady) return;
    const timer = window.setTimeout(() => setSyncDelayed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [isActive, peopleReady]);

  const ready = isActive && peopleReady;
  const status = isActive
    ? peopleReady ? 'Connected' : 'Synchronizing'
    : connectionError ? 'Connection error' : identity ? 'Reconnecting' : 'Connecting';

  const submitTest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || isSubmitting) return;
    const trimmedName = name.trim();
    setSubmissionError(null);
    setLastSavedName(null);
    if (!trimmedName || trimmedName.length > 80) {
      setSubmissionError('Enter a test name between 1 and 80 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addPerson({ name: trimmedName });
      setLastSavedName(trimmedName);
      setName('');
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'The test could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="foundation">
      <header>
        <p className="eyebrow">The adventure starts here</p>
        <h1>Quest</h1>
        <p className="intro">Your connection to the realm, ready for its first adventure.</p>
      </header>

      <PlayerAccount />

      <section className="panel" aria-labelledby="connection-title">
        <div className="panel-heading">
          <h2 id="connection-title">Connection check</h2>
          <span className={`badge ${ready ? 'badge-ready' : 'badge-waiting'}`} role="status">
            {status}
          </span>
        </div>
        {ready ? (
          <p>The database is connected and your live subscription is ready.</p>
        ) : isActive ? (
          <p>Connected to the database. Waiting for the first subscription data.</p>
        ) : (
          <p>{identity ? 'The connection was interrupted. Reconnecting automatically.' : 'Opening a connection to the database.'}</p>
        )}
        {!isActive && connectionError && (
          <div className="error" role="alert">
            <p>Unable to reach the database. Check your internet connection and database settings. Retrying automatically.</p>
            <p className="error-detail">{connectionError.message}</p>
          </div>
        )}
        {isActive && syncDelayed && (
          <p className="error" role="alert">
            Data is taking longer than expected to synchronize. Check that the published module matches the client bindings, then retry.
          </p>
        )}
        {((!isActive && (connectionError || identity)) || syncDelayed) && (
          <button className="secondary" type="button" onClick={() => window.location.reload()}>
            Retry connection
          </button>
        )}
      </section>

      <section className="panel" aria-labelledby="test-title">
        <h2 id="test-title">Send a test record</h2>
        <p>Save a shared test name to confirm the connection. Open this page in another tab to see it arrive live.</p>
        <form onSubmit={submitTest}>
          <label htmlFor="test-name">Test name</label>
          <div className="form-row">
            <input
              id="test-name"
              name="test-name"
              type="text"
              placeholder="e.g. Adventurer"
              value={name}
              maxLength={80}
              required
              disabled={!ready || isSubmitting}
              onChange={event => setName(event.target.value)}
              aria-describedby={submissionError ? 'submission-error' : undefined}
            />
            <button type="submit" disabled={!ready || isSubmitting || !name.trim()}>
              {isSubmitting ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </form>
        {submissionError && <p id="submission-error" className="error" role="alert">{submissionError}</p>}
        {lastSavedName && (
          <p className="success" role="status">
            {ready && people.some(person => person.name === lastSavedName)
              ? `Received “${lastSavedName}” through the live subscription.`
              : `The reducer saved “${lastSavedName}”. Waiting for the live subscription.`}
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="records-title" aria-busy={!ready}>
        <div className="panel-heading">
          <h2 id="records-title">Shared test records</h2>
          {ready && <span className="record-count">{people.length} records</span>}
        </div>
        {!ready ? (
          <p>Waiting for a live connection and subscription.</p>
        ) : people.length === 0 ? (
          <p>No records yet. Send your first test above.</p>
        ) : (
          <ul className="records">
            {people.map((person, index) => <li key={index}>{person.name}</li>)}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
