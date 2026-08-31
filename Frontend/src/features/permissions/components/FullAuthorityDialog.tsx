import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';

export interface FullAuthorityDialogProps {
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

/**
 * Full Project Authority is confirmed behind its own disclaimer, because it is the one grant whose
 * meaning grows on its own: permissions added to the scope later are included without anybody
 * granting them again.
 */
export const FullAuthorityDialog = ({ busy, onConfirm, onDismiss }: FullAuthorityDialogProps) => {
  const { t } = useLanguage();

  return (
    <div className="perm-dialog" role="alertdialog" aria-labelledby="full-authority-title">
      <h3 id="full-authority-title" className="perm-dialog__title">
        {t.permissions.fullAuthority.title}
      </h3>
      <p className="perm-dialog__body">{t.permissions.fullAuthority.disclaimer}</p>

      <div className="perm-dialog__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onConfirm}>
          {t.permissions.fullAuthority.confirm}
          {busy ? <ButtonSpinner /> : null}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>
          {t.permissions.fullAuthority.dismiss}
        </button>
      </div>
    </div>
  );
};
