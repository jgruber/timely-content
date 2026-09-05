import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import ThemePicker from '../components/ThemePicker.jsx';
import { Button, Card, Input, Field, Alert, Icon, cx } from '../components/ui.jsx';
import { formatDate } from '../lib/format.js';

const TABS = [
  { id: 'account', label: 'Account', icon: 'users' },
  { id: 'appearance', label: 'Appearance', icon: 'eye' },
  { id: 'password', label: 'Password', icon: 'key' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('account');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-lg font-semibold text-accent-ink">
          {(user.displayName || user.email).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
            {user.displayName}
            {user.isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                <Icon name="shield" className="h-3 w-3" />
                Administrator
              </span>
            )}
          </p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <p className="text-sm text-muted">Member since {formatDate(user.createdAt)}</p>
        </div>
        {user.isAdmin && (
          <Link
            to="/admin"
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-line
              bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised"
          >
            <Icon name="shield" className="h-4 w-4" />
            Administration
          </Link>
        )}
      </Card>

      <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
        {TABS.map((t) => (
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

      {tab === 'account' && <AccountTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'password' && <PasswordTab />}
    </div>
  );
}

function AccountTab() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameDone, setNameDone] = useState(false);
  const [nameError, setNameError] = useState('');

  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailNotice, setEmailNotice] = useState('');

  const saveName = async (e) => {
    e.preventDefault();
    setNameError(''); setNameDone(false); setNameBusy(true);
    try {
      const res = await api.saveProfile(displayName.trim());
      setUser((u) => ({ ...u, displayName: res.user.displayName }));
      setNameDone(true);
    } catch (err) {
      setNameError(err.message);
    } finally {
      setNameBusy(false);
    }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    setEmailError(''); setEmailNotice(''); setEmailBusy(true);
    try {
      const res = await api.changeEmail(password, email.trim());
      setPassword('');
      if (res.unchanged) {
        setEmailNotice('That is already your address.');
      } else if (res.verificationSent) {
        // The server signs the session out until the new address is confirmed.
        setEmailNotice('Check your new inbox for a confirmation link. '
          + 'You have been signed out until the address is confirmed.');
        setTimeout(() => { window.location.href = '/login'; }, 4000);
      } else {
        setUser((u) => ({ ...u, email: res.user.email }));
        setEmailNotice('Address updated.');
      }
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-medium text-ink">Display name</h2>
        <p className="mb-4 mt-0.5 text-sm text-muted">Cosmetic only. It is not used to sign in.</p>
        <form onSubmit={saveName} className="space-y-4">
          <Field label="Display name" htmlFor="display-name">
            <Input
              id="display-name"
              type="text"
              maxLength={60}
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Alert>{nameError}</Alert>
          {nameDone && <Alert tone="accent">Display name updated.</Alert>}
          <Button type="submit" busy={nameBusy}>Save name</Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-medium text-ink">Email address</h2>
        <p className="mb-4 mt-0.5 text-sm text-muted">
          This is what you sign in with, and where password resets are sent. Changing it
          needs your password, and the new address has to be confirmed before you can
          sign in again.
        </p>
        <form onSubmit={saveEmail} className="space-y-4">
          <Field label="Email address" htmlFor="account-email">
            <Input
              id="account-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Confirm with your password" htmlFor="account-email-password">
            <Input
              id="account-email-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Alert>{emailError}</Alert>
          {emailNotice && <Alert tone="accent">{emailNotice}</Alert>}
          <Button type="submit" busy={emailBusy}>Change address</Button>
        </form>
      </Card>
    </div>
  );
}

function AppearanceTab() {
  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-medium text-ink">Your appearance</h2>
        <p className="mt-0.5 text-sm text-muted">
          Applies to you on every device you sign in from. It does not change what
          people see on your shared QR pages — an administrator sets that.
        </p>
      </div>
      <ThemePicker />
    </Card>
  );
}

function PasswordTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setDone(false);

    if (next.length < 10) return setError('New password must be at least 10 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');

    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="font-medium text-ink">Change password</h2>
      <p className="mb-4 mt-0.5 text-sm text-muted">
        You need your current password to set a new one.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password" htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="new-password" hint="At least 10 characters.">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <Alert>{error}</Alert>
        {done && (
          <Alert tone="accent">
            Password updated. Any other devices signed in as you have been signed out.
          </Alert>
        )}

        <Button type="submit" busy={busy}>
          <Icon name="key" className="h-4 w-4" />
          Update password
        </Button>
      </form>
    </Card>
  );
}
