-- WhatsApp bot: a change waiting for the person's YES (20 Oct 2026).
-- The AI proposes, the bot asks "Reply YES", only YES saves (wa-bot/actions.ts).
-- Run 20 Oct 2026 in the Supabase SQL editor.
alter table public.bot_inbox add column if not exists pending jsonb;
