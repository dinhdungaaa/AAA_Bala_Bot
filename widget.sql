-- Chạy tay trên Supabase SQL Editor (DB gốc; khách BYO chạy lại SQL Schema).
-- Widget chat nhúng website: khóa nhúng + tùy biến giao diện per-bot.
alter table bots add column if not exists "widgetKey" text;
alter table bots add column if not exists "widgetColor" text;
alter table bots add column if not exists "widgetTitle" text;
alter table bots add column if not exists "widgetGreeting" text;
