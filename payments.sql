-- Chạy tay trên Supabase SQL Editor của DB GỐC (owner).
-- Thanh toán tự động SePay: đơn hàng + giao dịch tiền vào không khớp đơn.
create table if not exists payment_orders (
  id text primary key,                     -- orderCode BLBXXXXXXXX
  user_id text not null,
  email text,
  tier text not null,                      -- starter | pro
  months integer not null default 1,       -- 1 | 12
  amount integer not null,                 -- VND
  status text not null default 'pending',  -- pending | paid | expired
  sepay_tx_id text,
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_user_idx on payment_orders (user_id, created_at desc);
create index if not exists payment_orders_tx_idx on payment_orders (sepay_tx_id);

create table if not exists payment_unmatched (
  id text primary key,                     -- sepay tx id
  amount integer,
  content text,
  received_at timestamptz default now()
);
