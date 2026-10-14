import { useEffect, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { localeOf } from '../../../i18n/dateFormat';
import {
  classifyRatingError,
  fetchRateableWorks,
  submitRating,
  type RateableWork,
} from '../../../api/ratings.api';

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * RAT-04. The approved eligibility is the server's alone: a rating stands on one completed piece
 * of shared work, chosen here from the pair's real list — never typed, never invented — and every
 * refusal (not eligible, already rated, superseded) is the backend's word rendered in words.
 */
export const RatingDialog = ({
  rateeUserId,
  rateeName,
  onClose,
  onRated,
}: {
  rateeUserId: string;
  rateeName: string;
  onClose: () => void;
  onRated: () => void;
}) => {
  const { t, lang } = useLanguage();
  const copy = t.rating;
  const [works, setWorks] = useState<readonly RateableWork[] | null>(null);
  const [workId, setWorkId] = useState('');
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchRateableWorks(rateeUserId)
      .then((rows) => {
        if (!current) return;
        setWorks(rows);
        if (rows.length === 1 && rows[0] !== undefined) setWorkId(rows[0].id);
      })
      .catch(() => {
        if (current) setFailure(copy.errors.generic);
      });
    return () => {
      current = false;
    };
  }, [rateeUserId, copy.errors.generic]);

  const dayOf = (iso: string): string =>
    new Date(iso).toLocaleDateString(localeOf(lang), { day: '2-digit', month: '2-digit', year: 'numeric' });

  const submit = async (): Promise<void> => {
    if (busy || workId === '' || score === 0) return;
    setBusy(true);
    setFailure(null);
    try {
      await submitRating({
        rateeUserId,
        workId,
        score,
        ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
      });
      setDone(true);
      onRated();
    } catch (error) {
      const code = classifyRatingError(error);
      setFailure(
        code === 'NOT_ELIGIBLE' ? copy.errors.notEligible
        : code === 'ALREADY_RATED' ? copy.errors.alreadyRated
        : code === 'SUPERSEDED' ? copy.errors.superseded
        : code === 'NETWORK' ? copy.errors.network
        : copy.errors.generic,
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="msg-dialog" aria-labelledby="rating-title">
        <h3 id="rating-title" className="msg-dialog__title">{copy.title}</h3>
        <p className="msg-dialog__sent" role="status">{copy.success}</p>
        <div className="msg-dialog__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="msg-dialog"
      aria-labelledby="rating-title"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 id="rating-title" className="msg-dialog__title">{copy.title}</h3>
      <p className="msg-dialog__subject" dir="auto">{rateeName}</p>

      {failure !== null ? <p className="msg-dialog__error" role="alert">{failure}</p> : null}

      {works === null ? (
        <p className="msg-empty">{copy.loading}</p>
      ) : works.length === 0 ? (
        <p className="msg-empty">{copy.errors.notEligible}</p>
      ) : (
        <>
          <label className="field-label" htmlFor="rating-work">{copy.workLabel}</label>
          <select
            id="rating-work"
            className="form-input"
            value={workId}
            onChange={(event) => setWorkId(event.target.value)}
          >
            <option value="" disabled>{copy.workPlaceholder}</option>
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title} · {dayOf(work.completedAt)}
              </option>
            ))}
          </select>

          <span className="field-label" id="rating-score-label">{copy.scoreLabel}</span>
          <div className="rating-stars" role="radiogroup" aria-labelledby="rating-score-label">
            {SCORES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={score === value}
                aria-label={`${value}`}
                className={`rating-star${score >= value ? ' rating-star--on' : ''}`}
                onClick={() => setScore(value)}
              >
                ★
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="rating-comment">{copy.commentLabel}</label>
          <textarea
            id="rating-comment"
            className="msg-composer__input msg-dialog__input"
            rows={3}
            dir="auto"
            maxLength={600}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </>
      )}

      <div className="msg-dialog__actions">
        {works !== null && works.length > 0 ? (
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={busy || workId === '' || score === 0}
            aria-busy={busy}
          >
            {copy.submit}
            {busy ? <ButtonSpinner /> : null}
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
};
