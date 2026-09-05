import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import AuthShell from '../components/AuthShell.jsx';
import { Button, Alert, Spinner } from '../components/ui.jsx';

/**
 * Confirm an email address.
 *
 * The token is only spent when the person presses the button. Mail clients and
 * link scanners routinely fetch every URL in a message, and confirming on load
 * would let them burn the link before it was ever opened.
 */
export default function VerifyPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ status: 'checking' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checked = useRef(null);

  useEffect(() => {
    if (checked.current === token) return;
    checked.current = token;
    api.checkVerifyToken(token)
      .then((res) => setState({ status: 'ready', email: res.email }))
      .catch((err) => setState({ status: 'dead', message: err.message }));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.confirmEmail(token);
      setState({ status: 'done', email: res.email });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'checking') {
    return (
      <AuthShell title="Checking your link" icon="check">
        <div className="flex justify-center py-4 text-muted"><Spinner className="h-6 w-6" /></div>
      </AuthShell>
    );
  }

  if (state.status === 'dead') {
    return (
      <AuthShell title="Link no longer works" subtitle={state.message} icon="lock">
        <p className="text-sm text-muted">
          Confirmation links can be used once. Try signing in — if the address still
          needs confirming, you can send yourself a fresh link from there.
        </p>
      </AuthShell>
    );
  }

  if (state.status === 'done') {
    return (
      <AuthShell title="Address confirmed" subtitle={state.email} icon="check">
        <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
          Go to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirm your address"
      subtitle={state.email}
      icon="check"
      footer={<Link to="/login" className="text-accent underline underline-offset-2">Back to sign in</Link>}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Confirming activates the account so you can sign in.
        </p>
        <Alert>{error}</Alert>
        <Button className="w-full" busy={busy} onClick={confirm}>
          {busy ? 'Confirming' : 'Confirm my address'}
        </Button>
      </div>
    </AuthShell>
  );
}
