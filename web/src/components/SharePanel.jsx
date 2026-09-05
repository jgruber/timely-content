import { useState } from 'react';
import { qrImageUrl } from '../lib/api.js';
import { Button, Icon, Alert, cx } from './ui.jsx';

/** QR preview plus the copy/download actions used to share a link by email. */
export default function SharePanel({ item, warnNoPublicUrl }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(item.shareUrl);
    } catch {
      // Clipboard API needs a secure context; fall back to a manual select.
      const input = document.getElementById(`share-url-${item.id}`);
      input?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      {warnNoPublicUrl && (
        <Alert tone="info">
          No public URL is configured, so this link uses the address you are browsing from.
          An administrator can set the public URL in Settings.
        </Alert>
      )}

      <div className="flex justify-center">
        <div className="rounded-2xl border border-line bg-white p-3">
          {/* White plate: QR codes need light quiet-zone contrast in both themes. */}
          <img
            src={qrImageUrl(item.id, 512)}
            alt={`QR code linking to ${item.title}`}
            width={220}
            height={220}
            className="h-[220px] w-[220px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`share-url-${item.id}`} className="block text-sm font-medium text-ink">
          Share link
        </label>
        <div className="flex gap-2">
          <input
            id={`share-url-${item.id}`}
            type="url"
            readOnly
            value={item.shareUrl}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2.5 font-mono text-xs text-muted"
          />
          <Button variant="secondary" onClick={copyLink} className="shrink-0 px-3" aria-label="Copy share link">
            <Icon name={copied ? 'check' : 'copy'} className={cx('h-4 w-4', copied && 'text-accent')} />
          </Button>
        </div>
      </div>

      <a
        href={qrImageUrl(item.id, 800)}
        download
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border
          border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised"
      >
        <Icon name="download" className="h-4 w-4" />
        Download QR code (PNG)
      </a>

      <p className="text-center text-xs text-muted">
        Attach the PNG to an email, or paste the link. Anyone who opens it gets access without signing in.
      </p>
    </div>
  );
}
