import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AccountGate } from "@/components/account-gate";
import { listAccounts, updateAccount } from "@/lib/accounts-api";

export const Route = createFileRoute("/admin")({ component: () => <AccountGate admin><Accounts /></AccountGate> });
type Result = Awaited<ReturnType<typeof listAccounts>>;
type Action = "suspend" | "reactivate" | "make_admin" | "make_member" | "revoke_sessions";
function Accounts() {
  const [result, setResult] = useState<Result | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ id: string; email: string; action: Action } | null>(null);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setResult(await listAccounts({ data: { search: query, offset } })); }
    catch { setMessage("Could not load accounts. Check your admin access and try again."); }
    finally { setBusy(false); }
  }, [query, offset]);
  useEffect(() => { void refresh(); }, [refresh]);
  const apply = async () => {
    if (!pending) return;
    setBusy(true); setMessage("");
    try {
      await updateAccount({ data: { userId: pending.id, action: pending.action } });
      setPending(null); setMessage("Account updated."); await refresh();
    } catch { setMessage("Account change failed. Refresh the page and check your permissions."); }
    finally { setBusy(false); }
  };
  const button = "rounded bg-surface-2 px-3 py-2 text-sm disabled:opacity-40";
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-fg">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-muted">Mashup Pro · Admin</p><h1 className="font-display text-4xl">User accounts</h1></div><Link to="/">Back to Mashup Pro</Link></header>
    <form className="flex gap-3" onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(search); }}>
      <input aria-label="Search users by name or email" className="min-w-0 flex-1 rounded bg-surface p-3" placeholder="Search name or email" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} />
      <button className={button} disabled={busy}>Search</button>
      <button type="button" className={button} disabled={busy} onClick={() => void refresh()}>Refresh</button>
    </form>
    {message ? <p role="status">{message}</p> : null}
    {pending ? <section role="alertdialog" aria-modal="false" aria-label="Confirm account change" className="space-y-3 rounded border border-line bg-surface p-5">
      <p>Confirm {pending.action.replaceAll("_", " ")} for <strong>{pending.email}</strong>?</p>
      <p className="text-sm text-muted">Suspending an account or removing admin access also signs the user out.</p>
      <div className="flex gap-3"><button className={button} disabled={busy} onClick={() => void apply()}>Confirm change</button><button className={button} disabled={busy} onClick={() => setPending(null)}>Cancel</button></div>
    </section> : null}
    <div className="overflow-x-auto rounded border border-line"><table className="w-full text-left text-sm"><thead className="bg-surface"><tr>{["User","Role","Status","Active sessions","Actions"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
    <tbody>{result?.accounts.map(account => <tr className="border-t border-line" key={account.id}>
      <td className="p-3"><p>{account.name}</p><p className="text-muted">{account.email}</p><p className="text-xs text-muted">Joined {new Date(account.created).toLocaleDateString()}</p></td>
      <td className="p-3">{account.role}</td><td className="p-3">{account.status}</td><td className="p-3">{account.sessions}</td>
      <td className="p-3">{result.protectedIds.includes(account.id) ? <span className="text-muted">Protected admin</span> : <div className="flex flex-wrap gap-2">{([
        [account.status === "active" ? "suspend" : "reactivate", account.status === "active" ? "Suspend" : "Reactivate"],
        [account.role === "admin" ? "make_member" : "make_admin", account.role === "admin" ? "Remove admin" : "Make admin"],
        ["revoke_sessions", "Sign out everywhere"],
      ] as [Action,string][]).map(([action,label]) => <button key={action} className={button} disabled={busy} onClick={() => setPending({ id: account.id, email: account.email, action })}>{label}</button>)}</div>}</td>
    </tr>)}</tbody></table></div>
    {!busy && result?.accounts.length === 0 ? <p>No accounts match your search.</p> : null}
    <footer className="flex gap-3"><button className={button} disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0,offset-50))}>Previous</button><button className={button} disabled={busy || !result?.hasMore} onClick={() => setOffset(offset+50)}>Next</button></footer>
  </main>;
}
