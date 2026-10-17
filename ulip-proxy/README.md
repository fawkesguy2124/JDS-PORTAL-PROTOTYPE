# ULIP proxy (AWS Lightsail, Mumbai)

The Express proxy that runs on `13.200.155.29:3000` under PM2 (`ulip-proxy`). It
exists because ULIP only accepts India-based, whitelisted IPs. The live copy is
at `/home/ubuntu/ulip-proxy/index.js` on the server. This folder is the source of
truth; copy changes up from here.

## Secret key

The proxy only forwards requests that carry the header `x-proxy-key` with the
right value. The Supabase Edge Functions send it from the `ULIP_PROXY_KEY`
secret. The header is removed before the request goes on to ULIP.

Server settings live in `/home/ubuntu/ulip-proxy/.env` (never commit it):

```
PROXY_KEY=<the secret>
PROXY_ENFORCE=true
```

With `PROXY_ENFORCE=false` the proxy still forwards requests without the key,
but logs each one with the caller's IP. Use that mode only while rolling out.

## Rollout (do in this order so the portal never breaks)

None of these steps call ULIP. Step 5 and step 7 are you clicking in the portal.

1. **Make the key.** On the server, run `openssl rand -hex 32` and copy the
   output. Don't paste it in chat or in GitHub.
2. **Update the proxy, with blocking still off.** Copy this `index.js` to
   `/home/ubuntu/ulip-proxy/index.js`. Create `/home/ubuntu/ulip-proxy/.env` with
   `PROXY_KEY=<key>` and `PROXY_ENFORCE=false`. Then run
   `pm2 restart ulip-proxy` and `pm2 save`. The log line should say
   `key set, enforce off`.
3. **Give Supabase the same key.** In the Supabase dashboard, open Edge
   Functions → Secrets and add `ULIP_PROXY_KEY` = `<key>`.
4. **Deploy the functions.** From the project folder, run
   `npx supabase functions deploy`.
5. **Test in the portal.** Do one normal BE status check.
6. **Check the log.** Run `pm2 logs ulip-proxy --lines 30`. Your check should
   show as a normal line with no `NO KEY` warning. Any `NO KEY` lines from
   unknown IPs are outsiders who were using the proxy.
7. **Turn blocking on.** Set `PROXY_ENFORCE=true` in `.env`, run
   `pm2 restart ulip-proxy`, then do one more portal check.

**To undo:** set `PROXY_ENFORCE=false` and run `pm2 restart ulip-proxy`. The
original `index.js` is in git history if you need it.

## Still open

The link from Supabase to this server is plain `http`. The key and the ULIP
login travel unencrypted. Fixing that needs a domain name plus HTTPS (for
example Caddy with Let's Encrypt) on this server.
