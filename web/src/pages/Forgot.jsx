import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import AuthShell from '../components/AuthShell.jsx';
import { Button, Input, Field, Alert } from '../components/ui.jsx';

export default function ForgotPage() {
  const { user, passwordResetEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;
  if (!passwordResetEnabled) return <Navigate to="/login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If an account uses that address, a link to choose a new password is on its way."
        icon="key"
      >
        <p className="text-sm text-muted">
          The link works once and expires shortly. If nothing arrives, check your spam
          folder, or ask an administrator to confirm the address on your account.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the address you sign in with and we will email you a link."
      icon="key"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email address" htmlFor="forgot-email">
          <Input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" busy={busy} className="w-full">
          {busy ? 'Sending' : 'Email me a link'}
        </Button>
      </form>
    </AuthShell>
  );
}
