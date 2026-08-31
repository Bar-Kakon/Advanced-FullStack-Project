import { useLanguage } from '../../../i18n/useLanguage';
import { EQUIPMENT_CODES, type EquipmentCode } from '../profileModel';
import { Choice } from './Choice';

/**
 * The heavy-equipment picker, opened from the specialties block when that trade is selected — a
 * contractor typically operates only part of the category, so the category alone does not say
 * what they can actually do.
 *
 * **Nothing stores this.** D14's heavy-equipment half has no schema: it is undecided whether it
 * is a second array on the user, a sub-document keyed by specialty, or a general mechanism for
 * specialty attributes. The control ships anyway, per the standing rule that a gap in the model
 * is not a reason to drop a control, and the gap is reported rather than hidden.
 *
 * The earlier screen parked the open state in a checkbox because CSS has nowhere else to keep it, and
 * closed the dialog with a `<label>`. Here it is state and two buttons, so the dialog closes on
 * Escape as well.
 */
export const EquipmentPicker = ({
  open, selected, onToggle, onClose,
}: {
  open: boolean;
  selected: readonly EquipmentCode[];
  onToggle: (code: EquipmentCode, on: boolean) => void;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  if (!open) return null;

  return (
    <div
      className="equip-modal equip-modal--open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="equip-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <button type="button" className="equip-modal__backdrop" aria-label={t.editProfile.equipment.close} onClick={onClose} />
      <div className="equip-modal__panel">
        <h2 id="equip-title" className="equip-modal__title">{t.editProfile.equipment.title}</h2>
        <p className="equip-modal__lede">{t.editProfile.equipment.lede}</p>
        <ul className="choice-grid">
          {EQUIPMENT_CODES.map((code) => (
            <li key={code}>
              <Choice
                type="checkbox" name="equipment" value={code}
                checked={selected.includes(code)}
                onChange={(on) => onToggle(code, on)}
              >
                <span className="choice__label">{t.editProfile.equipment.items[code]}</span>
              </Choice>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--primary btn--sm equip-modal__done" onClick={onClose}>
          {t.editProfile.equipment.done}
        </button>
      </div>
    </div>
  );
};
