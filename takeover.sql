-- Chạy tay trên Supabase SQL Editor.
-- Human takeover: nhân viên nhắn → bot im lặng tới thời điểm này (30 phút/lần gia hạn).
alter table chat_sessions add column if not exists "humanTakeoverUntil" timestamptz;

-- Định tuyến kênh để tin CAN THIỆP của operator gửi đúng nơi sau khi server restart
-- (thiếu các cột này, session nạp lại từ DB mất đường gửi: Zalo tịt hẳn vì mất
-- ownerEmail, Telegram nhóm gửi nhầm sang chat riêng của khách).
alter table chat_sessions add column if not exists channel text;
alter table chat_sessions add column if not exists "channelChatId" text;
alter table chat_sessions add column if not exists "channelIsGroup" boolean;
alter table chat_sessions add column if not exists "channelSenderId" text;
alter table chat_sessions add column if not exists "channelOwnerEmail" text;
