-- Bảng phiên đăng nhập Zalo (1 dòng cho mỗi tài khoản bot)
create table if not exists zalo_sessions (
  id text primary key,
  account_label text not null default 'default',
  credentials jsonb,
  status text not null default 'needs_login',  -- active | needs_login | error
  last_error text,
  updated_at timestamptz not null default now()
);

-- Khoa bang phien dang nhap: chi service-role (server) duoc truy cap; deny moi client anon.
alter table zalo_sessions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='zalo_sessions' and policyname='zalo_sessions_no_client_access') then
    create policy zalo_sessions_no_client_access on zalo_sessions using (false) with check (false);
  end if;
end $$;

-- Ánh xạ group -> bot
create table if not exists zalo_group_bindings (
  group_id text primary key,
  group_name text,
  bot_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
