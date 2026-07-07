-- Chạy tay trên Supabase SQL Editor (như botcakeAsync.sql).
-- Lưu ý: bảng "leads" đã tồn tại (site-assistant popup, schema khác: contact/note/page).
-- Trợ lý bán hàng 2 tầng dùng bảng RIÊNG "bot_leads" để không đụng độ schema/cột.
create table if not exists bot_leads (
  id text primary key,
  "botId" text not null,
  "sessionId" text,
  name text,
  phone text not null,
  address text,
  interest text,
  "buyingSignal" text,
  channel text,
  status text default 'new',
  "createdAt" timestamptz default now()
);
create index if not exists bot_leads_bot_idx on bot_leads ("botId", "createdAt" desc);
alter table bots add column if not exists "conversationGoal" text;
alter table bots add column if not exists "notifyTelegramChatId" text;
