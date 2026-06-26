-- Registry nhóm Telegram bot đã được add vào (auto-bắt qua webhook my_chat_member / tin nhắn group).
-- Dùng để UI đặt lịch nhắc chọn nhóm từ dropdown thay vì gõ tay chat_id âm.
-- Cột camelCase nên phải quote.
create table if not exists telegram_groups (
  "id" text primary key,                  -- `${botId}:${chatId}`
  "botId" text not null,
  "chatId" text not null,
  "title" text,
  "type" text,                            -- group | supergroup | channel
  "isActive" boolean default true,
  "addedAt" text,
  "lastSeenAt" text
);

create index if not exists telegram_groups_bot_idx on telegram_groups ("botId");
