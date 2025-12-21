#!/bin/sh
set -e

# Create superuser if it doesn't exist
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  echo "Creating/updating superuser..."
  /usr/local/bin/pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" 2>/dev/null || true
fi

# Start PocketBase
exec /usr/local/bin/pocketbase serve --http=0.0.0.0:8090 "$@"
