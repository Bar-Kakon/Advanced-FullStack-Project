import { useCallback, useRef, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import {
  classifyProfileError,
  removeAvatar,
  uploadAvatar,
  type Profile,
} from '../../../api/profile.api';
import { ProfileAvatar } from './ProfileAvatar';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The real upload: a file input, a multipart PUT, and whatever the server answers back. Nothing is
 * held in the browser as a preview — what is shown is what the server stored, so a reload shows
 * the same picture.
 */
export const AvatarField = ({
  profile,
  initials,
  onChanged,
}: {
  profile: Profile;
  initials: string;
  onChanged: (next: Profile) => void;
}) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const message = useCallback(
    (failure: ReturnType<typeof classifyProfileError>): string =>
      failure === 'UNSUPPORTED_FILE_TYPE' ? t.editProfile.avatar.badType
      : failure === 'FILE_TOO_LARGE' ? t.editProfile.avatar.tooLarge
      : failure === 'NETWORK' ? t.profile.errors.network
      : t.editProfile.avatar.failed,
    [t],
  );

  const choose = useCallback(async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);

    // Checked here as well as on the server, so an oversized file is refused without the upload.
    if (file.size > MAX_BYTES) {
      setError(t.editProfile.avatar.tooLarge);
      return;
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setError(t.editProfile.avatar.badType);
      return;
    }

    setBusy('upload');
    try {
      onChanged(await uploadAvatar(file));
    } catch (failure) {
      setError(message(classifyProfileError(failure)));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [message, onChanged, t]);

  const clear = useCallback(async (): Promise<void> => {
    setError(null);
    setBusy('remove');
    try {
      onChanged(await removeAvatar());
    } catch (failure) {
      setError(message(classifyProfileError(failure)));
    } finally {
      setBusy(null);
    }
  }, [message, onChanged]);

  return (
    <div className="avatar-row">
      <ProfileAvatar avatarUrl={profile.avatarUrl} initials={initials} large />

      <div className="avatar-row__actions">
        <input
          ref={inputRef}
          id="avatar"
          className="sr-only"
          type="file"
          accept={ACCEPT}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        <label className="btn btn--ghost btn--sm" htmlFor="avatar" aria-busy={busy === 'upload'}>
          {t.editProfile.avatar.upload}
          {busy === 'upload' ? <ButtonSpinner /> : null}
        </label>

        {profile.avatarUrl ? (
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() => void clear()}
            disabled={busy !== null}
            aria-busy={busy === 'remove'}
          >
            {t.editProfile.avatar.remove}
            {busy === 'remove' ? <ButtonSpinner /> : null}
          </button>
        ) : null}

        <p className="field-hint">{t.editProfile.avatar.hint}</p>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </div>
    </div>
  );
};
