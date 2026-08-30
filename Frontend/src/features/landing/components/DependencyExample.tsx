import { useLanguage } from '../../../i18n/useLanguage';

/** Which row is which in the stylesheet's grid. The chart is fixed example data, so this is too. */
const ROW_MODIFIERS = ['pile', 'found', 'frame', 'elec'] as const;
const DAYS = [1, 5, 9, 13] as const;

/**
 * The dependency illustration beside the hero.
 *
 * It is example data drawn by this component, not a screenshot and not a read of any project. The
 * caption says so in both languages, and the real Project Dashboard visual replaces it once that
 * screen is approved and built.
 */
export const DependencyExample = () => {
  const { t } = useLanguage();
  const example = t.landing.example;

  return (
    <figure className="hero__visual depviz">
      <span className="reg-mark reg-mark--tl" aria-hidden="true" />
      <span className="reg-mark reg-mark--br" aria-hidden="true" />

      <h2 className="depviz__title">{example.title}</h2>

      {/* The legend states the two bar treatments in words, so the chart never depends on fill alone. */}
      <ul className="depviz__legend">
        <li className="depviz__key depviz__key--was">{example.was}</li>
        <li className="depviz__key depviz__key--now">{example.now}</li>
      </ul>

      <div className="depviz__chart">
        {/* The ruler counts working days, never weeks, so no working week is implied. */}
        <div className="depviz__ruler" aria-hidden="true">
          {DAYS.map((day) => (
            <span className="depviz__tick" key={day}>
              {example.dayLabel} <bdi>{day}</bdi>
            </span>
          ))}
        </div>

        {example.rows.map((row, index) => (
          <div className={`deprow deprow--${ROW_MODIFIERS[index]}`} key={row.name}>
            <div className="deprow__label">
              <span className="deprow__name">{row.name}</span>
              <span className="deprow__meta">{row.meta}</span>
              <span className="sr-only">{row.detail}</span>
            </div>
            <div className="deprow__track" aria-hidden="true">
              <span className="depbar depbar--was" />
              <span className={`depbar depbar--now${index === 0 ? ' depbar--source' : ''}`} />
            </div>
          </div>
        ))}
      </div>

      {/* The slot says what it is. Nothing here may be read as an existing product screen. */}
      <figcaption className="depviz__note">{example.note}</figcaption>
    </figure>
  );
};
