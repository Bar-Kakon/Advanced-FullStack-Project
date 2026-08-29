import { useLanguage } from '../../../i18n/useLanguage';
import type { ReceivedRating } from '../profileModel';
import { Stars } from './TrustPanel';

/**
 * The ratings a contractor received — read-only on both screens, and **anonymous to the person
 * being rated**. A row carries the score, the comment and the month, and deliberately not who
 * left it, which task it was for, or the exact date: any of those would identify the rater to
 * someone who knows what they worked on and when.
 *
 * `lede` differs between the two screens by one clause, so it is passed in rather than read here:
 * the edit screen is the one that has to say these cannot be edited, because it is the only
 * screen on which that could be a reasonable expectation.
 */
export const RatingsPanel = ({ ratings, lede }: { ratings: readonly ReceivedRating[]; lede: string }) => {
  const { t } = useLanguage();
  const empty = ratings.length === 0;

  return (
    <section className={`panel panel--ratings${empty ? ' panel--empty' : ''}`} aria-labelledby="ratings-title">
      <h2 id="ratings-title" className="panel__title">{t.profile.ratings.title}</h2>
      <p className="panel__lede">{lede}</p>

      {empty ? (
        <p className="state-empty">
          <span aria-hidden="true">—</span>
          <span className="sr-only">{t.profile.ratings.empty}</span>
        </p>
      ) : (
        <ul className="review-list">
          {ratings.map((rating) => (
            <li className="review" key={rating.id}>
              <div className="review__head">
                <Stars value={rating.score} small />
                <span className="review__score"><bdi>{rating.score}</bdi></span>
                <span className="review__date">{rating.date}</span>
              </div>
              <p className="review__body" dir="auto">{rating.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
