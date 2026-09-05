import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-sm',
  secondary: 'bg-panel text-ink border border-line hover:bg-raised',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
  dangerGhost: 'text-danger border border-line hover:bg-danger-soft',
};

export function Button({ variant = 'primary', className, busy, children, ...props }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-11',
        BUTTON_VARIANTS[variant], className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }) {
  return (
    <svg className={cx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error
        ? <p className="text-sm text-danger">{error}</p>
        : hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

const CONTROL = 'w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-ink placeholder:text-muted '
  + 'min-h-11 text-base sm:text-sm transition-colors focus:border-accent focus:outline-none '
  + 'focus:ring-2 focus:ring-accent/30 disabled:opacity-60';

export function Input({ className, type = 'text', ...props }) {
  return <input {...props} type={type} className={cx(CONTROL, className)} />;
}

/**
 * Numeric field.
 *
 * Kept separate from Input because a number needs more than `type="number"`:
 * a numeric keypad on mobile, a visible stepper, and tolerance for the box
 * being momentarily empty. Coercing with Number() on every keystroke turns a
 * cleared field into 0 and makes it impossible to retype the first digit, so
 * the raw string is held here and only parsed on the way out.
 *
 * `onChange` receives a number, or null while the box is empty.
 */
export function NumberInput({ className, value, onChange, min, max, step = 1, ...props }) {
  return (
    <input
      {...props}
      type="number"
      inputMode="numeric"
      // Chrome only paints the spinner on hover/focus; this keeps it visible.
      className={cx(CONTROL, 'tc-number', className)}
      min={min}
      max={max}
      step={step}
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' ? null : Number(raw), raw);
      }}
    />
  );
}

export function Select({ className, children, ...props }) {
  return <select {...props} className={cx(CONTROL, 'appearance-none pr-9', className)}>{children}</select>;
}

export function Toggle({ checked, onChange, label, description, id }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-1">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cx(
            // left-0 anchors the knob; without it the absolute element falls
            // back to its static position at the end of the empty track.
            'absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div {...props} className={cx('rounded-xl border border-line bg-panel', className)}>
      {children}
    </div>
  );
}

export function Alert({ tone = 'error', children, className }) {
  const tones = {
    error: 'border-danger/40 bg-danger-soft text-danger',
    info: 'border-line bg-raised text-muted',
    accent: 'border-accent/40 bg-accent-soft text-ink',
  };
  if (!children) return null;
  return (
    <div role={tone === 'error' ? 'alert' : undefined}
      className={cx('rounded-lg border px-3.5 py-2.5 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-raised text-muted border-line',
    accent: 'bg-accent-soft text-accent border-accent/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
  };
  return (
    <span className={cx(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
      tones[tone],
    )}>
      {children}
    </span>
  );
}

/**
 * Accessible modal: focus moved on open, Escape closes, click-outside closes.
 *
 * Rendered through a portal into <body>. `position: fixed` is resolved against
 * the nearest ancestor with a transform, filter or backdrop-filter rather than
 * the viewport, and the app header uses backdrop-blur -- a modal opened from
 * the profile menu would otherwise be anchored to the header and hang off the
 * top of the screen.
 */
export function Modal({ open, onClose, title, children, footer, wide }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement;
    const timer = setTimeout(() => {
      panelRef.current?.querySelector('input, textarea, select, button')?.focus();
    }, 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal((
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-panel',
          'shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-line bg-panel px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="-mr-1 rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-ink">
            <Icon name="close" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-panel px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

const PATHS = {
  close: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  download: 'M12 4v12m0 0 4-4m-4 4-4-4M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7',
  refresh: 'M20 11a8 8 0 0 0-14-4.5L4 9m0-5v5h5m-5 2a8 8 0 0 0 14 4.5L20 15m0 5v-5h-5',
  qr: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3h3m0 0v3m0-3h3v-3m-6 0h.01',
  copy: 'M9 9V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-4M5 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z',
  check: 'm5 13 4 4L19 7',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11.5 9v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.64.73.83.3.17.64.26 1 .26H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  library: 'M4 6h16M4 12h16M4 18h10',
  logout: 'M16 17l5-5-5-5m5 5H9m0-9H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3',
  file: 'M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z',
  doc: 'M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM9 13h6M9 17h4',
  infinity: 'M6.5 15.5a3.5 3.5 0 1 1 0-7c2 0 3 1.2 5.5 3.5s3.5 3.5 5.5 3.5a3.5 3.5 0 1 0 0-7c-2 0-3 1.2-5.5 3.5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  lock: 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  back: 'M19 12H5m0 0 6-6m-6 6 6 6',
  key: 'M15 7a5 5 0 1 1-4.6 6.9L4 20.3V16h4v-3l2.4-2.4A5 5 0 0 1 15 7Zm2 2h.01',
  shield: 'M12 3l8 3v6c0 4.4-3.2 8.2-8 9-4.8-.8-8-4.6-8-9V6l8-3Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  install: 'M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z|M12 11v5|M12 7.5h.01',
  bug: 'M8 6a4 4 0 1 1 8 0m-9 3h10v5a5 5 0 0 1-10 0V9Zm-4 1h4m-4 5h4m12-5h-4m4 5h-4M6.5 5 8 6.5M17.5 5 16 6.5',
};

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path.split('|').map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
