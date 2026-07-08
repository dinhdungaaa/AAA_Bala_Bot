-- Chạy tay trên Supabase SQL Editor CỦA DB GỐC (tài khoản owner).
-- Lưu bền ánh xạ "khách BYO Supabase" để sống sót qua Railway redeploy:
--   user_configs: email đăng nhập → Supabase riêng của họ (dashboard)
--   bot_configs:  botId → Supabase riêng (webhook Telegram/Facebook/Botcake
--                 không có header nên phải tra theo botId)

create table if not exists user_configs (
  email text primary key,
  supabase_url text not null,
  supabase_key text not null,
  "updatedAt" timestamptz default now()
);

create table if not exists bot_configs (
  "botId" text primary key,
  supabase_url text not null,
  supabase_key text not null,
  "updatedAt" timestamptz default now()
);
