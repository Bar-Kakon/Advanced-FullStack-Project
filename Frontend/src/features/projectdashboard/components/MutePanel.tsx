import { useEffect, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { fetchProjectMute, setProjectMute } from '../../../api/coordination.api';

export interface MutePanelProps {
  readonly projectId: string;
}

export const MutePanel = ({ projectId }: MutePanelProps) => {
  const { t } = useLanguage();
  const copy = t.coordination.mute;

  const [muted, setMuted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const state = await fetchProjectMute(projectId, controller.signal);
        setMuted(state.muted);
      } catch {
        setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [projectId]);

  const toggle = (): void => {
    if (busy || muted === null) return;
    setBusy(true);
    setFailed(false);
    void (async () => {
      try {
        const next = await setProjectMute(projectId, !muted);
        setMuted(next.muted);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section className="panel" aria-labelledby="mute-title">
      <h2 id="mute-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {failed ? <p className="panel__lede panel__lede--error" role="alert">{copy.failed}</p> : null}

      {muted === null ? null : (
        <>
          <p className="mute-state">
            <span className={`prop-chip prop-chip--${muted ? 'muted' : 'active'}`}>
              {muted ? copy.muted : copy.unmuted}
            </span>
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-pressed={muted}
            disabled={busy}
            onClick={toggle}
          >
            {muted ? copy.unmute : copy.mute}
            {busy ? <ButtonSpinner /> : null}
          </button>
        </>
      )}

      <p className="panel__lede">{copy.notice}</p>
      <p className="panel__lede">{copy.pendingNotifications}</p>
    </section>
  );
};
