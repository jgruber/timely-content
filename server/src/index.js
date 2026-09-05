import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ensureDirs, PORT, TMP_DIR } from './lib/paths.js';
import { attachUser } from './lib/session.js';
import { getSettings, settingsStore } from './lib/settings.js';
import { resolve, missingRequired, startupHelp } from './lib/config.js';
import { verifyTransport } from './lib/email.js';
import { sweepExpired } from './lib/emailtokens.js';
import { seedAdminFromEnv, countUsers } from './lib/users.js';
import { sweepTickets, reapOrphans } from './lib/content.js';
import { migrateToEmailIdentity, warnIfNoUsableAccount } from './lib/migrate.js';
import siteRoutes from './routes/site.js';
import authRoutes from './routes/auth.js';
import contentRoutes from './routes/content.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(process.env.WEB_DIST || path.join(__dirname, '../../web/dist'));

ensureDirs();

const app = express();
// Behind a TLS-terminating reverse proxy: honour X-Forwarded-Proto/Host.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.disable('x-powered-by');

app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true }));

/**
 * Optional hostname validation. When an administrator enables it, the Host
 * header must match the configured public URL -- this stops the instance
 * answering to arbitrary names a misconfigured proxy might forward.
 */
app.use(async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!settings.enforceHost || !settings.publicUrl) return next();
    const expected = new URL(settings.publicUrl).host.toLowerCase();
    const actual = String(req.get('host') || '').toLowerCase();
    if (actual !== expected) {
      return res.status(421).json({ error: 'This host is not served by this instance.' });
    }
    next();
  } catch (err) {
    next(err);
  }
});

app.use(attachUser);

app.use('/api/site', siteRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

// The SPA bundle is the only thing served statically. The data volume is
// never mounted into the web root -- content leaves only via the API.
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      const name = path.basename(filePath);
      // The service worker and manifest must be revalidated on every load,
      // otherwise a deploy is pinned behind a year-long immutable cache and
      // the installed app never updates. Build output under /assets/ is
      // content-hashed, so it keeps the long immutable lifetime.
      if (name === 'sw.js' || name === 'manifest.webmanifest' || filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      if (name === 'sw.js') {
        // Allow the worker to control the whole origin, not just /.
        res.setHeader('Service-Worker-Allowed', '/');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('*', (req, res) =>
    res.status(503).type('text').send('Web bundle not built. Run "npm run build" in web/.'));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large.' });
  }
  console.error('[error]', err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong.' });
});

// A long-running self-hosted service should log and keep serving rather than
// exit on a stray rejection. Node 22 would otherwise terminate the process.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandled rejection]', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaught exception]', err?.stack || err);
});

/**
 * Refuse to start on incomplete configuration rather than failing later in a
 * way nobody sees -- a password reset that silently never arrives is worse
 * than a container that will not boot and says exactly why.
 */
async function checkConfiguration() {
  const stored = await settingsStore.read((data) => structuredClone(data));
  const { values, envManaged, errors } = resolve(stored);

  for (const e of errors) {
    console.error(`[config] ${e.env} is invalid: ${e.message}. Falling back to the default.`);
  }

  const missing = missingRequired(values);
  if (missing.length) {
    console.error(startupHelp(missing));
    process.exit(1);
  }

  if (envManaged.length) {
    console.log(`[config] managed by the environment: ${envManaged.join(', ')}`);
  }
  if (!values.publicUrl) {
    console.warn('[config] PUBLIC_URL is not set. QR codes will use the address of '
      + 'each request, which is wrong behind a reverse proxy.');
  }

  if (values.passwordResetEnabled) {
    const check = await verifyTransport(values.smtp);
    if (check.ok) {
      console.log(`[config] SMTP ready at ${values.smtp.host}:${values.smtp.port}`);
    } else {
      // Not fatal: the relay may simply be slow to come up alongside us.
      console.warn(`[config] SMTP check failed: ${check.error}`);
      console.warn('[config] Password-reset email will not work until this is resolved.');
    }
  } else {
    console.log('[config] Password reset by email is disabled (PASSWORD_RESET_ENABLED=false).');
  }

  return values;
}

async function start() {
  await checkConfiguration();
  await migrateToEmailIdentity();

  const seeded = await seedAdminFromEnv();
  if (seeded) console.log(`[init] seeded administrator "${seeded.email}" from the environment`);

  await warnIfNoUsableAccount();

  if ((await countUsers()) === 0) {
    console.log('[init] ============================================================');
    console.log('[init]  No users yet. Open the app in a browser to create the');
    console.log('[init]  first administrator account.');
    console.log('[init] ============================================================');
  }

  await reapOrphans();
  for (const entry of fs.readdirSync(TMP_DIR)) {
    fs.rmSync(path.join(TMP_DIR, entry), { force: true });
  }

  setInterval(sweepTickets, 60 * 1000).unref();
  setInterval(() => { void sweepExpired(); }, 10 * 60 * 1000).unref();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[timely-content] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
