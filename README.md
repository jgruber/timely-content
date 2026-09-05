# Timely Content

Share a file or a written note by QR code. The person who scans it gets the
content without signing in — and only as many times as you allow. Optionally
the content deletes itself once the last permitted view is spent.

Everything lives in two host directories so an external backup tool can copy
them: `credentials.json` and `content/`.

## Quick start

```bash
cp .env.example .env      # set HOST_PORT and DATA_PATH
docker compose up -d --build
```

The service will not start until it knows its public address and how to send
mail; the log spells out exactly what to set. See **Configuration** below, or
set `PASSWORD_RESET_ENABLED=false` to run without email.

Open `http://<host>:9080/`. On a fresh volume every route redirects to a
first-run setup screen where you create the first account — it becomes the
administrator, and is the only account that does not need its address
confirmed. The screen disappears once that account exists.

Setup also asks for the **Public URL** (optional): the address your users
actually reach, which is what QR codes encode. You can set it later under
**Administration → System**.

### Unattended setup

For automated deployments, set **both** `ADMIN_EMAIL` and `ADMIN_PASSWORD` in
`.env` and the first administrator is seeded on first start instead, so the
setup screen never appears. Neither variable does anything once an account
exists, and no password is ever generated for you.

## Accounts

People sign in with their **email address**. Every account also carries an
immutable internal id, and content ownership hangs off that rather than the
address — so changing an address never orphans a library.

Every account except the first administrator has to confirm its address before
it can sign in. Creating a user sends a confirmation link; until it is followed
the account exists but cannot be used. An administrator can resend the link, or
mark an address confirmed by hand when mail cannot reach someone.

Forgotten passwords are recovered from the sign-in screen. The emailed link
works once, expires (30 minutes by default), signs the account out of every
other device when spent, and is revoked by any later password change. Requests
answer identically whether or not the address is registered, so the endpoint
cannot be used to discover who has an account.

### Upgrading from a username-based install

The first start after upgrading migrates `credentials.json` automatically:

- Existing accounts get an internal id, and their content is re-pointed at it.
- They are marked **confirmed**, so nobody is locked out of a working instance.
- A username that is already an email address becomes the login address. If you
  intend to keep an account, rename it to the owner's email before upgrading.
- Anything else is left without an address and named in the log; an
  administrator sets one from the Users screen before that person can sign in.

## How it works

| Concern | Behaviour |
| --- | --- |
| First run | Setup screen creates the first administrator; no default password |
| Install | Installable as a PWA from the browser, or "Install app" in the profile menu |
| Oversight | Administrators see and can remove content posted by any account |
| Support | **About** in the profile menu shows the version and links to the issue tracker |
| Authoring | WYSIWYG markdown editor, or upload one file or many |
| Packages | A whole selection shares one QR code and one access count |
| Sharing | Each item gets a QR code and a link at `/c/<token>` |
| Access limit | A fixed number of opens, or unlimited |
| Expiry | An optional date and time, independent of the access count |
| Reactivation | An ended share keeps its files and can be given a fresh QR code |
| Self-destruct | Optionally deletes the content after the final permitted open |
| Rotation | Issue a new QR code at any time; the old one dies and the count resets |
| Markdown | Rendered in the browser, and stays editable |
| Anything else | Downloads immediately when the code is scanned |

Content is reachable in exactly two ways: an authenticated session, or a valid
share token. The data directory is never served statically, and blob paths are
derived from validated hex ids, so no request can walk out of the content
directory.

### Access accounting

Opening a share link spends one access atomically, before any bytes are sent.
Markdown comes back in that response. Other files receive a single-use ticket
which the browser immediately redeems, so the bytes are delivered exactly once
per access spent — and a self-destructing item is reaped only after its bytes
have actually left.

## Sharing several files at once

Pick as many files as you like and they become one share with one QR code. This
is the case the app is really built around: handing someone a batch of photos
from a phone without AirDrop, a cloud album, or a cable.

Opening the link spends **one** access no matter how many files are inside.
Charging per file would make a limit of "one view" meaningless the moment
anybody shared twenty photos, so the ticket issued on opening covers every
download that follows.

The recipient gets a list, with individual downloads first and a zip second.
That order is deliberate: on a phone a zip lands in Files and has to be
unpacked before a photo can be saved, whereas tapping a single image lets the
browser's own save-to-photos work. The zip is for "put all of this on my
laptop".

Archives are stored, never deflated — photos and video are already compressed,
so deflating would burn CPU across the whole payload for nothing. It also means
the archive size is known before the first byte is sent, so the download shows a
real progress bar instead of an open-ended spinner.

