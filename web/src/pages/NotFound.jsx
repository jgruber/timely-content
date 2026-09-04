import { Link } from 'react-router-dom';
import { Icon } from '../components/ui.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-raised text-muted">
        <Icon name="file" className="h-7 w-7" />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-1 text-sm text-muted">That address does not lead anywhere.</p>
      </div>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5
          text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
      >
        Go to your library
      </Link>
    </div>
  );
}
