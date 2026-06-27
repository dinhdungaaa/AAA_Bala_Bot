-- migrations/2026-06-27-zalo-owner-email.sql
-- Multi-tenant Zalo: scope sessions + bindings by owner_email.

-- 1) zalo_sessions: one row per user (MVP = 1 nick/user).
alter table zalo_sessions add column if not exists owner_email text;
update zalo_sessions set owner_email = 'ox102.crypto@gmail.com' where owner_email is null;
alter table zalo_sessions alter column owner_email set not null;
create unique index if not exists zalo_sessions_owner_email_uq on zalo_sessions (owner_email);

-- 2) zalo_group_bindings: scope by owner; (owner_email, group_id) unique.
alter table zalo_group_bindings add column if not exists owner_email text;
update zalo_group_bindings set owner_email = 'ox102.crypto@gmail.com' where owner_email is null;
alter table zalo_group_bindings alter column owner_email set not null;

-- group_id was the PK; replace with a surrogate id so the same group_id can exist per owner.
alter table zalo_group_bindings add column if not exists id text;
update zalo_group_bindings set id = coalesce(id, owner_email || ':' || group_id) where id is null;
alter table zalo_group_bindings drop constraint if exists zalo_group_bindings_pkey;
-- Idempotent PK add: re-running the migration must not fail if the PK already exists.
do $$ begin
  alter table zalo_group_bindings add primary key (id);
exception when invalid_table_definition then null;  -- PK already present
end $$;
create unique index if not exists zalo_group_bindings_owner_group_uq
  on zalo_group_bindings (owner_email, group_id);
