import { Field, Input, Toggle, Icon, cx } from './ui.jsx';

/**
 * Access-limit editor shared by the create, upload and manage screens.
 * `limit` is null for unlimited, otherwise a positive integer.
 */
export default function AccessControls({ limit, onLimitChange, deleteOnExhaust, onDeleteChange, idPrefix = 'ac' }) {
  const unlimited = limit === null;

  return (
    <div className="space-y-4">
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
          hint="How many times the QR code may be scanned before it stops working."
        >
          <Input
            id={`${idPrefix}-count`}
            type="number"
            inputMode="numeric"
            min="1"
            max="1000000"
            value={limit ?? 1}
            onChange={(e) => {
              const raw = e.target.value;
              onLimitChange(raw === '' ? '' : Number(raw));
            }}
          />
        </Field>
      )}

      <Toggle
        id={`${idPrefix}-delete`}
        checked={!!deleteOnExhaust}
        onChange={onDeleteChange}
        label="Delete content when the limit is reached"
        description={
          unlimited
            ? 'Has no effect while the access limit is unlimited.'
            : 'The file and its record are permanently removed after the final view.'
        }
      />
    </div>
  );
}
