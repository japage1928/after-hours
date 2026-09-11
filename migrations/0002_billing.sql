-- Billing: Stripe customers, subscriptions, payments, usage, song credits.
-- Amounts are integer cents. user_id is TEXT (Better Auth / preview 'dev-user').

create table if not exists billing_customer (
  user_id text primary key references "user" ("id") on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create table if not exists billing_subscription (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  plan_id text not null,
  status text not null,
  stripe_price_id text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  usage_budget_cents integer not null,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists billing_subscription_user_id_idx
  on billing_subscription (user_id);
create index if not exists billing_subscription_status_idx
  on billing_subscription (status);

create table if not exists billing_payment (
  id text primary key,
  user_id text references "user" ("id") on delete set null,
  kind text not null,
  status text not null,
  plan_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  failure_message text,
  metadata_json text,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists billing_payment_user_id_idx on billing_payment (user_id);
create index if not exists billing_payment_status_idx on billing_payment (status);
create index if not exists billing_payment_checkout_idx
  on billing_payment (stripe_checkout_session_id);

create table if not exists usage_ledger (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null,
  amount_cents integer not null,
  description text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists usage_ledger_user_period_idx
  on usage_ledger (user_id, period_start, period_end);
create index if not exists usage_ledger_user_created_idx
  on usage_ledger (user_id, created_at desc);

create table if not exists song_credit (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  source text not null,
  remaining integer not null default 1,
  payment_id text,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists song_credit_user_remaining_idx
  on song_credit (user_id, remaining);

create table if not exists admin_audit (
  id text primary key,
  admin_user_id text not null,
  action text not null,
  target_user_id text,
  detail_json text,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists admin_audit_created_idx on admin_audit (created_at desc);
