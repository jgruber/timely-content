#!/bin/sh
set -e

# The data volume is bind-mounted from the host, so its ownership is whatever
# the host directory happens to have. Normalise it once as root, then drop to
# the unprivileged "node" user for the life of the process.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/content/blobs" "$DATA_DIR/content/.tmp"
  chown -R node:node "$DATA_DIR"
  exec su-exec node "$@"
fi

exec "$@"
