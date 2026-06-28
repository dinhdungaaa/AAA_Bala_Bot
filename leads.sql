-- ============================================================
-- Leads — khách để lại liên hệ qua Trợ lý BalaBot (widget popup) để được tư vấn.
-- Chạy 1 lần trong Supabase → SQL Editor. An toàn chạy lại (idempotent).
-- ============================================================

create table if not exists leads (
  id         text primary key,
  name       text,
  contact    text,                 -- SĐT / Zalo / email khách để lại
  note       text,                 -- nhu cầu / câu hỏi gần nhất
  page       text,                 -- trang khách đang xem khi để lại
  status     text default 'new',   -- new | contacted | done
  created_at timestamptz not null default now()
);

create index if not exists leads_created_idx on leads (created_at desc);

-- Chỉ service-role (server) được truy cập; chặn mọi client anon.
alter table leads enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='leads' and policyname='leads_no_client_access'
  ) then
    create policy leads_no_client_access on leads using (false) with check (false);
  end if;
end $$;
