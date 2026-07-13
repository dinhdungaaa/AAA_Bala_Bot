-- Bảng bài viết Content Studio (v1).
create table if not exists public.content_posts (
  id text primary key,
  "botId" text not null,
  "userId" text,
  "postType" text not null,
  topic text,
  content text,
  score int default 0,
  status text default 'draft',
  "createdAt" timestamptz default now()
);
create index if not exists content_posts_botid_idx on public.content_posts ("botId");
create index if not exists content_posts_userid_idx on public.content_posts ("userId");

-- Đếm quota content theo chủ sở hữu theo tháng (tách khỏi quota tin nhắn).
create table if not exists public.content_usage (
  owner_key text not null,
  ym text not null,
  count int default 0,
  primary key (owner_key, ym)
);

-- Tăng quota content nguyên tử (atomic upsert-increment), tránh mất update khi generate đồng thời.
create or replace function increment_content_usage(p_owner_key text, p_ym text)
returns void language sql as $$
  insert into content_usage (owner_key, ym, count)
  values (p_owner_key, p_ym, 1)
  on conflict (owner_key, ym)
  do update set count = content_usage.count + 1;
$$;
