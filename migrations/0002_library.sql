-- Per-user After Hours library. user_id is TEXT (Better Auth ids / 'dev-user').
create table if not exists songs (
  id         text not null,
  user_id    text not null,
  payload    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists songs_user_id_idx on songs (user_id);

create table if not exists mash_cuts (
  id         text not null,
  user_id    text not null,
  name_a     text not null,
  name_b     text not null,
  bpm_a      double precision not null,
  bpm_b      double precision not null,
  cue        text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists mash_cuts_user_id_idx on mash_cuts (user_id);