Any file type is accepted — documents, spreadsheets, PDFs, archives and
proprietary binary formats are all stored and returned byte for byte, with
their original names intact including spaces and accents.

Previews are generated in the browser at upload time, from the image it has
already decoded. That keeps a native image library out of the deployment
entirely, and "the browser could decode it" is the right test for whether a
preview is possible at all: an iPhone HEIC that Safari will not render is
exactly the file a server-side thumbnailer would produce a preview nobody else
can see. Anything without a preview shows a file icon.

## Expiry

A share can stop at a set time as well as after a number of opens. The two are
independent, and whichever comes first wins — so "anyone can grab these, but
only for the next hour" is unlimited opens plus a one-hour expiry.

An expiry has no visit to trigger it, so a sweep runs every minute to retire
shares that have passed theirs.

When a share ends — limit reached or expired — the files are kept unless
**Delete the content once the share ends** was set. A kept share can be
reactivated from the library with a new limit, a new expiry, or both; it gets a
fresh QR code and a zeroed counter, and the old code stays permanently dead.

## Administrator oversight

**Administration -> Content** lists everything stored on the instance, whoever
posted it, with the owner shown against each item. An administrator can inspect
any item — markdown renders inline, files download — and remove anything, which
deletes the stored bytes and kills the share link immediately.

Two deliberate properties:

- Inspecting from this screen does **not** spend one of the QR code's accesses,
  so checking what is being shared never uses up a recipient's view.
- Every removal is written to the log with who did it and what was removed.

This is the only place that reads across accounts. Every owner-facing route
stays scoped to the signed-in account, and a non-administrator gets `403` from
all of it.

## Reporting a problem

**Profile menu -> About** shows the running version and gathers the details a
bug report needs — version, browser, whether it is running installed or in a
tab, and the server's Node version. *Report a bug* opens the issue form with
the version and browser already filled in.

The version is only served to signed-in users: telling anonymous visitors and
share-link recipients exactly which build is running only helps someone match
it against a known vulnerability.

Issue templates live in `.github/ISSUE_TEMPLATE/`. They ask which part of the
flow is affected — posting or retrieval — and which area, so an issue can be
labelled on arrival. Please never paste a share link or private content into an
issue: a share link grants access to whoever opens it.

## Configuration

Environment variables (see `docker-compose.yml`):

**Every setting in `settings.json` has an environment override, and the
environment always wins.** A value supplied by the environment is shown
read-only in the admin screen rather than offering an edit the next restart
would silently discard.

### Required

The service refuses to start without these, and prints what to set and why:

| Variable | Why it is required |
| --- | --- |
| `PUBLIC_URL` | Reset links must never be built from the request `Host` header, which an attacker can forge to point a link at their own server |
| `SMTP_HOST` | There is no way to send a confirmation or reset email without a relay |
| `SMTP_FROM` | Mail servers reject a message with no sender |

Set `PASSWORD_RESET_ENABLED=false` and none of them are required: the app runs
with no mail server, the forgot-password link is hidden, and new accounts are
usable without confirming an address.

### Everything else

| Variable | settings.json | Default |
| --- | --- | --- |
| `SITE_NAME` | `siteName` | `Timely Content` |
| `DEFAULT_MODE` | `defaultMode` | `system` |
| `DEFAULT_ACCENT` | `defaultAccent` | `indigo` |
| `ENFORCE_HOST` | `enforceHost` | `false` |
| `MAX_UPLOAD_MB` | `maxUploadMb` | `25` |
| `SESSION_HOURS` | `sessionHours` | `12` |
| `PASSWORD_RESET_ENABLED` | `passwordResetEnabled` | `true` |
| `RESET_TOKEN_MINUTES` | `resetTokenMinutes` | `30` |
| `SMTP_PORT` | `smtp.port` | `587` |
| `SMTP_SECURE` | `smtp.secure` | `false` |
| `SMTP_USER` | `smtp.user` | *(empty)* |
| `SMTP_PASS` | `smtp.pass` | *(empty)* |
| `SMTP_FROM_NAME` | `smtp.fromName` | site name |

Environment-only, with no `settings.json` equivalent:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9080` | Port inside the container |
| `DATA_DIR` | `/data` | Where credentials and content live |
| `COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP testing |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops to trust for `X-Forwarded-*` |
| `ADMIN_EMAIL` | *(unset)* | Optional unattended seeding; needs `ADMIN_PASSWORD` too |
| `ADMIN_PASSWORD` | *(unset)* | Optional unattended seeding; needs `ADMIN_EMAIL` too |

