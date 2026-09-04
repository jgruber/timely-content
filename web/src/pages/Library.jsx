import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Button, Card, Icon, Alert, Spinner, Modal, Input, Field } from '../components/ui.jsx';
import ContentCard from '../components/ContentCard.jsx';
import SharePanel from '../components/SharePanel.jsx';
import AccessControls from '../components/AccessControls.jsx';

export default function LibraryPage() {
  const [items, setItems] = useState([]);
  const [publicUrlConfigured, setPublicUrlConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const [shareItem, setShareItem] = useState(null);
  const [manageItem, setManageItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listContent();
      setItems(res.items);
      setPublicUrlConfigured(res.publicUrlConfigured);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = items.filter((i) =>
    i.title.toLowerCase().includes(query.toLowerCase())
    || (i.filename || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Your content</h1>
          <p className="mt-0.5 text-sm text-muted">
            {items.length} item{items.length === 1 ? '' : 's'} shared by QR code
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/upload"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel
              px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised"
          >
            <Icon name="upload" className="h-4 w-4" />
            Upload
          </Link>
          <Link
            to="/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5
              text-sm font-medium text-accent-ink shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Icon name="plus" className="h-4 w-4" />
            Compose
          </Link>
        </div>
      </div>

      <Alert>{error}</Alert>

      {items.length > 4 && (
        <Input
          type="search"
          placeholder="Search your content"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search your content"
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Icon name="qr" className="h-7 w-7" />
          </span>
          <div>
            <h2 className="font-medium text-ink">
              {items.length === 0 ? 'Nothing shared yet' : 'No matches'}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {items.length === 0
                ? 'Write a note or upload a file, and you will get a QR code that grants access without a password.'
                : 'Try a different search term.'}
            </p>
          </div>
          {items.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to="/new"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5
                  text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
              >
                <Icon name="plus" className="h-4 w-4" />
                Compose a note
              </Link>
              <Link
                to="/upload"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line
                  bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                <Icon name="upload" className="h-4 w-4" />
                Upload a file
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onShare={setShareItem}
              onManage={setManageItem}
              onDelete={setDeleteItem}
            />
          ))}
        </div>
      )}

      <Modal open={!!shareItem} onClose={() => setShareItem(null)} title={shareItem?.title || 'Share'}>
        {shareItem && <SharePanel item={shareItem} warnNoPublicUrl={!publicUrlConfigured} />}
      </Modal>

      <ManageModal
        item={manageItem}
        onClose={() => setManageItem(null)}
        onSaved={(updated) => {
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          setManageItem(null);
          setShareItem(updated);
        }}
      />

      <DeleteModal
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((i) => i.id !== id));
          setDeleteItem(null);
        }}
      />
    </div>
  );
}

function ManageModal({ item, onClose, onSaved }) {
  const [limit, setLimit] = useState(null);
  const [deleteOnExhaust, setDeleteOnExhaust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item) return;
    setLimit(item.maxAccesses);
    setDeleteOnExhaust(item.deleteOnExhaust);
    setError('');
  }, [item]);

  if (!item) return null;

  const save = async (rotate) => {
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setError('Enter a whole number of uses, or choose unlimited.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = { maxAccesses: limit, deleteOnExhaust };
      const res = rotate
        ? await api.rotateToken(item.id, payload)
        : await api.updateContent(item.id, payload);
      onSaved(res.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Manage access"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(true)} busy={busy}>
            <Icon name="refresh" className="h-4 w-4" />
            New QR code
          </Button>
          <Button onClick={() => save(false)} busy={busy}>Save</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-line bg-raised px-3.5 py-3 text-sm text-muted">
          Used <span className="font-medium text-ink">{item.accessCount}</span>
          {item.maxAccesses === null ? ' time(s) so far.' : ` of ${item.maxAccesses} time(s).`}
          {' '}Issuing a new QR code invalidates the old one and resets the counter to zero.
        </div>

        <AccessControls
          idPrefix="manage"
          limit={limit}
          onLimitChange={setLimit}
          deleteOnExhaust={deleteOnExhaust}
          onDeleteChange={setDeleteOnExhaust}
        />

        <Alert>{error}</Alert>
      </div>
    </Modal>
  );
}

function DeleteModal({ item, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!item) return null;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteContent(item.id);
      onDeleted(item.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete content"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={confirm} busy={busy}>Delete permanently</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink">
          Delete <span className="font-medium">{item.title}</span>?
        </p>
        <p className="text-sm text-muted">
          The stored file is removed from the server and its QR code stops working immediately.
          This cannot be undone.
        </p>
        <Alert>{error}</Alert>
      </div>
    </Modal>
  );
}
