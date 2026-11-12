"use client";

import { useCallback, useEffect, useState } from "react";

type Machine = {
  machine_id: string; label: string; type: "washer" | "dryer";
  default_cycle_minutes: number; state: string;
};
type Draft = { label: string; type: "washer" | "dryer"; minutes: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return body as T;
}

const field = "w-full rounded-md border border-zinc-600 bg-transparent p-2";
const empty: Draft = { label: "", type: "washer", minutes: 60 };

export default function AdminMachines() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [adding, setAdding] = useState<Draft>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await api<{ isAdmin: boolean }>("/api/me");
      setIsAdmin(me.isAdmin);
      if (me.isAdmin) setMachines(await api<Machine[]>("/api/machines"));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (okText: string, fn: () => Promise<unknown>) => {
    try { await fn(); setMsg({ ok: true, text: okText }); setEditId(null); await load(); return true; }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
  };

  const patch = (id: string, body: object) =>
    api(`/api/machines/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  const valid = (d: Draft) => d.label.trim().length >= 1 && d.label.trim().length <= 30 && Number.isInteger(d.minutes) && d.minutes >= 5 && d.minutes <= 240;

  if (isAdmin === null) return <p className="py-10 text-zinc-400">Loading…</p>;
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-zinc-800 p-8">
        <h2 className="text-xl font-semibold">Admins only</h2>
        <p className="mt-2 text-zinc-400">Your account can't manage machines. Ask your building admin for access.</p>
      </div>
    );
  }

  return (
    <section className="space-y-8 py-6">
      <header>
        <h1 className="text-3xl font-bold">Manage machines</h1>
        <p className="mt-1 text-zinc-400">Add machines, rename them, or mark one as out of order.</p>
      </header>

      <p role="status" aria-live="polite" className={`min-h-6 text-sm ${msg?.ok ? "text-emerald-300" : "text-red-400"}`}>{msg?.text}</p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-lg font-semibold">Add a machine</h2>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <label className="text-sm">Name
            <input className={field} maxLength={30} placeholder="Washer 6" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
          </label>
          <label className="text-sm">Type
            <select className={`${field} bg-zinc-900`} value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value as Draft["type"] })}>
              <option value="washer">Washer</option>
              <option value="dryer">Dryer</option>
            </select>
          </label>
          <label className="text-sm">Cycle (min)
            <input className={field} type="number" min={5} max={240} value={adding.minutes} onChange={(e) => setAdding({ ...adding, minutes: Number(e.target.value) })} />
          </label>
          <button disabled={!valid(adding)} className="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-40"
            onClick={async () => {
              const ok = await run(`${adding.label.trim()} added.`, () => api("/api/machines", { method: "POST", body: JSON.stringify({ label: adding.label.trim(), type: adding.type, defaultCycleMinutes: adding.minutes }) }));
              if (ok) setAdding(empty);
            }}>
            Add machine
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">Names are 1 to 30 characters and must be unique. Cycles are 5 to 240 minutes.</p>
      </div>

      <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {machines.length === 0 && <li className="p-4 text-zinc-400">No machines yet. Add the first one above.</li>}
        {machines.map((m) => {
          const broken = m.state === "out_of_order";
          const editing = editId === m.machine_id;
          return (
            <li key={m.machine_id} className="p-4">
              {editing ? (
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                  <label className="text-sm">Name
                    <input className={field} maxLength={30} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                  </label>
                  <label className="text-sm">Type
                    <select className={`${field} bg-zinc-900`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Draft["type"] })}>
                      <option value="washer">Washer</option>
                      <option value="dryer">Dryer</option>
                    </select>
                  </label>
                  <label className="text-sm">Cycle (min)
                    <input className={field} type="number" min={5} max={240} value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={!valid(draft)} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                      onClick={() => {
                        const body: Record<string, unknown> = {};
                        if (draft.label.trim() !== m.label) body.label = draft.label.trim();
                        if (draft.type !== m.type) body.type = draft.type;
                        if (draft.minutes !== m.default_cycle_minutes) body.defaultCycleMinutes = draft.minutes;
                        if (Object.keys(body).length === 0) return setEditId(null);
                        run("Changes saved.", () => patch(m.machine_id, body));
                      }}>Save</button>
                    <button className="rounded-lg border border-zinc-600 px-4 py-2 text-sm" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{m.label}</p>
                    <p className="text-sm text-zinc-400">{m.type === "washer" ? "Washer" : "Dryer"}, {m.default_cycle_minutes} min</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${broken ? "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30" : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"}`}>
                      {broken ? "Out of order" : "In service"}
                    </span>
                    <button className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm"
                      onClick={() => { setEditId(m.machine_id); setDraft({ label: m.label, type: m.type, minutes: m.default_cycle_minutes }); }}>
                      Edit
                    </button>
                    <button className={`rounded-lg px-3 py-1.5 text-sm font-medium ${broken ? "bg-emerald-400 text-black" : "bg-amber-400 text-black"}`}
                      onClick={() => run(broken ? `${m.label} is back in service.` : `${m.label} marked out of order.`, () => patch(m.machine_id, { outOfOrder: !broken }))}>
                      {broken ? "Put back in service" : "Mark out of order"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}