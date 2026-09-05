import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import AuthShell from '../components/AuthShell.jsx';
import { Button, Input, Field, Alert, Spinner } from '../components/ui.jsx';

export default function ResetPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Validate before showing the form, so a dead link says so immediately
  // rather than after someone has typed a new password twice.
  useEffect(() => {
    let cancelled = false;
    api.checkResetToken(token)
      .then((res) => { if (!cancelled) setState({ status: 'ok', email: res.email }); })
      .catch((err) => { if (!cancelled) setState({ status: 'dead', message: err.message }); });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 10) return setError('Password must be at least 10 characters.');
    if (password !== confirm) return setError('The passwords do not match.');

    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setState({ status: 'done' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'checking') {
    return (
      <AuthShell title="Checking your link" icon="key">
        <div className="flex justify-center py-4 text-muted"><Spinner className="h-6 w-6" /></div>
      </AuthShell>
    );
  }

  if (state.status === 'dead') {
    return (
      <AuthShell title="Link no longer works" subtitle={state.message} icon="lock"
        footer={<Link to="/forgot" className="text-accent underline underline-offset-2">Request a new link</Link>}>
        <p className="text-sm text-muted">
          Reset links can be used once and expire quickly. Requesting a new one takes a moment.
        </p>
      </AuthShell>
    );
  }

  if (state.status === 'done') {
    return (
      <AuthShell title="Password updated" icon="check"
        subtitle="You can sign in with your new password now.">
        <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle={`For ${state.email}`} icon="key">
      <form onSubmit={submit} className="space-y-4">
        {/* Hidden so password managers attach the new password to the right account. */}
        <input type="email" value={state.email} autoComplete="username" readOnly hidden />

        <Field label="New password" htmlFor="reset-password" hint="At least 10 characters.">
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-confirm">
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" busy={busy} className="w-full">
          {busy ? 'Saving' : 'Set new password'}
        </Button>
      </form>
    </AuthShell>
  );
}
