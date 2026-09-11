-- Short-lived bearer tickets let authenticated app users send large audio
-- directly to the external audio gateway without proxying song files through
-- Vercel's function body-size limit. Only SHA-256 hashes are stored.
create table if not exists audio_tickets (
  token_hash text primary key,
  user_id text not null references "user"(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists audio_tickets_user_id_idx on audio_tickets(user_id);
create index if not exists audio_tickets_expires_at_idx on audio_tickets(expires_at);
