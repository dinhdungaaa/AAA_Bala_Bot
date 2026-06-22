# Zalo Group Bot — Operations Guide

## Enabling the Feature

1. Run `zaloGroupBot.sql` on Supabase (creates `zalo_sessions` and `zalo_group_bindings` tables).
2. Set environment variables on Render: `ZALO_GROUP_BOT_ENABLED=true`, `ZALO_ACCOUNT_LABEL=default`, `ZALO_RATE_LIMIT_PER_MIN=5`.
3. Deploy. Open admin panel → "Zalo Group" section → "Login to Zalo" → scan QR code with a **secondary account**.

## Keep-Alive (Required for 24/7 Operation)

The WebSocket listener maintains an outbound connection. Render's free tier automatically sleeps after ~15 minutes without inbound requests.

Choose one:

- **Paid Render instance** (always-on), OR
- **Uptime pinger** (UptimeRobot / cron-job.org) calls `https://<domain>/health` every 5 minutes.

## Risks and Limitations

- **Zalo ToS violation**: Automating a personal Zalo account violates Zalo's Terms of Service and may result in account suspension. Use a secondary account.
- **Session failures**: When a session breaks, `GET /api/zalo/status` returns `loginState: "needs_login"` → re-authenticate via QR code.

## Current Limitations

- Groups only (no direct messages)
- Text messages only
- Bot responds only to @mentions or replies
- Single bot account per deployment
