import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Button, Input, Field, Alert, Card, Icon } from '../components/ui.jsx';

/**
 * First-run screen. Reachable only while the instance has no users at all;
 * the account it creates is the first administrator.
 */
export default function SetupPage() {
  const { setupRequired, completeSetup, siteName } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!setupRequired) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 10) return setError('Password must be at least 10 characters.');
    if (password !== confirm) return setError('The passwords do not match.');

    setBusy(true);
    try {
      await completeSetup({
        username: username.trim(),
        password,
        publicUrl: publicUrl.trim(),
      });
      // The provider flips setupRequired and stores the session; the router
      // then lands us in the library.
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-sm">
            <Icon name="qr" className="h-7 w-7" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Welcome to {siteName}</h1>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Nobody has signed in here yet. Create the first account — it will be an
              administrator, able to add other users later.
            </p>
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Username"
              htmlFor="setup-username"
              hint="Letters, numbers, dot, dash or underscore."
            >
              <Input
                id="setup-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="setup-password" hint="At least 10 characters.">
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Field label="Confirm password" htmlFor="setup-confirm">
              <Input
                id="setup-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>

            <div className="border-t border-line pt-4">
              <Field
                label="Public URL (optional)"
                htmlFor="setup-public-url"
                hint="The address people reach this server on. QR codes point here. You can set it later under Administration."
              >
                <Input
                  id="setup-public-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://share.example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                />
              </Field>
            </div>

            <Alert>{error}</Alert>

            <Button type="submit" busy={busy} className="w-full">
              {busy ? 'Creating account' : 'Create administrator account'}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-muted">
          This screen disappears once the first account exists.
        </p>
      </div>
    </div>
  );
}
