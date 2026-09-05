import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Button, Card, Input, NumberInput, Field, Alert, Icon, Spinner, Modal, Toggle, Badge, cx,
} from '../components/ui.jsx';
import { relativeDate } from '../lib/format.js';
import ThemePicker from '../components/ThemePicker.jsx';

export default function AdminPage() {
  const [tab, setTab] = useState('users');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-ink">Administration</h1>

      <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
        {[
          { id: 'users', label: 'Users', icon: 'users' },
          { id: 'settings', label: 'System', icon: 'settings' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink',
            )}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab /> : <SettingsTab />}
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listUsers();
      setUsers(res.users);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (target) => {
    setError('');
    try {
      const res = await api.setUserRole(target.username, !target.isAdmin);
      setUsers((prev) => prev.map((u) =>
        u.username === target.username ? { ...u, isAdmin: res.user.isAdmin } : u));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{users.length} user{users.length === 1 ? '' : 's'}</p>
        <Button onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" />
          Add user
        </Button>
      </div>

      <Alert>{error}</Alert>

      {loading ? (
        <div className="flex justify-center py-14 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isMe = u.username === me.username;
            return (
              <Card key={u.username} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
                  {u.username.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    <span className="truncate">{u.username}</span>
                    {isMe && <Badge tone="neutral">You</Badge>}
                    {u.isAdmin && (
                      <Badge tone="accent"><Icon name="shield" className="h-3 w-3" />Admin</Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {u.contentCount} item{u.contentCount === 1 ? '' : 's'} &middot; last seen {relativeDate(u.lastLoginAt)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    className="px-3"
                    onClick={() => toggleAdmin(u)}
                    title={u.isAdmin ? 'Revoke administrator' : 'Grant administrator'}
                  >
                    <Icon name="shield" className={cx('h-4 w-4', u.isAdmin && 'text-accent')} />
                  </Button>
                  <Button variant="ghost" className="px-3" onClick={() => setPasswordFor(u)} title="Set password">
                    <Icon name="key" className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 text-danger hover:bg-danger-soft hover:text-danger"
                    onClick={() => setDeleting(u)}
                    disabled={isMe}
                    title={isMe ? 'You cannot delete your own account' : 'Delete user'}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(u) => { setUsers((prev) => [...prev, u]); setCreating(false); }}
      />
      <SetPasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} />
      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(username) => {
          setUsers((prev) => prev.filter((u) => u.username !== username));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setUsername(''); setPassword(''); setIsAdmin(false); setError(''); }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.createUser({ username: username.trim(), password, isAdmin });
      onCreated(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" htmlFor="new-username" hint="Letters, numbers, dot, dash or underscore.">
          <Input
            id="new-username"
            type="text"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Initial password" htmlFor="new-user-password" hint="At least 10 characters.">
          <Input
            id="new-user-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Toggle
          id="new-user-admin"
          checked={isAdmin}
          onChange={setIsAdmin}
          label="Administrator"
          description="Can manage users and system settings."
        />
        <Alert>{error}</Alert>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy}>Create user</Button>
        </div>
      </form>
    </Modal>
  );
}

function SetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { setPassword(''); setError(''); setDone(false); }, [user]);

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.setUserPassword(user.username, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Set password for ${user.username}`}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="accent">
            Password updated. {user.username} has been signed out everywhere and must use the new password.
          </Alert>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" htmlFor="admin-set-password" hint="At least 10 characters.">
            <Input
              id="admin-set-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Alert>{error}</Alert>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" busy={busy}>Set password</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteUser(user.username);
      onDeleted(user.username);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={confirm} busy={busy}>Delete user</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink">
          Delete <span className="font-medium">{user.username}</span>?
        </p>
        <p className="text-sm text-muted">
          Their {user.contentCount} stored item{user.contentCount === 1 ? '' : 's'} will be deleted
          and every QR code they issued will stop working. This cannot be undone.
        </p>
        <Alert>{error}</Alert>
      </div>
    </Modal>
  );
}

function SettingsTab() {
  const { refreshSite } = useAuth();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSettings()
      .then((res) => setSettings(res.settings))
      .catch((err) => setError(err.message));
  }, []);

  if (!settings) {
    return error
      ? <Alert>{error}</Alert>
      : <div className="flex justify-center py-14 text-muted"><Spinner className="h-6 w-6" /></div>;
  }

  const update = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  };

  const save = async (e) => {
    e.preventDefault();

    if (settings.maxUploadMb === null || settings.sessionHours === null) {
      setError('Upload size and session length both need a value.');
      return;
    }

    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const res = await api.saveSettings(settings);
      setSettings(res.settings);
      // The header name and the anonymous-page theme come from these values,
      // so pull the fresh copy straight back into the running app.
      await refreshSite();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-medium text-ink">Site</h2>
          <p className="mt-0.5 text-sm text-muted">
            Shown in the header, on the sign-in screen and in the browser tab.
          </p>
        </div>

        <Field label="Site name" htmlFor="site-name">
          <Input
            id="site-name"
            type="text"
            maxLength={60}
            value={settings.siteName}
            onChange={(e) => update({ siteName: e.target.value })}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-medium text-ink">Default appearance</h2>
          <p className="mt-0.5 text-sm text-muted">
            Used wherever nobody is signed in: the sign-in screen, first-run setup,
            and every page a QR code opens. Signed-in users keep their own choice
            from Settings.
          </p>
        </div>

        <ThemePicker
          idPrefix="site-default"
          value={{ mode: settings.defaultMode, accent: settings.defaultAccent }}
          onChange={(next) => update({ defaultMode: next.mode, defaultAccent: next.accent })}
        />

        <Alert tone="info">
          This preview follows your own theme, not the default you are editing.
          Open a share link in a private window to see it as a recipient does.
        </Alert>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium text-ink">Public address</h2>

        <Field
          label="Public URL"
          htmlFor="public-url"
          hint="The address your reverse proxy publishes. QR codes encode links under this URL."
        >
          <Input
            id="public-url"
            type="url"
            inputMode="url"
            placeholder="https://share.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            value={settings.publicUrl}
            onChange={(e) => update({ publicUrl: e.target.value })}
          />
        </Field>

        <Toggle
          id="enforce-host"
          checked={settings.enforceHost}
          onChange={(v) => update({ enforceHost: v })}
          label="Validate the request hostname"
          description="Refuse requests whose Host header does not match the public URL. Requires a public URL to be set."
        />

        {settings.enforceHost && (
          <Alert tone="info">
            Health checks on <code className="font-mono text-xs">/healthz</code> stay exempt so
            container probes keep working.
          </Alert>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium text-ink">Limits</h2>

        <Field
          label="Maximum upload size (MB)"
          htmlFor="max-upload"
          hint="Between 1 and 2048 MB."
        >
          <NumberInput
            id="max-upload"
            min={1}
            max={2048}
            value={settings.maxUploadMb}
            onChange={(n) => update({ maxUploadMb: n })}
          />
        </Field>

        <Field
          label="Session length (hours)"
          htmlFor="session-hours"
          hint="How long a sign-in lasts before it must be renewed. 1 to 720 hours."
        >
          <NumberInput
            id="session-hours"
            min={1}
            max={720}
            value={settings.sessionHours}
            onChange={(n) => update({ sessionHours: n })}
          />
        </Field>
      </Card>

      <Alert>{error}</Alert>
      {saved && <Alert tone="accent">Settings saved.</Alert>}

      <div className="flex justify-end">
        <Button type="submit" busy={busy}>Save settings</Button>
      </div>
    </form>
  );
}
