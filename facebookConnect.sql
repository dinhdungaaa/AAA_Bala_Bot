-- Facebook Messenger per-bot: luu Page Access Token + thong tin Page tren tung bot
-- (thay vi bien moi truong toan cuc). Bang bots dung camelCase nen phai quote.
alter table bots add column if not exists "facebookPageAccessToken" text;
alter table bots add column if not exists "facebookPageId" text;
alter table bots add column if not exists "facebookPageName" text;
alter table bots add column if not exists "facebookStatus" text;
alter table bots add column if not exists "facebookConnectedAt" text;
