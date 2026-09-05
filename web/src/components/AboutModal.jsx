import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { isStandalone } from '../lib/pwa.js';
import { Modal, Button, Icon, Alert, Spinner } from './ui.jsx';

/**
 * Build identity, and a route to the issue tracker.
 *
 * The point is that someone reporting a problem can quote an exact version
 * rather than guessing, so the diagnostics are gathered here and pre-filled
 * into the issue body instead of being asked for in a follow-up.
 */
export default function AboutModal({ open, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError('');
    api.about()
      .then((res) => { if (!cancelled) setInfo(res); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const diagnostics = info && [
    `Version: ${info.version}`,
    `Running as: ${isStandalone() ? 'installed app' : 'browser tab'}`,
    `Browser: ${navigator.userAgent}`,
    `Server Node: ${info.nodeVersion}`,
  ].join('\n');

  // GitHub issue forms prefill by field id, so the version and browser boxes
  // in the template arrive already filled rather than being asked for later.
  const templateUrl = (template, extra = {}) => {
    if (!info?.issuesUrl) return null;
    const params = new URLSearchParams({ template, ...extra });
    return `${info.issuesUrl}/new?${params}`;
  };

  const bugUrl = info && templateUrl('bug_report.yml', {
    version: info.version,
    browser: navigator.userAgent,
  });
  const featureUrl = info && templateUrl('feature_request.yml');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
    } catch {
      return; // Clipboard needs a secure context; the text is on screen anyway.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal open onClose={onClose} title="About">
      {error && <Alert>{error}</Alert>}

      {!info && !error && (
        <div className="flex justify-center py-6 text-muted"><Spinner className="h-6 w-6" /></div>
      )}

      {info && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
              <Icon name="qr" className="h-6 w-6" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">{info.siteName}</p>
              <p className="text-sm text-muted">
                Timely Content <span className="font-mono">{info.version}</span>
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-raised">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-xs text-muted">
{diagnostics}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy details for a bug report'}
            </Button>

            {bugUrl && (
              <a
                href={bugUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg
                  bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-colors
                  hover:bg-accent-hover"
              >
                <Icon name="bug" className="h-4 w-4" />
                Report a bug
              </a>
            )}

            {featureUrl && (
              <a
                href={featureUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg
                  border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink
                  transition-colors hover:bg-raised"
              >
                <Icon name="plus" className="h-4 w-4" />
                Request a feature
              </a>
            )}

            {info.repositoryUrl && (
              <a
                href={info.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg
                  border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink
                  transition-colors hover:bg-raised"
              >
                <Icon name="doc" className="h-4 w-4" />
                View the project on GitHub
              </a>
            )}
          </div>

          <p className="text-center text-xs text-muted">
            The bug link pre-fills the version and browser. Please do not paste
            share links or private content into an issue.
          </p>
        </div>
      )}
    </Modal>
  );
}