### Per-user, in the profile menu

Each user opens **Settings** from the profile menu in the top right:

- **Appearance** — light / dark / system, plus seven colour themes. Stored on
  the account, so it follows the user to every device they sign in from.
- **Password** — requires the current password, and signs the account out
  everywhere else.

Both are only reachable once signed in.

### Site-wide, in **Administration → System**

Stored in `data/settings.json`:

- **Site name** — shown in the header, on the sign-in screen and in the tab.
- **Default appearance** — the theme used wherever nobody is signed in: the
  sign-in screen, first-run setup, and **every page a QR code opens**. Shared
  pages use it even for a signed-in visitor, so an author previewing a link
  sees exactly what the recipient sees.
- **Public URL** — the address the reverse proxy publishes. QR codes point here.
- **Validate the request hostname** — refuse requests whose `Host` header does
  not match the public URL. `/healthz` stays exempt so container probes work.
- **Maximum upload size** and **session length**.

## Reverse proxy

The app speaks plain HTTP on a high port and expects TLS to be terminated in
front of it. Example nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name share.example.com;

    ssl_certificate     /etc/letsencrypt/live/share.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/share.example.com/privkey.pem;

    client_max_body_size 64m;   # at least the configured upload limit

    location / {
        proxy_pass         http://127.0.0.1:9080;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Caddy:

```caddy
share.example.com {
    reverse_proxy 127.0.0.1:9080
}
```

## Backup and restore

Back up the whole host data directory. Both JSON files are written atomically
(write to a temp file, then rename), so a copy never catches a half-written
file.

```bash
tar czf timely-content-$(date +%F).tgz -C /srv/timely-content data
```

Restore by stopping the container, replacing the directory, and starting again.

```
data/
├── credentials.json      accounts, scrypt password hashes, per-user theme
├── email-tokens.json     hashed, single-use reset and confirmation tokens
├── settings.json         site name, default theme, public URL, limits
├── .session-secret       session signing key (keeps logins alive on restart)
└── content/
    ├── index.json        metadata: owner, token, access count, limits
    └── blobs/            one file per item, named by content id
```

Keep `.session-secret` in the backup to avoid signing everyone out on restore;
delete it to invalidate every session deliberately.

## Security notes

- Passwords are hashed with scrypt (N=16384, r=8, p=1) and a per-user salt.
- Reset and confirmation tokens are stored as SHA-256 hashes; the raw value
  exists only in the recipient's inbox, so a leaked backup cannot be replayed.
- Confirmation is spent by a POST, not by loading the link, so mail scanners
  that prefetch URLs cannot burn a token before the recipient clicks it.
- An account whose password is right but whose address is unconfirmed is told
  so only after the password check, so the message leaks nothing to an outsider.
- Sessions are HMAC-signed cookies, `HttpOnly` + `SameSite=Strict`, and
  `Secure` unless explicitly disabled.
- Changing a password — by the user or an administrator — invalidates every
  existing session for that account.
- Share tokens carry ~192 bits of entropy; sign-in and share-link endpoints are
  rate limited.
- Rendered markdown is sanitised with DOMPurify; scripts, styles, form controls
  and `javascript:` URLs are stripped, and links open with
  `rel="noopener noreferrer nofollow"`.
- The container drops to an unprivileged user and runs with
  `no-new-privileges`.

## Development

```bash
# Terminal 1 -- API on :9099
cd server && npm install
DATA_DIR=../data PORT=9099 COOKIE_SECURE=false ADMIN_PASSWORD=devpassword123 npm run dev

# Terminal 2 -- Vite dev server on :5173, proxying /api to :9099
cd web && npm install && npm run dev
```

## Installing as an app

The site ships a web app manifest and a service worker, so browsers offer to
install it — Chrome's address-bar install button, Safari's *Add to Home
Screen*, or **Install app** in the profile menu. Installed, it opens
standalone with its own icon and jump-list shortcuts to Compose and Upload.

The service worker deliberately caches almost nothing. `/api/**` is never
cached or intercepted: shared content is access limited and can self-destruct,
so a cached copy could hand someone a document after their last permitted
view. Only the app shell and content-hashed build assets are stored, which is
enough to survive a flaky connection.

Installability needs a secure context, so put the reverse proxy's TLS in front
first (`localhost` also counts while testing).

## License

Released under the [MIT License](LICENSE).
