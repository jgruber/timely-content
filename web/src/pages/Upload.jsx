import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import AccessControls from '../components/AccessControls.jsx';
import SharePanel from '../components/SharePanel.jsx';
import { Button, Card, Input, Field, Alert, Icon, Modal, cx } from '../components/ui.jsx';
import { formatBytes } from '../lib/format.js';

export default function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [limit, setLimit] = useState(1);
  const [deleteOnExhaust, setDeleteOnExhaust] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const pick = (selected) => {
    if (!selected) return;
    setFile(selected);
    if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ''));
    setError('');
  };

  const submit = async () => {
    if (!file) return setError('Choose a file to upload.');
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      return setError('Enter a whole number of uses, or choose unlimited.');
    }

    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title.trim() || file.name);
      form.append('maxAccesses', limit === null ? '' : String(limit));
      form.append('deleteOnExhaust', String(deleteOnExhaust));
      const res = await api.uploadFile(form);
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
        <h1 className="text-xl font-semibold text-ink">Upload a file</h1>
      </div>

      <Card className="p-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
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
          {file ? (
            <div>
              <p className="font-medium text-ink">{file.name}</p>
              <p className="mt-0.5 text-sm text-muted">{formatBytes(file.size)} &middot; tap to change</p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-ink">Choose a file</p>
              <p className="mt-0.5 text-sm text-muted">or drag it here</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        <p className="mt-3 text-sm text-muted">
          Markdown files (<code className="font-mono text-xs">.md</code>) are displayed in the browser
          and stay editable. Everything else downloads directly when the QR code is scanned.
        </p>
      </Card>

      <Card className="space-y-4 p-4">
        <Field label="Title" htmlFor="upload-title" hint="Shown to you in your library, and to the recipient.">
          <Input
            id="upload-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Q3 invoice"
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
          deleteOnExhaust={deleteOnExhaust}
          onDeleteChange={setDeleteOnExhaust}
        />
      </Card>

      <Alert>{error}</Alert>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => navigate('/')} disabled={busy}>Cancel</Button>
        <Button onClick={submit} busy={busy} disabled={!file}>Upload and create QR code</Button>
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
