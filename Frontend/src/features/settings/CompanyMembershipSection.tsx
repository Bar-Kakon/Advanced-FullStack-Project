import { useState } from 'react';

import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FieldLabel } from '../../components/FieldLabel';
import { fetchCurrentUser } from '../../api/auth.api';
import { claimCompanySeat, leaveCompany } from '../../api/employees.api';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';

const POSITIONS = [
  'main_contractor',
  'construction_manager',
  'regional_construction_manager',
  'site_manager',
  'contractor',
  'employee',
] as const;

/**
 * The account's company relationship, from the account's own side: an employee may end it, and an
 * account with no current relationship may claim an open seat their employer opened for them.
 * The owner's approval flow stays the gate on every claim.
 */
export const CompanyMembershipSection = () => {
  const { t } = useLanguage();
  const { user, setUser } = useAuth();
  const copy = t.settings.companyMembership;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'blocked' | 'generic' | null>(null);
  const [done, setDone] = useState<'left' | 'claimed' | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('employee');

  const refreshIdentity = async (): Promise<void> => {
    const refreshed = await fetchCurrentUser();
    setUser(refreshed);
  };

  const leave = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await leaveCompany();
      await refreshIdentity();
      setDone('left');
      setConfirming(false);
    } catch {
      setFailure('generic');
    } finally {
      setBusy(false);
    }
  };

  const claim = async (): Promise<void> => {
    if (busy || companyName.trim() === '') return;
    setBusy(true);
    setFailure(null);
    try {
      await claimCompanySeat({ companyName: companyName.trim(), companyPosition: position });
      await refreshIdentity();
      setDone('claimed');
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      setFailure(code === 'CLAIM_BLOCKED_BY_MIGRATION' ? 'blocked' : 'generic');
    } finally {
      setBusy(false);
    }
  };

  const isEmployee = user?.company?.standing === 'employee';
  const hasNoCompany = user !== null && user.company === null;
  const ownerState = user?.company?.ownerState ?? 'active';
  if (!isEmployee && !hasNoCompany && done === null) return null;

  return (
    <section className="settings-section" aria-labelledby="settings-company">
      <h2 className="settings-section__title" id="settings-company">{copy.title}</h2>

      {isEmployee && ownerState !== 'active' ? (
        <div className="notice notice--warn" role="status">
          <p className="settings-section__note settings-section__note--strong">
            {copy.ownerInactiveTitle}
          </p>
          <p className="settings-section__note">{copy.ownerInactiveNote}</p>
          {ownerState === 'recovery' ? (
            <p className="settings-section__note">{copy.ownerRecoveryNote}</p>
          ) : null}
        </div>
      ) : null}

      {failure === 'blocked' ? (
        <p className="notice notice--error" role="alert">{copy.claimBlocked}</p>
      ) : failure === 'generic' ? (
        <p className="notice notice--error" role="alert">{copy.failed}</p>
      ) : null}
      {done === 'left' ? <p className="panel__lede" role="status">{copy.leftNote}</p> : null}
      {done === 'claimed' ? <p className="panel__lede" role="status">{copy.claimedNote}</p> : null}

      {isEmployee ? (
        confirming ? (
          <>
            <p className="settings-section__note">{copy.leaveConsequences}</p>
            <div className="member-row__actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void leave()}>
                {copy.leaveConfirm}
                {busy ? <ButtonSpinner /> : null}
              </button>
              <button type="button" className="btn btn--quiet btn--sm" disabled={busy} onClick={() => setConfirming(false)}>
                {copy.cancel}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="settings-section__note">{copy.leaveNote}</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)}>
              {copy.leave}
            </button>
          </>
        )
      ) : null}

      {hasNoCompany ? (
        <>
          <p className="settings-section__note">{copy.claimNote}</p>
          <div className="settings-choice settings-choice--stack">
            <FieldLabel htmlFor="claim-company" text={copy.claimCompanyLabel} />
            <input
              id="claim-company"
              className="form-input"
              dir="auto"
              maxLength={200}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </div>
          <div className="settings-choice settings-choice--stack">
            <FieldLabel htmlFor="claim-position" text={copy.claimPositionLabel} />
            <select
              id="claim-position"
              className="form-input"
              value={position}
              onChange={(event) => setPosition(event.target.value as (typeof POSITIONS)[number])}
            >
              {POSITIONS.map((code) => (
                <option key={code} value={code}>{t.companyPositions[code]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={busy || companyName.trim() === ''}
            onClick={() => void claim()}
          >
            {copy.claim}
            {busy ? <ButtonSpinner /> : null}
          </button>
        </>
      ) : null}
    </section>
  );
};
