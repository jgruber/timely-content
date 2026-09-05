import { useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Button, Input, Field, Alert, Card, Icon } from '../components/ui.jsx';

export default function LoginPage() {
  const { user, login, siteName, passwordResetEnabled } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Set when the password was right but the address has not been confirmed --
  // the one case where offering to resend the link is useful and safe.
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setResent(false);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setUnverified(err.payload?.reason === 'unverified');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await api.resendVerification(email.trim());
      setResent(true);
    } catch {
      setResent(true); // Never reveal whether the address is registered.
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
            <Field label="Email address" htmlFor="email">
              <Input
                id="email"
                name="email"
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

            {unverified && !resent && (
              <Alert tone="info">
                <span className="block">Not received the confirmation email?</span>
                <button
                  type="button"
                  onClick={resend}
                  className="mt-1 font-medium text-accent underline underline-offset-2"
                >
                  Send it again
                </button>
              </Alert>
            )}
            {resent && (
              <Alert tone="accent">
                If that address needs confirming, a new link is on its way.
              </Alert>
            )}

            <Button type="submit" busy={busy} className="w-full">
              {busy ? 'Signing in' : 'Sign in'}
            </Button>

            {passwordResetEnabled && (
              <p className="pt-1 text-center text-sm">
                <Link to="/forgot" className="text-accent underline underline-offset-2">
                  Forgot your password?
                </Link>
              </p>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
