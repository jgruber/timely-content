import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Card, Icon } from './ui.jsx';

/** Shared frame for the signed-out account screens. */
export default function AuthShell({ title, subtitle, icon = 'qr', children, footer }) {
  const { siteName } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-sm">
            <Icon name={icon} className="h-7 w-7" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">{title}</h1>
            {subtitle && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{subtitle}</p>}
          </div>
        </div>

        <Card className="p-6">{children}</Card>

        <p className="mt-5 text-center text-sm text-muted">
          {footer || (
            <Link to="/login" className="text-accent underline underline-offset-2">
              Back to sign in
            </Link>
          )}
        </p>
        <p className="mt-2 text-center text-xs text-muted">{siteName}</p>
      </div>
    </div>
  );
}
