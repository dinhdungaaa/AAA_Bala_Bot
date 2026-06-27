-- ============================================================
-- BALABOT — SQL gộp chạy 1 lần trong Supabase → SQL Editor
-- Chạy từ trên xuống. An toàn chạy lại nhiều lần (idempotent).
-- ============================================================


-- ============================================================
-- PHẦN 1 — Bộ đếm tin nhắn billing (usage_counters)
-- Bắt buộc, nếu không bộ đếm fail-open trả 0 (không chặn được quá hạn mức).
-- ============================================================

create table if not exists usage_counters (
  "ownerKey"     text not null,
  "yearMonth"    text not null,                 -- "YYYY-MM" theo UTC+7
  "messageCount" integer not null default 0,
  "updatedAt"    timestamptz not null default now(),
  primary key ("ownerKey", "yearMonth")
);

-- Chỉ service-role (server) được truy cập; chặn mọi client anon.
alter table usage_counters enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename='usage_counters' and policyname='usage_counters_no_client_access'
  ) then
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


-- ============================================================
-- PHẦN 2 — Chuyển bot về tài khoản ledinhdung752589@gmail.com
-- ============================================================

-- Bước 2a — XEM TRƯỚC: các bot đang nằm dưới ox102.crypto.
-- Chạy riêng dòng này trước, nhìn kết quả để quyết định 2b hay 2c.
select b.id, b.name
from bots b
where b."userId" = (select id::text from auth.users where lower(email)='ox102.crypto@gmail.com');

-- ------------------------------------------------------------
-- Bước 2b — CHUYỂN TẤT CẢ bot từ ox102 về ledinhdung.
-- Dùng khi: toàn bộ bot ở 2a đều cần trả về (ox102 không giữ bot riêng).
-- ------------------------------------------------------------
-- update bots
-- set "userId" = (select id::text from auth.users where lower(email)='ledinhdung752589@gmail.com')
-- where "userId" = (select id::text from auth.users where lower(email)='ox102.crypto@gmail.com');

-- ------------------------------------------------------------
-- Bước 2c — CHỈ CHUYỂN 1 bot theo tên (thay 'TÊN_BOT').
-- Dùng khi: ox102 còn bot riêng muốn giữ lại.
-- ------------------------------------------------------------
-- update bots
-- set "userId" = (select id::text from auth.users where lower(email)='ledinhdung752589@gmail.com')
-- where name = 'TÊN_BOT'
--   and "userId" = (select id::text from auth.users where lower(email)='ox102.crypto@gmail.com');

-- Bước 2d — KIỂM TRA: bot đã về đúng chủ chưa.
select b.id, b.name, u.email as owner_email
from bots b
left join auth.users u on u.id::text = b."userId"
where u.email = 'ledinhdung752589@gmail.com';
