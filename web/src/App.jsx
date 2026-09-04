import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import LoginPage from './pages/Login.jsx';
import SetupPage from './pages/Setup.jsx';
import LibraryPage from './pages/Library.jsx';
import UploadPage from './pages/Upload.jsx';
import SettingsPage from './pages/Settings.jsx';
import SharePage from './pages/Share.jsx';
import NotFoundPage from './pages/NotFound.jsx';

// The markdown editor pulls in ProseMirror, which is by far the heaviest
// dependency here. Keeping it out of the initial bundle matters most for
// people opening a share link on mobile data -- they never touch the editor.
const ComposePage = lazy(() => import('./pages/Compose.jsx'));
const AdminPage = lazy(() => import('./pages/Admin.jsx'));

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function Lazy({ children }) {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-muted"><Spinner className="h-6 w-6" /></div>}>
      {children}
    </Suspense>
  );
}

function RequireAuth({ children, adminOnly }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { loading, setupRequired } = useAuth();

  if (loading) return <FullPageSpinner />;

  // Until the first account exists there is nothing to sign in to and nothing
  // to share, so every route funnels into setup.
  if (setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* The only route reachable without a session. */}
      <Route path="/c/:token" element={<SharePage />} />

      <Route path="/setup" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/new" element={<Lazy><ComposePage /></Lazy>} />
        <Route path="/edit/:id" element={<Lazy><ComposePage /></Lazy>} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Old path, kept so existing bookmarks still land somewhere sensible. */}
        <Route path="/account" element={<Navigate to="/settings" replace />} />
      </Route>

      <Route element={<RequireAuth adminOnly><Layout /></RequireAuth>}>
        <Route path="/admin" element={<Lazy><AdminPage /></Lazy>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
