import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Button, Input, Field, Alert, Card, Icon } from '../components/ui.jsx';

export default function LoginPage() {
  const { user, login, siteName } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-sm">
            <Icon name="qr" className="h-7 w-7" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">{siteName}</h1>
            <p className="mt-1 text-sm text-muted">Share content by QR code, on your terms.</p>
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username" htmlFor="username">
              <Input
                id="username"
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Alert>{error}</Alert>

            <Button type="submit" busy={busy} className="w-full">
              {busy ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
