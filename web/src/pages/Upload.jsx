import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { makeThumbnail, previewUrl } from '../lib/thumbnails.js';
import AccessControls from '../components/AccessControls.jsx';
import SharePanel from '../components/SharePanel.jsx';
import { Button, Card, Input, Field, Alert, Icon, Modal, cx } from '../components/ui.jsx';
import { formatBytes } from '../lib/format.js';

/**
 * Upload one or many files as a single share.
 *
 * Picking twenty photos on a phone and handing them over with one QR code is
 * the point, so the whole selection becomes one share with one access count,
 * not twenty separate ones.
 */
export default function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState('');
  const [limit, setLimit] = useState(1);
  const [expiresAt, setExpiresAt] = useState(null);
  const [deleteWhenFinished, setDeleteWhenFinished] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  // Object URLs are a leak if they outlive the picker.
  useEffect(() => () => {
    picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
  }, [picked]);

  const add = useCallback((incoming) => {
    const list = [...incoming].filter(Boolean);
    if (!list.length) return;
    setError('');
    setPicked((prev) => {
      // Same name and size twice over is a re-pick, not a second copy.
      const seen = new Set(prev.map((p) => `${p.file.name}:${p.file.size}`));
      const added = list
        .filter((f) => !seen.has(`${f.name}:${f.size}`))
        .map((f) => ({ file: f, preview: previewUrl(f) }));
      const next = [...prev, ...added];
      if (!title.trim() && next.length) {
        setTitle(next.length === 1
          ? next[0].file.name.replace(/\.[^.]+$/, '')
          : `${next.length} files`);
      }
      return next;
    });
  }, [title]);

  const remove = (index) => setPicked((prev) => {
    const gone = prev[index];
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    return prev.filter((_, i) => i !== index);
  });

  const totalBytes = picked.reduce((sum, p) => sum + p.file.size, 0);

  const submit = async () => {
    if (!picked.length) return setError('Choose at least one file.');
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      return setError('Enter a whole number of uses, or choose unlimited.');
    }
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      return setError('The expiry time has already passed.');
    }

    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const form = new FormData();
      const thumbFor = [];

      for (let i = 0; i < picked.length; i += 1) {
        form.append('files', picked[i].file);
      }
      // Previews are made here rather than on the server: the browser has
      // already decoded these images, and it keeps a native image library out
      // of the deployment entirely.
      for (let i = 0; i < picked.length; i += 1) {
        const thumb = await makeThumbnail(picked[i].file);
        if (!thumb) continue;
        form.append('thumbs', thumb.blob, `thumb-${i}.jpg`);
        thumbFor.push(i);
      }
      form.append('thumbFor', JSON.stringify(thumbFor));

      form.append('title', title.trim() || `${picked.length} files`);
      form.append('maxAccesses', limit === null ? '' : String(limit));
      form.append('expiresAt', expiresAt || '');
      form.append('deleteWhenFinished', String(deleteWhenFinished));

      const res = await api.uploadFiles(form, setProgress);
      setCreated(res.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/" className="rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-ink" aria-label="Back to library">
          <Icon name="back" />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Upload files</h1>
      </div>

      <Card className="p-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          className={cx(
            'flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent hover:bg-raised',
          )}
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon name="upload" className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-ink">
              {picked.length ? 'Add more files' : 'Choose files'}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              Pick as many as you like — they share one QR code
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { add(e.target.files); e.target.value = ''; }}
          />
        </div>

        {picked.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-ink">
                {picked.length} file{picked.length === 1 ? '' : 's'} &middot; {formatBytes(totalBytes)}
              </span>
              <button
                type="button"
                onClick={() => setPicked([])}
                className="text-muted underline underline-offset-2 hover:text-ink"
                disabled={busy}
              >
                Clear all
              </button>
            </div>

            <ul className="divide-y divide-line rounded-lg border border-line">
              {picked.map((p, i) => (
                <li key={`${p.file.name}-${p.file.size}-${i}`} className="flex items-center gap-3 p-2.5">
                  {p.preview ? (
                    <img
                      src={p.preview}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-raised text-muted">
                      <Icon name="file" className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{p.file.name}</p>
                    <p className="text-xs text-muted">{formatBytes(p.file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={busy}
                    aria-label={`Remove ${p.file.name}`}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-sm text-muted">
          A single markdown file (<code className="font-mono text-xs">.md</code>) stays readable
          and editable. Everything else is offered to the recipient file by file, or as one
          zip.
        </p>
      </Card>

      <Card className="space-y-4 p-4">
        <Field label="Title" htmlFor="upload-title" hint="Shown in your library, and to the recipient.">
          <Input
            id="upload-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Holiday photos"
            maxLength={200}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium text-ink">QR code access</h2>
        <AccessControls
          idPrefix="upload"
          limit={limit}
          onLimitChange={setLimit}
          expiresAt={expiresAt}
          onExpiryChange={setExpiresAt}
          deleteWhenFinished={deleteWhenFinished}
          onDeleteChange={setDeleteWhenFinished}
        />
      </Card>

      <Alert>{error}</Alert>

      {busy && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Uploading</span>
            <span className="text-muted">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.max(2, progress * 100)}%` }}
            />
          </div>
        </Card>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => navigate('/')} disabled={busy}>Cancel</Button>
        <Button onClick={submit} busy={busy} disabled={!picked.length}>
          {picked.length > 1 ? `Upload ${picked.length} files` : 'Upload and create QR code'}
        </Button>
      </div>

      <Modal
        open={!!created}
        onClose={() => navigate('/')}
        title="Ready to share"
        footer={<Button onClick={() => navigate('/')}>Done</Button>}
      >
        {created && <SharePanel item={created} />}
      </Modal>
    </div>
  );
}
