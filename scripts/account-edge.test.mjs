import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(await readFile(new URL('../netlify/edge-functions/_shared/require-account.ts',import.meta.url),'utf8'));
const { requireAccount } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('paid backend guard fails closed for anonymous, suspended, and unavailable sessions', async () => {
 const original = globalThis.fetch;
 const req = (headers={}) => new Request('https://mashuppro.netlify.app/api/stem-upload',{headers});
 try {
  globalThis.fetch = async () => { throw new Error('must not call'); };
  assert.equal((await requireAccount(req())).status,401);
  assert.equal((await requireAccount(req({cookie:'session=fake',origin:'https://elsewhere.example'}))).status,403);
  assert.equal((await requireAccount(req({cookie:'session=fake'}))).status,503);
  globalThis.fetch = async () => Response.json({error:'suspended'},{status:403});
  assert.equal((await requireAccount(req({cookie:'session=fake'}))).status,403);
  globalThis.fetch = async () => new Response('<html>fallback</html>');
  assert.equal((await requireAccount(req({cookie:'session=fake'}))).status,503);
  globalThis.fetch = async (url,options) => {
   assert.equal(url.pathname,'/api/access');
   assert.equal(options.headers.get('cookie'),'session=valid');
   return Response.json({id:'user',status:'active',role:'member'});
  };
  assert.equal(await requireAccount(req({cookie:'session=valid'})),null);
 } finally { globalThis.fetch = original; }
});
