import { Field, Input, NumberInput, Toggle, Icon, cx } from './ui.jsx';

/**
 * Access settings shared by the create, upload and manage screens.
 *
 * The two limits are independent: a share can allow unlimited views and still
 * stop at a fixed time, which is the usual shape for "anyone in the room can
 * grab these photos, but only this afternoon".
 *
 * `limit` is null for unlimited. `expiresAt` is null for never, otherwise an
 * ISO string.
 */

const PRESETS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
];

/** <input type="datetime-local"> speaks local wall-clock time, not ISO. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AccessControls({
  limit, onLimitChange,
  expiresAt, onExpiryChange,
  deleteWhenFinished, onDeleteChange,
  idPrefix = 'ac',
}) {
  const unlimited = limit === null;
  const expires = !!expiresAt;
  const expired = expires && Date.parse(expiresAt) <= Date.now();

  const setPreset = (ms) => onExpiryChange(new Date(Date.now() + ms).toISOString());

  return (
    <div className="space-y-5">
      <Field label="QR code access limit">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onLimitChange(1)}
            className={cx(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
              !unlimited ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-panel text-muted hover:bg-raised',
            )}
          >
            <Icon name="eye" className="h-4 w-4" />
            Limited
          </button>
          <button
            type="button"
            onClick={() => onLimitChange(null)}
            className={cx(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
              unlimited ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-panel text-muted hover:bg-raised',
            )}
          >
            <Icon name="infinity" className="h-4 w-4" />
            Unlimited
          </button>
        </div>
      </Field>

      {!unlimited && (
        <Field
          label="Number of uses"
          htmlFor={`${idPrefix}-count`}
          hint="How many times the QR code may be opened before it stops working."
        >
          <NumberInput
            id={`${idPrefix}-count`}
            min={1}
            max={1000000}
            value={limit}
            onChange={(n) => onLimitChange(n === null ? '' : n)}
          />
        </Field>
      )}

      <div className="border-t border-line pt-5">
        <Field label="Stop working at a set time">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onExpiryChange(null)}
              className={cx(
                'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                !expires ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-panel text-muted hover:bg-raised',
              )}
            >
              <Icon name="infinity" className="h-4 w-4" />
              No time limit
            </button>
            <button
              type="button"
              onClick={() => !expires && setPreset(PRESETS[0].ms)}
              className={cx(
                'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                expires ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-panel text-muted hover:bg-raised',
              )}
            >
              <Icon name="eye" className="h-4 w-4" />
              Expires
            </button>
          </div>
        </Field>

        {expires && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPreset(p.ms)}
                  className="min-h-9 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm
                    font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  From now, {p.label}
                </button>
              ))}
            </div>

            <Field
              label="Expires on"
              htmlFor={`${idPrefix}-expires`}
              error={expired ? 'That time has already passed. Pick a time in the future.' : ''}
              hint={expired ? '' : 'Uses your device’s time zone.'}
            >
              <Input
                id={`${idPrefix}-expires`}
                type="datetime-local"
                value={toLocalInput(expiresAt)}
                onChange={(e) => onExpiryChange(fromLocalInput(e.target.value))}
              />
            </Field>
          </div>
        )}
      </div>

      <Toggle
        id={`${idPrefix}-delete`}
        checked={!!deleteWhenFinished}
        onChange={onDeleteChange}
        label="Delete the content once the share ends"
        description={
          unlimited && !expires
            ? 'Has no effect: this share has no limit and no expiry, so it never ends.'
            : 'Removes the files permanently once the limit is reached or the expiry passes. '
              + 'Leave off to keep them and issue a new QR code later.'
        }
      />
    </div>
  );
}
