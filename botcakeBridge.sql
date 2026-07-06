-- Botcake bridge: khoa rieng tung bot de Botcake Dynamic Block goi API BalaBot.
-- Bang bots dung camelCase nen phai quote.
alter table bots add column if not exists "botcakeBridgeKey" text;
