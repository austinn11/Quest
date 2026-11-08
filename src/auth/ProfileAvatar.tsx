import { useRef, useState, type ChangeEvent } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import { photoToDataUrl } from '../questboard/photo';

const AVATAR_MAX_EDGE = 256;

// Round profile picture. Clicking it opens the camera or file picker.
export function ProfileAvatar({ avatar, name }: { avatar: string; name: string }) {
  const setAvatar = useReducer(reducers.setAvatar);
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (photo: string) => {
    setError(null);
    setSaving(true);
    try { await setAvatar({ photo }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Your picture could not be saved. Please retry.'); }
    finally { setSaving(false); }
  };
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { await save(await photoToDataUrl(file, AVATAR_MAX_EDGE, 0.8)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'That photo could not be opened.'); }
  };

  return (
    <div className="profile-avatar">
      <button type="button" className="avatar-button" onClick={() => input.current?.click()} disabled={saving}
        aria-label={avatar ? 'Change profile picture' : 'Add a profile picture'}>
        {avatar ? <img src={avatar} alt="" /> : <span aria-hidden="true">{(name.trim()[0] ?? '?').toUpperCase()}</span>}
        <span className="avatar-hint" aria-hidden="true">{saving ? '…' : avatar ? 'Change' : 'Add photo'}</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={event => { void choose(event); }} />
      {avatar && <button type="button" className="link-button avatar-remove" disabled={saving} onClick={() => { void save(''); }}>Remove</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
