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

Open `http://<host>:9080/`. On a fresh volume every route redirects to a
first-run setup screen where you create the first account — it becomes the
administrator. The screen disappears once that account exists, and the setup
endpoint refuses to run again.

Setup also asks for the **Public URL** (optional): the address your users
actually reach, which is what QR codes encode. You can set it later under
**Administration → System**.

### Unattended setup

For automated deployments, set **both** `ADMIN_USERNAME` and `ADMIN_PASSWORD`
in `.env` and the first administrator is seeded on first start instead, so the
setup screen never appears. Neither variable does anything once a user exists,
and no password is ever generated for you.

## How it works

| Concern | Behaviour |
| --- | --- |
| First run | Setup screen creates the first administrator; no default password |
| Authoring | WYSIWYG markdown editor, or upload any file |
| Sharing | Each item gets a QR code and a link at `/c/<token>` |
| Access limit | A fixed number of opens, or unlimited |
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

## Configuration

Environment variables (see `docker-compose.yml`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9080` | Port inside the container |
| `DATA_DIR` | `/data` | Where credentials and content live |
| `COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP testing |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops to trust for `X-Forwarded-*` |
| `ADMIN_USERNAME` | *(unset)* | Optional unattended seeding; needs `ADMIN_PASSWORD` too |
| `ADMIN_PASSWORD` | *(unset)* | Optional unattended seeding; needs `ADMIN_USERNAME` too |

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
├── credentials.json      users, scrypt password hashes, per-user theme
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

## License

Released under the [MIT License](LICENSE).
