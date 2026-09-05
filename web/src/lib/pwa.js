/**
 * Progressive-web-app plumbing: registering the service worker, and capturing
 * the browser's install prompt so the app can offer its own install button.
 *
 * Chrome fires `beforeinstallprompt` once, early, and only if the app is not
 * already installed. Stashing the event is the only way to trigger the prompt
 * later from a real user gesture.
 */

let deferredPrompt = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(canInstall());
}

export function canInstall() {
  return deferredPrompt !== null;
}

export function onInstallAvailabilityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when running as an installed app rather than a browser tab. */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome; // 'accepted' | 'dismissed'
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Suppress Chrome's mini-infobar so the app can offer install on its terms.
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed:', err);
      });
    });
  }
}
