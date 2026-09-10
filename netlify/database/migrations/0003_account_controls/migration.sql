create table if not exists account_controls (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  updated_at timestamptz not null default now()
);
create table if not exists account_audit (
  id bigint generated always as identity primary key,
  actor_id text not null,
  target_id text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists account_audit_created_idx on account_audit(created_at desc);

-- Each mutation and its audit record share one transaction. Direct function
-- calls still require a current active admin stored in account_controls.
create or replace function manage_account(actor text, target text, operation text)
returns void language plpgsql as $$
begin
  lock table account_controls in share row exclusive mode;
  if not exists(select 1 from account_controls where user_id=actor and role='admin' and status='active') then
    raise exception 'Administrator access required';
  end if;
  if actor=target then raise exception 'You cannot change your own account here'; end if;
  if not exists(select 1 from "user" where id=target) then raise exception 'Account not found'; end if;
  insert into account_controls(user_id) values(target) on conflict do nothing;
  case operation
    when 'suspend' then update account_controls set status='suspended',updated_at=now() where user_id=target;
    when 'reactivate' then update account_controls set status='active',updated_at=now() where user_id=target;
    when 'make_admin' then update account_controls set role='admin',updated_at=now() where user_id=target;
    when 'make_member' then update account_controls set role='member',updated_at=now() where user_id=target;
    when 'revoke_sessions' then null;
    else raise exception 'Invalid account action';
  end case;
  if operation in ('suspend','make_member','revoke_sessions') then
    delete from "session" where "userId"=target;
  end if;
  insert into account_audit(actor_id,target_id,action) values(actor,target,operation);
end;
$$;
