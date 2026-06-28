-- ============================================================
-- Allowlist gói FREE — chỉ email/domain trong bảng này mới được dùng gói Free.
-- Người ngoài (không trong allowlist, chưa mua gói) sẽ bị chặn bot trả lời.
-- Chạy 1 lần trong Supabase → SQL Editor. An toàn chạy lại (idempotent).
--
-- LƯU Ý: nếu bảng RỖNG thì hệ thống fail-open = vẫn cho mọi người dùng Free
-- (để không chặn nhầm trước khi bạn kịp add cộng đồng Peace Solution).
-- Chỉ khi có ÍT NHẤT 1 dòng thì enforcement mới bật.
-- ============================================================

create table if not exists free_allowlist (
  entry      text primary key,            -- email cụ thể "a@gmail.com" HOẶC domain "peacesolution.org"
  note       text,                         -- ghi chú tuỳ chọn (vd tên người)
  created_at timestamptz not null default now()
);

-- Chỉ service-role (server) được truy cập; chặn mọi client anon.
alter table free_allowlist enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename='free_allowlist' and policyname='free_allowlist_no_client_access'
  ) then
    create policy free_allowlist_no_client_access on free_allowlist using (false) with check (false);
  end if;
end $$;

-- Ví dụ thêm thủ công (có thể dùng UI admin thay vì SQL):
--   insert into free_allowlist (entry, note) values ('peacesolution.org', 'Cả cộng đồng');
--   insert into free_allowlist (entry, note) values ('an.nguyen@gmail.com', 'Thành viên A');
