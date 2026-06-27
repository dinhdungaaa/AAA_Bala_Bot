-- Đo dùng tin nhắn AI theo từng chủ sở hữu/tháng (billing). Cột camelCase nên phải quote.
create table if not exists usage_counters (
  "ownerKey" text not null,
  "yearMonth" text not null,                 -- "YYYY-MM" theo UTC+7
  "messageCount" integer not null default 0,
  "updatedAt" timestamptz not null default now(),
  primary key ("ownerKey", "yearMonth")
);

-- Chỉ service-role (server) được truy cập; chặn mọi client anon.
alter table usage_counters enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='usage_counters' and policyname='usage_counters_no_client_access') then
    create policy usage_counters_no_client_access on usage_counters using (false) with check (false);
  end if;
end $$;

-- Tăng đếm atomic (tránh race đọc-cộng-ghi).
create or replace function increment_usage(p_owner text, p_month text)
returns void language sql as $$
  insert into usage_counters ("ownerKey", "yearMonth", "messageCount", "updatedAt")
  values (p_owner, p_month, 1, now())
  on conflict ("ownerKey", "yearMonth")
  do update set "messageCount" = usage_counters."messageCount" + 1, "updatedAt" = now();
$$;
