import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import AccessControls from '../components/AccessControls.jsx';
import SharePanel from '../components/SharePanel.jsx';
import { Button, Card, Input, Field, Alert, Icon, Spinner, Modal } from '../components/ui.jsx';

export default function ComposePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [limit, setLimit] = useState(1);
  const [deleteOnExhaust, setDeleteOnExhaust] = useState(false);

  const [ready, setReady] = useState(!editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    api.getContent(id)
      .then((res) => {
        if (cancelled) return;
        setTitle(res.item.title);
        setBody(res.body || '');
        setLimit(res.item.maxAccesses);
        setDeleteOnExhaust(res.item.deleteOnExhaust);
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) { setError(err.message); setReady(true); }
      });
    return () => { cancelled = true; };
  }, [id, editing]);

  const save = async () => {
    if (!title.trim()) return setError('Give your note a title.');
    if (!body.trim()) return setError('The note is empty.');
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      return setError('Enter a whole number of uses, or choose unlimited.');
    }

    setBusy(true);
    setError('');
    try {
      const payload = { title: title.trim(), body, maxAccesses: limit, deleteOnExhaust };
      if (editing) {
        await api.updateContent(id, payload);
        navigate('/');
      } else {
        const res = await api.createMarkdown(payload);
        setCreated(res.item);
      }
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
        <h1 className="text-xl font-semibold text-ink">{editing ? 'Edit note' : 'Compose a note'}</h1>
      </div>

      {!ready ? (
        <div className="flex justify-center py-16 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : (
        <>
          <Card className="space-y-4 p-4">
            <Field label="Title" htmlFor="title">
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Release notes for v2.1"
                maxLength={200}
              />
            </Field>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Content</p>
              <MarkdownEditor initialValue={body} onChange={setBody} />
              <p className="mt-1.5 text-sm text-muted">
                Switch between rich text and raw markdown using the tabs at the bottom of the editor.
              </p>
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <h2 className="font-medium text-ink">QR code access</h2>
            <AccessControls
              idPrefix="compose"
              limit={limit}
              onLimitChange={setLimit}
              deleteOnExhaust={deleteOnExhaust}
              onDeleteChange={setDeleteOnExhaust}
            />
          </Card>

          <Alert>{error}</Alert>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/')} disabled={busy}>Cancel</Button>
            <Button onClick={save} busy={busy}>
              {editing ? 'Save changes' : 'Publish and create QR code'}
            </Button>
          </div>
        </>
      )}

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
