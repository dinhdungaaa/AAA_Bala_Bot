-- Chạy tay trên Supabase SQL Editor (như bot-leads.sql).
-- Bảng lưu GÓI BỀN per khách hàng — admin nâng/hạ gói sống sót qua Railway redeploy.
-- id = auth user id (uuid dạng text); email để tra cứu khi chỉ biết email.
create table if not exists profiles (
  id text primary key,
  email text,
  tier text default 'free',
  message_limit bigint default 1000,
  created_at timestamptz default now()
);
create index if not exists profiles_email_idx on profiles (lower(email));
