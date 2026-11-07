import { useState, type FormEvent } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';

export function UsernameEditor({ username, disabled }: { username: string; disabled: boolean }) {
  const setUsername = useReducer(reducers.setUsername);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || saving) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await setUsername({ username: draft.trim() });
      setEditing(false);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Your username could not be saved. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="username-editor">
      {editing || !username ? (
        <form onSubmit={save} aria-label={username ? 'Edit username' : 'Create username'}>
          <label htmlFor="username">{username ? 'Edit username' : 'Choose your adventurer username'}</label>
          <p id="username-help" className="field-help">3 to 24 letters, numbers, or underscores. Each username belongs to one adventurer, regardless of capitalization.</p>
          <div className="form-row">
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]{3,24}"
              value={draft}
              onChange={event => { setDraft(event.target.value); setError(null); }}
              aria-describedby={`username-help${error ? ' username-error' : ''}`}
              aria-invalid={error ? true : undefined}
              disabled={disabled || saving}
            />
            <button type="submit" disabled={disabled || saving || !draft.trim()}>
              {saving ? 'Saving...' : username ? 'Save username' : 'Claim username'}
            </button>
            {username && (
              <button className="secondary" type="button" disabled={saving} onClick={() => {
                setEditing(false);
                setDraft(username);
                setError(null);
              }}>Cancel</button>
            )}
          </div>
        </form>
      ) : (
        <button className="secondary" type="button" disabled={disabled} onClick={() => {
          setDraft(username);
          setEditing(true);
          setSaved(false);
        }}>Edit username</button>
      )}
      {error && <p id="username-error" className="error" role="alert">{error}</p>}
      {saved && <p className="success" role="status">Username saved.</p>}
    </div>
  );
}
