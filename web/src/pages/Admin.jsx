import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Button, Card, Input, NumberInput, Field, Alert, Icon, Spinner, Modal, Toggle, Badge, cx,
} from '../components/ui.jsx';
import { relativeDate, formatBytes, formatDate } from '../lib/format.js';
import { adminDownloadUrl } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.js';
import ThemePicker from '../components/ThemePicker.jsx';

export default function AdminPage() {
  const [tab, setTab] = useState('users');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-ink">Administration</h1>

      <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
        {[
          { id: 'users', label: 'Users', icon: 'users' },
          { id: 'content', label: 'Content', icon: 'library' },
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

      {tab === 'users' && <UsersTab />}
      {tab === 'content' && <ContentTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function UsersTab() {
  const { user: me, passwordResetEnabled } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
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

  const replace = (updated) =>
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));

  const toggleAdmin = async (target) => {
    setError('');
    try {
      const res = await api.patchUser(target.id, { isAdmin: !target.isAdmin });
      replace(res.user);
    } catch (err) {
      setError(err.message);
    }
  };

  const resend = async (target) => {
    setError(''); setNotice('');
    try {
      const res = await api.resendUserVerification(target.id);
      setNotice(`Confirmation link sent to ${res.to}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const markVerified = async (target) => {
    setError(''); setNotice('');
    try {
      const res = await api.markUserVerified(target.id);
      replace(res.user);
      setNotice(`${res.user.email} marked as confirmed.`);
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
      {notice && <Alert tone="accent">{notice}</Alert>}

      {loading ? (
        <div className="flex justify-center py-14 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isMe = u.id === me.id;
            return (
              <Card key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
                  {(u.displayName || u.email).charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    <span className="truncate">{u.displayName}</span>
                    {isMe && <Badge tone="neutral">You</Badge>}
                    {u.isAdmin && (
                      <Badge tone="accent"><Icon name="shield" className="h-3 w-3" />Admin</Badge>
                    )}
                    {!u.emailVerified && (
                      <Badge tone="danger"><Icon name="lock" className="h-3 w-3" />Unconfirmed</Badge>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted">{u.email || 'no address — cannot sign in'}</p>
                  <p className="text-sm text-muted">
                    {u.contentCount} item{u.contentCount === 1 ? '' : 's'} &middot; last seen {relativeDate(u.lastLoginAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {!u.emailVerified && passwordResetEnabled && (
                    <Button variant="ghost" className="px-3" onClick={() => resend(u)} title="Resend confirmation email">
                      <Icon name="upload" className="h-4 w-4" />
                    </Button>
                  )}
                  {!u.emailVerified && (
                    <Button variant="ghost" className="px-3" onClick={() => markVerified(u)} title="Mark address as confirmed">
                      <Icon name="check" className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" className="px-3" onClick={() => setEmailFor(u)} title="Change address">
                    <Icon name="doc" className="h-4 w-4" />
                  </Button>
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
        onCreated={(u, sent) => {
          setUsers((prev) => [...prev, u]);
          setCreating(false);
          setNotice(sent
            ? `Account created. A confirmation link was sent to ${u.email}.`
            : `Account created for ${u.email}.`);
        }}
      />
      <SetPasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} />
      <SetEmailModal
        user={emailFor}
        onClose={() => setEmailFor(null)}
        onSaved={(u) => { replace(u); setEmailFor(null); }}
      />
      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          setUsers((prev) => prev.filter((u) => u.id !== id));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }) {
  const { passwordResetEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setEmail(''); setDisplayName(''); setPassword(''); setIsAdmin(false); setError('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.createUser({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        isAdmin,
      });
      onCreated({ ...res.user, contentCount: 0 }, res.verificationSent);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email address" htmlFor="new-email" hint="They sign in with this.">
          <Input
            id="new-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Display name (optional)" htmlFor="new-display-name">
          <Input
            id="new-display-name"
            type="text"
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
        {passwordResetEnabled && (
          <Alert tone="info">
            They will get a confirmation email and cannot sign in until they follow it.
          </Alert>
        )}
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
      await api.setUserPassword(user.id, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Set password for ${user.email}`}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="accent">
            Password updated. {user.email} has been signed out everywhere and must use the new password.
          </Alert>
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
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

function SetEmailModal({ user, onClose, onSaved }) {
  const { passwordResetEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setEmail(user?.email || ''); setError(''); }, [user]);

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.setUserEmail(user.id, email.trim());
      onSaved(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Change address for ${user.displayName}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email address" htmlFor="admin-set-email" hint="This is the address they sign in with.">
          <Input
            id="admin-set-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {passwordResetEnabled && (
          <Alert tone="info">
            Changing the address marks it unconfirmed and signs them out. A new
            confirmation link is sent automatically.
          </Alert>
        )}
        <Alert>{error}</Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy}>Save address</Button>
        </div>
      </form>
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
      await api.deleteUser(user.id);
      onDeleted(user.id);
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
          Delete <span className="font-medium">{user.email}</span>?
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

/**
 * A setting the environment supplies is shown but locked: saving it would look
 * like it worked until the next restart put the environment's value back.
 */
function EnvLock({ envVar }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-xs font-medium text-muted">
      <Icon name="lock" className="h-3 w-3" />
      Set by {envVar}
    </span>
  );
}

function SettingsTab() {
  const { refreshSite } = useAuth();
  const [settings, setSettings] = useState(null);
  const [envManaged, setEnvManaged] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [smtpPass, setSmtpPass] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testError, setTestError] = useState('');

  useEffect(() => {
    api.getSettings()
      .then((res) => { setSettings(res.settings); setEnvManaged(res.envManaged || []); })
      .catch((err) => setError(err.message));
  }, []);

  if (!settings) {
    return error
      ? <Alert>{error}</Alert>
      : <div className="flex justify-center py-14 text-muted"><Spinner className="h-6 w-6" /></div>;
  }

  const isEnv = (key) => envManaged.includes(key);
  const update = (patch) => { setSettings((s) => ({ ...s, ...patch })); setSaved(false); };
  const updateSmtp = (patch) => {
    setSettings((s) => ({ ...s, smtp: { ...s.smtp, ...patch } }));
    setSaved(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (settings.maxUploadMb === null || settings.sessionHours === null
        || settings.resetTokenMinutes === null || settings.smtp.port === null) {
      setError('Every numeric setting needs a value.');
      return;
    }

    setBusy(true); setError(''); setSaved(false);
    try {
      // An untouched password field means "leave it alone", not "clear it".
      const payload = { ...settings, smtp: { ...settings.smtp, pass: smtpPass || '__set__' } };
      const res = await api.saveSettings(payload);
      setSettings(res.settings);
      setEnvManaged(res.envManaged || []);
      setSmtpPass('');
      await refreshSite();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTestBusy(true); setTestError(''); setTestResult('');
    try {
      const res = await api.sendTestEmail(testTo.trim());
      setTestResult(res.delivered
        ? `Sent to ${res.to}.`
        : `SMTP is not configured, so the message was written to the server log instead.`);
    } catch (err) {
      setTestError(err.message);
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-ink">Site</h2>
          {isEnv('siteName') && <EnvLock envVar="SITE_NAME" />}
        </div>
        <Field label="Site name" htmlFor="site-name">
          <Input
            id="site-name"
            type="text"
            maxLength={60}
            disabled={isEnv('siteName')}
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
            and every page a QR code opens.
          </p>
        </div>
        <ThemePicker
          idPrefix="site-default"
          value={{ mode: settings.defaultMode, accent: settings.defaultAccent }}
          onChange={(next) => update({ defaultMode: next.mode, defaultAccent: next.accent })}
        />
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-ink">Public address</h2>
          {isEnv('publicUrl') && <EnvLock envVar="PUBLIC_URL" />}
        </div>

        <Field
          label="Public URL"
          htmlFor="public-url"
          hint="QR codes and password-reset links are built from this."
        >
          <Input
            id="public-url"
            type="url"
            inputMode="url"
            placeholder="https://share.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            disabled={isEnv('publicUrl')}
            value={settings.publicUrl}
            onChange={(e) => update({ publicUrl: e.target.value })}
          />
        </Field>

        <Toggle
          id="enforce-host"
          checked={settings.enforceHost}
          onChange={(v) => !isEnv('enforceHost') && update({ enforceHost: v })}
          label="Validate the request hostname"
          description="Refuse requests whose Host header does not match the public URL."
        />
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-ink">Email</h2>
          {isEnv('passwordResetEnabled') && <EnvLock envVar="PASSWORD_RESET_ENABLED" />}
        </div>

        <Toggle
          id="reset-enabled"
          checked={settings.passwordResetEnabled}
          onChange={(v) => !isEnv('passwordResetEnabled') && update({ passwordResetEnabled: v })}
          label="Password reset by email"
          description="Also required for confirming new accounts. Turning this off hides the
            forgot-password link and lets new users sign in without confirming."
        />

        {settings.passwordResetEnabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SMTP host" htmlFor="smtp-host">
                <Input
                  id="smtp-host"
                  type="text"
                  placeholder="smtp.example.com"
                  autoCapitalize="none"
                  spellCheck="false"
                  disabled={isEnv('smtp.host')}
                  value={settings.smtp.host}
                  onChange={(e) => updateSmtp({ host: e.target.value })}
                />
                {isEnv('smtp.host') && <div className="pt-1"><EnvLock envVar="SMTP_HOST" /></div>}
              </Field>

              <Field label="Port" htmlFor="smtp-port" hint="587 for STARTTLS, 465 for TLS.">
                <NumberInput
                  id="smtp-port"
                  min={1}
                  max={65535}
                  disabled={isEnv('smtp.port')}
                  value={settings.smtp.port}
                  onChange={(n) => updateSmtp({ port: n })}
                />
              </Field>
            </div>

            <Toggle
              id="smtp-secure"
              checked={settings.smtp.secure}
              onChange={(v) => !isEnv('smtp.secure') && updateSmtp({ secure: v })}
              label="Implicit TLS"
              description="On for port 465. Leave off for 587, which upgrades with STARTTLS."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor="smtp-user" hint="Leave empty if the relay needs no login.">
                <Input
                  id="smtp-user"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  disabled={isEnv('smtp.user')}
                  value={settings.smtp.user}
                  onChange={(e) => updateSmtp({ user: e.target.value })}
                />
              </Field>

              <Field
                label="Password"
                htmlFor="smtp-pass"
                hint={isEnv('smtp.pass')
                  ? 'Supplied by SMTP_PASS.'
                  : (settings.smtp.pass === '__set__'
                    ? 'A password is stored. Type to replace it.'
                    : 'No password stored.')}
              >
                <Input
                  id="smtp-pass"
                  type="password"
                  autoComplete="new-password"
                  placeholder={settings.smtp.pass === '__set__' ? '••••••••' : ''}
                  disabled={isEnv('smtp.pass')}
                  value={smtpPass}
                  onChange={(e) => { setSmtpPass(e.target.value); setSaved(false); }}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From address" htmlFor="smtp-from">
                <Input
                  id="smtp-from"
                  type="email"
                  inputMode="email"
                  placeholder="no-reply@example.com"
                  autoCapitalize="none"
                  spellCheck="false"
                  disabled={isEnv('smtp.from')}
                  value={settings.smtp.from}
                  onChange={(e) => updateSmtp({ from: e.target.value })}
                />
                {isEnv('smtp.from') && <div className="pt-1"><EnvLock envVar="SMTP_FROM" /></div>}
              </Field>

              <Field label="From name" htmlFor="smtp-from-name">
                <Input
                  id="smtp-from-name"
                  type="text"
                  maxLength={60}
                  disabled={isEnv('smtp.fromName')}
                  value={settings.smtp.fromName}
                  onChange={(e) => updateSmtp({ fromName: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Reset link lifetime (minutes)"
              htmlFor="reset-minutes"
              hint="Between 5 and 1440. Confirmation links always last a week."
            >
              <NumberInput
                id="reset-minutes"
                min={5}
                max={1440}
                disabled={isEnv('resetTokenMinutes')}
                value={settings.resetTokenMinutes}
                onChange={(n) => update({ resetTokenMinutes: n })}
              />
            </Field>

            <div className="rounded-lg border border-line bg-raised p-3.5">
              <p className="text-sm font-medium text-ink">Send a test message</p>
              <p className="mt-0.5 text-sm text-muted">
                Save first — the test uses the stored settings.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="Defaults to your own address"
                  autoCapitalize="none"
                  spellCheck="false"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <Button type="button" variant="secondary" busy={testBusy} onClick={sendTest} className="shrink-0">
                  Send test
                </Button>
              </div>
              {testResult && <div className="mt-3"><Alert tone="accent">{testResult}</Alert></div>}
              {testError && <div className="mt-3"><Alert>{testError}</Alert></div>}
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium text-ink">Limits</h2>

        <Field label="Maximum upload size (MB)" htmlFor="max-upload" hint="Between 1 and 2048 MB.">
          <NumberInput
            id="max-upload"
            min={1}
            max={2048}
            disabled={isEnv('maxUploadMb')}
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
            disabled={isEnv('sessionHours')}
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

/**
 * Everything stored on the instance, whoever owns it.
 *
 * This is the only screen that reads across accounts. It exists so an
 * administrator can answer "what is being shared from my server" and take
 * something down, so it deliberately shows the owner alongside every item.
 */
function ContentTab() {
  const [items, setItems] = useState([]);
  const [publicUrlConfigured, setPublicUrlConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listAllContent();
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

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? items.filter((i) =>
      i.title.toLowerCase().includes(needle)
      || (i.filename || '').toLowerCase().includes(needle)
      || (i.owner.email || '').toLowerCase().includes(needle)
      || (i.owner.displayName || '').toLowerCase().includes(needle))
    : items;

  const totalBytes = items.reduce((sum, i) => sum + (i.size || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {items.length} item{items.length === 1 ? '' : 's'} across all accounts
          {items.length > 0 && ` · ${formatBytes(totalBytes)}`}
        </p>
      </div>

      <Alert>{error}</Alert>
      {notice && <Alert tone="accent">{notice}</Alert>}
      {!publicUrlConfigured && (
        <Alert tone="info">
          No public URL is configured, so share links below use the address you are
          browsing from.
        </Alert>
      )}

      {items.length > 4 && (
        <Input
          type="search"
          placeholder="Search by title, filename or owner"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search all content"
        />
      )}

      {loading ? (
        <div className="flex justify-center py-14 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : visible.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="font-medium text-ink">
            {items.length === 0 ? 'Nothing is shared yet' : 'No matches'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {items.length === 0
              ? 'Content posted by any account will appear here.'
              : 'Try a different search term.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <Card key={item.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="mt-0.5 shrink-0 rounded-lg bg-accent-soft p-2 text-accent">
                <Icon name={item.kind === 'markdown' ? 'doc' : 'file'} className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  <span className="truncate">{item.title}</span>
                  {item.maxAccesses === null ? (
                    <Badge tone="accent"><Icon name="infinity" className="h-3.5 w-3.5" />Unlimited</Badge>
                  ) : item.exhausted ? (
                    <Badge tone="danger">Limit reached</Badge>
                  ) : (
                    <Badge tone="neutral">{item.remaining} of {item.maxAccesses} left</Badge>
                  )}
                  {item.deleteOnExhaust && item.maxAccesses !== null && (
                    <Badge tone="danger"><Icon name="trash" className="h-3.5 w-3.5" />Self-destructs</Badge>
                  )}
                </p>
                <p className="truncate text-sm text-muted">
                  {item.owner.displayName}
                  {item.owner.email && <span className="text-muted"> &middot; {item.owner.email}</span>}
                </p>
                <p className="text-sm text-muted">
                  {item.kind === 'markdown' ? 'Markdown' : (item.filename || 'File')}
                  {' '}&middot; {formatBytes(item.size)}
                  {' '}&middot; created {formatDate(item.createdAt)}
                  {' '}&middot; opened {relativeDate(item.lastAccessAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" className="px-3" onClick={() => setViewing(item)} title="Inspect">
                  <Icon name="eye" className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="px-3 text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setDeleting(item)}
                  title="Remove this content"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <InspectModal item={viewing} onClose={() => setViewing(null)} />
      <RemoveContentModal
        item={deleting}
        onClose={() => setDeleting(null)}
        onRemoved={(id, title) => {
          setItems((prev) => prev.filter((i) => i.id !== id));
          setDeleting(null);
          setNotice(`Removed "${title}". Its share link no longer works.`);
        }}
      />
    </div>
  );
}

function InspectModal({ item, onClose }) {
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    if (!item) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    api.getAnyContent(item.id)
      .then((res) => { if (!cancelled) setState({ status: 'ok', ...res }); })
      .catch((err) => { if (!cancelled) setState({ status: 'error', message: err.message }); });
    return () => { cancelled = true; };
  }, [item]);

  if (!item) return null;

  return (
    <Modal open onClose={onClose} title={item.title} wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-raised px-3.5 py-3 text-sm text-muted">
          Posted by <span className="font-medium text-ink">{item.owner.displayName}</span>
          {item.owner.email && ` (${item.owner.email})`}.
          {' '}Viewing here does not spend one of the QR code&apos;s accesses.
        </div>

        {state.status === 'loading' && (
          <div className="flex justify-center py-8 text-muted"><Spinner className="h-6 w-6" /></div>
        )}
        {state.status === 'error' && <Alert>{state.message}</Alert>}

        {state.status === 'ok' && (
          state.body !== undefined ? (
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line bg-panel px-4 py-3">
              <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(state.body) }} />
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-panel px-4 py-6 text-center">
              <p className="text-sm text-muted">
                {item.filename} &middot; {formatBytes(item.size)}
              </p>
              <a
                href={adminDownloadUrl(item.id)}
                download
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line
                  bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                <Icon name="download" className="h-4 w-4" />
                Download a copy
              </a>
            </div>
          )
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Share link</p>
          <input
            type="url"
            readOnly
            value={item.shareUrl}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 font-mono text-xs text-muted"
          />
        </div>
      </div>
    </Modal>
  );
}

function RemoveContentModal({ item, onClose, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!item) return null;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteAnyContent(item.id);
      onRemoved(item.id, item.title);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Remove content"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={confirm} busy={busy}>Remove permanently</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink">
          Remove <span className="font-medium">{item.title}</span>, posted by{' '}
          <span className="font-medium">{item.owner.displayName}</span>?
        </p>
        <p className="text-sm text-muted">
          The stored file is deleted from the server and its QR code stops working
          immediately. The owner is not notified. This cannot be undone.
        </p>
        <Alert>{error}</Alert>
      </div>
    </Modal>
  );
}
