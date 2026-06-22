-- Bảng phiên đăng nhập Zalo (1 dòng cho mỗi tài khoản bot)
create table if not exists zalo_sessions (
  id text primary key,
  account_label text not null default 'default',
  credentials jsonb,
  status text not null default 'needs_login',  -- active | needs_login | error
  last_error text,
  updated_at timestamptz not null default now()
);

-- Ánh xạ group -> bot
create table if not exists zalo_group_bindings (
  group_id text primary key,
  group_name text,
  bot_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
