-- Botcake async bridge: cau hinh de BalaBot goi nguoc send_flow API cua Botcake.
-- Bang bots dung camelCase nen phai quote.
alter table bots add column if not exists "botcakePageId" text;
alter table bots add column if not exists "botcakeAccessToken" text;
alter table bots add column if not exists "botcakeReplyFlowId" text;
