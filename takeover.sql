-- Chạy tay trên Supabase SQL Editor.
-- Human takeover: nhân viên nhắn → bot im lặng tới thời điểm này (30 phút/lần gia hạn).
alter table chat_sessions add column if not exists "humanTakeoverUntil" timestamptz;
