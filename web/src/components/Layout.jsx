import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { canInstall, onInstallAvailabilityChange, promptInstall } from '../lib/pwa.js';
import { Icon, cx } from './ui.jsx';

function navClass({ isActive }) {
  return cx(
    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised hover:text-ink',
  );
}

function tabClass({ isActive }) {
  return cx(
    'flex flex-1 flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors',
    isActive ? 'text-accent' : 'text-muted',
  );
}

/** Profile menu: everything that belongs to the person rather than the content. */
function ProfileMenu() {
  const { user, logout, siteName } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [installable, setInstallable] = useState(canInstall);
  const wrapRef = useRef(null);

  // The browser decides when installing is possible; mirror that state so the
  // menu item appears and disappears with it.
  useEffect(() => onInstallAvailabilityChange(setInstallable), []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const itemClass = 'flex w-full items-center gap-3 px-3 py-2.5 text-sm text-ink '
    + 'transition-colors hover:bg-raised text-left';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(
          'flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors',
          open ? 'bg-raised' : 'hover:bg-raised',
        )}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-ink sm:inline">
          {user.username}
        </span>
        <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border
            border-line bg-panel shadow-lg"
        >
          <div className="border-b border-line px-3 py-3">
            <p className="truncate text-sm font-medium text-ink">{user.username}</p>
            <p className="mt-0.5 text-xs text-muted">
              {user.isAdmin ? `Administrator of ${siteName}` : `Signed in to ${siteName}`}
            </p>
          </div>

          <div className="py-1">
            <Link to="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              <Icon name="settings" className="h-4 w-4 text-muted" />
              Settings
            </Link>
            {user.isAdmin && (
              <Link to="/admin" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
                <Icon name="shield" className="h-4 w-4 text-muted" />
                Administration
              </Link>
            )}
            {installable && (
              <button
                role="menuitem"
                className={itemClass}
                onClick={async () => {
                  setOpen(false);
                  await promptInstall();
                }}
              >
                <Icon name="install" className="h-4 w-4 text-muted" />
                Install app
              </button>
            )}
          </div>

          <div className="border-t border-line py-1">
            <button role="menuitem" onClick={signOut} className={itemClass}>
              <Icon name="logout" className="h-4 w-4 text-muted" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, siteName } = useAuth();

  // Content actions live in the main nav; anything personal lives in the
  // profile menu instead.
  const links = [
    { to: '/', icon: 'library', label: 'Library', end: true },
    { to: '/new', icon: 'plus', label: 'Compose' },
    { to: '/upload', icon: 'upload', label: 'Upload' },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
              <Icon name="qr" className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="hidden truncate sm:inline">{siteName}</span>
          </NavLink>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                <Icon name={l.icon} className="h-4 w-4" />
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            {user && <ProfileMenu />}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-5 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile tab bar, kept clear of the iOS home indicator. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={tabClass}>
              <Icon name={l.icon} className="h-5 w-5" />
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
