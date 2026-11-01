#!/usr/bin/env bash
# Deploys the WhatsApp bot only when its test set passes (scripts/bot-check.ts):
# the fixed Hindi / Hinglish / English checks and the snapshot of real papers and posts.
#   bash scripts/deploy-bot.sh
set -e
cd "$(dirname "$0")/.."
npx --yes deno@2 run --allow-read --allow-write --allow-net --allow-env scripts/bot-check.ts
rm -f deno.lock supabase/functions/deno.lock
npx supabase functions deploy wa-bot --project-ref lokiszscjahxabturzoo --use-api --no-verify-jwt
