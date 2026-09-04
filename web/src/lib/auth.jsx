import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api.js';
import { applyPrefs, DEFAULT_PREFS, normalisePrefs } from './theme.js';

const AuthContext = createContext(null);

const FALLBACK_SITE = {
  siteName: 'Timely Content',
  appearance: { ...DEFAULT_PREFS },
  setupRequired: false,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set by pages that must ignore personal preference -- shared QR pages show
  // the site appearance so the author previewing a link sees what recipients do.
  const [appearanceOverride, setAppearanceOverride] = useState(null);

  /**
   * A signed-in user's own preference always wins. Everyone else -- the
   * sign-in screen, first-run setup, and anyone opening a shared QR link --
   * sees the appearance an administrator chose for the site.
   */
  const prefs = useMemo(
    () => normalisePrefs(appearanceOverride || user?.prefs || site?.appearance),
    [appearanceOverride, user, site],
  );

  useEffect(() => { applyPrefs(prefs); }, [prefs]);

  // Follow the OS while "System" is selected.
  useEffect(() => {
    if (prefs.mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyPrefs(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.site().catch(() => null),
      api.me().catch(() => null),
    ]).then(([siteInfo, me]) => {
      if (cancelled) return;
      setSite(siteInfo || FALLBACK_SITE);
      setUser(me?.user || null);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = site?.siteName || FALLBACK_SITE.siteName;
  }, [site]);

  const refreshSite = useCallback(async () => {
    try {
      setSite(await api.site());
    } catch { /* keep the copy we already have */ }
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password);
    setUser(res.user);
    return res.user;
  }, []);

  const completeSetup = useCallback(async (payload) => {
    const res = await api.setup(payload);
    setUser(res.user);
    setSite((s) => ({ ...(s || FALLBACK_SITE), setupRequired: false }));
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  const updatePrefs = useCallback(async (patch) => {
    if (!user) return;
    const next = normalisePrefs({ ...user.prefs, ...patch });
    setUser((u) => ({ ...u, prefs: next }));
    try {
      await api.savePrefs(patch);
    } catch {
      // Keep the local change; it resyncs on the next successful save.
    }
  }, [user]);

  const value = useMemo(
    () => ({
      user, setUser, site, loading, prefs, setAppearanceOverride,
      login, logout, completeSetup, updatePrefs, refreshSite,
      siteName: site?.siteName || FALLBACK_SITE.siteName,
      setupRequired: !!site?.setupRequired,
    }),
    [user, site, loading, prefs, login, logout, completeSetup, updatePrefs, refreshSite],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
