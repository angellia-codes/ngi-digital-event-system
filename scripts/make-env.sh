#!/usr/bin/env bash
set -euo pipefail
eval "$(npx supabase status -o env)"
ANON="${ANON_KEY:-${PUBLISHABLE_KEY:-}}"
SERVICE="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
[ -n "$ANON" ] && [ -n "$SERVICE" ] || { echo "Could not read keys from 'supabase status'"; exit 1; }
cat > .env.local <<EOT
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
STATION_SESSION_SECRET=$(openssl rand -hex 32)
EVENT_ID=00000000-0000-4000-8000-000000000001
APP_URL=http://localhost:3000
DATABASE_URL=$DB_URL
EOT
cp .env.local .env.test
echo "Wrote .env.local and .env.test"
