-- In-app support tickets. Server-side access only (DATABASE_URL / service
-- role), matching billing + admin_audit — no RLS.

create table if not exists support_ticket (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  email text,
  category text not null,
  message text not null,
  status text not null default 'open',
  admin_note text,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists support_ticket_user_id_idx
  on support_ticket (user_id);
create index if not exists support_ticket_status_idx
  on support_ticket (status);
create index if not exists support_ticket_created_idx
  on support_ticket (created_at desc);
