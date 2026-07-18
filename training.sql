-- Bảng Huấn luyện phản hồi bot: ví dụ mẫu Q&A (few-shot) + quy tắc chung (v1).
create table if not exists public.bot_training_examples (
  id text primary key,
  "botId" text not null,
  question text not null,
  answer text not null,
  "createdAt" timestamptz default now()
);
create index if not exists bot_training_examples_botid_idx on public.bot_training_examples ("botId");

create table if not exists public.bot_training_rules (
  id text primary key,
  "botId" text not null,
  rule text not null,
  "isActive" boolean not null default true,
  "createdAt" timestamptz default now()
);
create index if not exists bot_training_rules_botid_idx on public.bot_training_rules ("botId");
