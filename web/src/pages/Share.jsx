import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api, publicDownloadUrl, publicFileUrl, publicThumbUrl } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.js';
import { formatBytes } from '../lib/format.js';
import { Card, Icon, Spinner, Badge } from '../components/ui.jsx';

/**
 * The passwordless view a QR code leads to.
 *
 * Opening this page spends one access. Markdown is rendered inline; anything
 * else is handed a single-use ticket and downloaded straight away.
 */
export default function SharePage() {
  const { token } = useParams();
  const { site, setAppearanceOverride } = useAuth();
  const [state, setState] = useState({ status: 'loading' });
  // React 18+ mounts effects twice in development; the guard keeps a single
  // access from being charged twice.
  const claimedToken = useRef(null);

  // A shared page always wears the site theme an administrator chose, even for
  // a signed-in visitor, so everyone who opens the link sees the same thing.
  useEffect(() => {
    if (!site?.appearance) return undefined;
    setAppearanceOverride(site.appearance);
    return () => setAppearanceOverride(null);
  }, [site, setAppearanceOverride]);

  useEffect(() => {
    if (claimedToken.current === token) return;
    claimedToken.current = token;

    api.claim(token)
      .then((payload) => {
        setState({ status: 'ok', payload });
      })
      .catch((err) => {
        setState({ status: 'error', message: err.message, reason: err.payload?.reason });
      });
  }, [token]);

  const html = useMemo(() => {
    if (state.status !== 'ok' || state.payload.kind !== 'markdown') return '';
    return renderMarkdown(state.payload.body);
  }, [state]);

  if (state.status === 'loading') {
    return (
      <Centered>
        <Spinner className="h-6 w-6 text-muted" />
        <p className="text-sm text-muted">Opening shared content</p>
      </Centered>
    );
  }

  if (state.status === 'error') {
    return (
      <Centered>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger">
          <Icon name="lock" className="h-7 w-7" />
        </span>
        <div className="space-y-1.5 text-center">
          <h1 className="text-lg font-semibold text-ink">
            {state.reason === 'exhausted' ? 'This link has been used up' : 'Link unavailable'}
          </h1>
          <p className="mx-auto max-w-sm text-sm text-muted">
            {state.reason === 'exhausted'
              ? 'The QR code reached its access limit. Ask the sender for a new one.'
              : state.message}
          </p>
        </div>
      </Centered>
    );
  }

  const { payload } = state;

  if (payload.kind !== 'markdown') {
    return <FileList payload={payload} />;
  }

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon name="doc" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-ink">{payload.title}</h1>
            <p className="text-xs text-muted">Shared with you</p>
          </div>
          {!payload.unlimited && (
            <Badge tone={payload.remaining === 0 ? 'danger' : 'neutral'}>
              {payload.remaining === 0 ? 'Last view' : `${payload.remaining} view${payload.remaining === 1 ? '' : 's'} left`}
            </Badge>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Card className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
        </Card>
        <div className="py-6">
          <RemainingNote payload={payload} />
        </div>
      </main>
    </div>
  );
}

function RemainingNote({ payload }) {
  if (payload.willVanish) {
    return (
      <p className="text-center text-xs text-danger">
        This was the final permitted view. The content is being removed from the server --
        save what you need now.
      </p>
    );
  }
  if (payload.unlimited) return null;
  return (
    <p className="text-center text-xs text-muted">
      {payload.remaining === 0
        ? 'This link has now reached its access limit.'
        : `This link can be opened ${payload.remaining} more time${payload.remaining === 1 ? '' : 's'}.`}
    </p>
  );
}

function Centered({ children }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-10">
      {children}
    </div>
  );
}

/**
 * What a QR code opens for a package of files.
 *
 * Individual downloads come first and the zip second, deliberately. On a phone
 * a zip lands in Files and has to be unpacked before a photo can be saved,
 * whereas tapping a single image lets the browser's own save-to-photos work.
 * The zip is there for "put all of this on my laptop".
 *
 * Every download rides the one ticket issued when the link was opened, so
 * fetching twenty photos still costs the single access already spent.
 */
function FileList({ payload }) {
  const { files = [], ticket } = payload;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const images = files.filter((f) => f.hasThumb).length;

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon name="file" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-ink">{payload.title}</h1>
            <p className="text-xs text-muted">
              {files.length} file{files.length === 1 ? '' : 's'} &middot; {formatBytes(totalBytes)}
            </p>
          </div>
          {!payload.unlimited && (
            <Badge tone={payload.remaining === 0 ? 'danger' : 'neutral'}>
              {payload.remaining === 0 ? 'Last view' : `${payload.remaining} left`}
            </Badge>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {files.length > 1 && (
          <a
            href={publicDownloadUrl(ticket)}
            className="mb-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg
              bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-colors
              hover:bg-accent-hover"
          >
            <Icon name="download" className="h-4 w-4" />
            Download all as a zip ({formatBytes(totalBytes)})
          </a>
        )}

        <Card className="divide-y divide-line">
          {files.map((file) => (
            <a
              key={file.id}
              href={publicFileUrl(ticket, file.id)}
              download={file.name}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-raised"
            >
              {file.hasThumb ? (
                <img
                  src={publicThumbUrl(ticket, file.id)}
                  alt=""
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-raised text-muted">
                  <Icon name="file" className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="text-xs text-muted">{formatBytes(file.size)}</p>
              </div>
              <span className="shrink-0 rounded-lg p-2 text-muted">
                <Icon name="download" className="h-5 w-5" />
              </span>
            </a>
          ))}
        </Card>

        {images > 0 && (
          <p className="mt-3 text-center text-xs text-muted">
            On a phone, open a picture and hold it to save it straight to your photos.
          </p>
        )}

        <div className="py-6">
          <RemainingNote payload={payload} />
        </div>
      </main>
    </div>
  );
}
