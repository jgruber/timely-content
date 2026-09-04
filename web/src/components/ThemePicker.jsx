import { useAuth } from '../lib/auth.jsx';
import { ACCENTS, MODES } from '../lib/theme.js';
import { cx, Icon } from './ui.jsx';

/**
 * Appearance controls.
 *
 * With no props it edits the signed-in user's own preference. Passing `value`
 * and `onChange` turns it into a plain controlled input, which is how the
 * administration screen edits the site-wide default.
 */
export default function ThemePicker({ value, onChange, idPrefix = 'theme' }) {
  const auth = useAuth();
  const controlled = !!onChange;

  const prefs = controlled ? { ...value } : auth.prefs;
  const update = controlled
    ? (patch) => onChange({ ...value, ...patch })
    : auth.updatePrefs;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Appearance</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance mode">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={prefs.mode === mode.id}
              onClick={() => update({ mode: mode.id })}
              className={cx(
                'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                prefs.mode === mode.id
                  ? 'border-accent bg-accent-soft text-ink'
                  : 'border-line bg-panel text-muted hover:bg-raised',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Colour theme</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour theme">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              type="button"
              role="radio"
              aria-checked={prefs.accent === accent.id}
              aria-label={accent.label}
              title={accent.label}
              id={`${idPrefix}-${accent.id}`}
              onClick={() => update({ accent: accent.id })}
              className={cx(
                'grid h-10 w-10 place-items-center rounded-full border-2 transition-transform',
                prefs.accent === accent.id
                  ? 'scale-105 border-accent'
                  : 'border-transparent hover:scale-105',
              )}
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-full text-white"
                style={{ background: accent.swatch }}
              >
                {prefs.accent === accent.id && <Icon name="check" className="h-4 w-4" strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
