import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('account administration authorizes, revokes sessions and audits atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec('create table "user"(id text primary key); create table "session"(id text primary key,"userId" text);');
    await db.exec(await readFile(new URL('../migrations/0003_account_controls.sql', import.meta.url), 'utf8'));
    await db.exec("insert into \"user\" values ('owner'),('member'); insert into account_controls(user_id,role) values ('owner','admin'),('member','member'); insert into \"session\" values ('session','member');");
    const act = (actor, target, action) => db.query('select manage_account($1,$2,$3)',[actor,target,action]);
    await assert.rejects(act('member','owner','suspend'), /Administrator access required/);
    await assert.rejects(act('owner','owner','suspend'), /own account/);
    await act('owner','member','suspend');
    assert.equal((await db.query("select status from account_controls where user_id='member'")).rows[0].status,'suspended');
    assert.equal((await db.query('select * from "session"')).rows.length,0);
    await act('owner','member','reactivate');
    await act('owner','member','make_admin');
    assert.equal((await db.query("select role from account_controls where user_id='member'")).rows[0].role,'admin');
    await act('owner','member','make_member');
    await act('owner','member','revoke_sessions');
    await assert.rejects(act('owner','member','invalid'), /Invalid account action/);
    assert.equal((await db.query('select * from account_audit')).rows.length,5);
    await db.exec("update account_controls set status='suspended' where user_id='owner'");
    await assert.rejects(act('owner','member','make_admin'), /Administrator access required/);
  } finally { await db.close(); }
});
