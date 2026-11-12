"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = "free" | "in_use" | "awaiting_collection" | "reserved" | "out_of_order";
type Machine = {
  machine_id: string; label: string; type: "washer" | "dryer"; default_cycle_minutes: number;
  state: State; current_cycle_id: string | null; current_user_id: string | null;
  cycle_started_at: string | null; estimated_finish_at: string | null;
  next_booking_starts_at: string | null; next_booking_ends_at: string | null;
};
type Booking = { id: string; machine_id: string; starts_at: string; ends_at: string };
type Me = { isAdmin: boolean; building: { id: string; name: string; timezone: string } | null };

const LOOK: Record<State, { text: string; pill: string; bar: string }> = {
  free: { text: "Free", pill: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30", bar: "bg-emerald-400" },
  in_use: { text: "Running", pill: "bg-sky-500/15 text-sky-300 ring-sky-500/30", bar: "bg-sky-400" },
  awaiting_collection: { text: "Ready to collect", pill: "bg-amber-500/15 text-amber-300 ring-amber-500/30", bar: "bg-amber-400" },
  reserved: { text: "Booked now", pill: "bg-violet-500/15 text-violet-300 ring-violet-500/30", bar: "bg-violet-400" },
  out_of_order: { text: "Out of order", pill: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30", bar: "bg-zinc-500" },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return body as T;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function MachineBoard({ userId }: { userId?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [kind, setKind] = useState<"all" | "washer" | "dryer">("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: "start" | "book" } | null>(null);
  const [minutes, setMinutes] = useState<number | undefined>();
  const [slot, setSlot] = useState("");
  const [duration, setDuration] = useState(60);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const m = await api<Me>("/api/me");
      setMe(m);
      if (m.building) {
        const [ms, bs] = await Promise.all([api<Machine[]>("/api/machines"), api<Booking[]>("/api/bookings")]);
        setMachines(ms);
        setBookings(bs);
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [load]);

  // A cycle that just ended changes state without any database change: refetch once.
  useEffect(() => {
    const ended = machines.some((m) => m.state === "in_use" && m.estimated_finish_at && Date.parse(m.estimated_finish_at) <= now);
    if (ended && Date.now() - lastLoad.current > 5000) load();
  }, [now, machines, load]);

  const run = async (okText: string, fn: () => Promise<unknown>) => {
    try { await fn(); setMsg({ ok: true, text: okText }); setOpen(null); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };

  if (!loaded) return <p className="py-10 text-zinc-400">Loading machines…</p>;
  if (!me?.building) {
    return (
      <div className="rounded-xl border border-zinc-800 p-8 text-center">
        <h2 className="text-xl font-semibold">Join your building first</h2>
        <p className="mt-2 text-zinc-400">Enter your building code to see its machines.</p>
        <a href="/join" className="mt-4 inline-block rounded-lg bg-white px-4 py-2 font-medium text-black">Enter building code</a>
      </div>
    );
  }

  const tz = me.building.timezone;
  const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  const free = machines.filter((m) => m.state === "free");
  const soonest = machines
    .filter((m) => m.state === "in_use" && m.estimated_finish_at)
    .sort((a, b) => Date.parse(a.estimated_finish_at!) - Date.parse(b.estimated_finish_at!))[0];
  const shown = machines.filter((m) => (kind === "all" || m.type === kind) && (!freeOnly || m.state === "free"));
  const label = (id: string) => machines.find((m) => m.machine_id === id)?.label ?? "Machine";
  const mine = (m: Machine) => !userId || m.current_user_id === userId;

  const slots = (() => {
    const t0 = Math.ceil((Date.now() + 60000) / 1800000) * 1800000;
    return Array.from({ length: 48 }, (_, i) => new Date(t0 + i * 1800000).toISOString());
  })();

  return (
    <section className="space-y-6 py-6">
      <header>
        <h1 className="text-3xl font-bold">
          {free.length === 0 ? "All machines are busy" : `${free.length} of ${machines.length} machines free`}
        </h1>
        <p className="mt-1 text-zinc-400">
          {free.length === 0 && soonest
            ? `${soonest.label} finishes in ${mmss(Date.parse(soonest.estimated_finish_at!) - now)}. Book a slot so you don't walk down for nothing.`
            : `${me.building.name}. Updates live.`}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter machines">
        {(["all", "washer", "dryer"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`rounded-full px-4 py-2 text-sm ${kind === k ? "bg-white text-black" : "border border-zinc-700 text-zinc-300"}`}>
            {k === "all" ? "All" : k === "washer" ? "Washers" : "Dryers"}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="size-4" />
          Free only
        </label>
      </div>

      <p role="status" aria-live="polite" className={`min-h-6 text-sm ${msg?.ok ? "text-emerald-300" : "text-red-400"}`}>{msg?.text}</p>

      {shown.length === 0 && <p className="text-zinc-400">No machines match. Turn off a filter to see more.</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => {
          const look = LOOK[m.state];
          const start = m.cycle_started_at ? Date.parse(m.cycle_started_at) : 0;
          const end = m.estimated_finish_at ? Date.parse(m.estimated_finish_at) : 0;
          const pct = m.state === "in_use" && end > start ? Math.min(100, ((now - start) / (end - start)) * 100) : m.state === "awaiting_collection" ? 100 : 0;
          const isOpen = open?.id === m.machine_id;
          return (
            <li key={m.machine_id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{m.label}</h2>
                  <p className="text-sm text-zinc-400">{m.type === "washer" ? "Washer" : "Dryer"}, {m.default_cycle_minutes} min</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${look.pill}`}>{look.text}</span>
              </div>

              {m.state === "in_use" && (
                <p className="text-4xl font-bold tabular-nums">{mmss(end - now)}</p>
              )}
              {m.state === "awaiting_collection" && (
                <p className="text-lg font-semibold text-amber-300">Collect within {mmss(end + 15 * 60000 - now)}</p>
              )}
              {m.state === "free" && <p className="text-lg text-emerald-300">Ready to use</p>}
              {m.state === "reserved" && <p className="text-lg text-violet-300">Booked until {m.next_booking_ends_at ? clock(m.next_booking_ends_at) : "later"}</p>}
              {m.state === "out_of_order" && <p className="text-zinc-400">Not available. Ask your building admin.</p>}

              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
                <div className={`h-full ${look.bar} transition-[width] duration-1000 ease-linear`} style={{ width: `${pct}%` }} />
              </div>

              {m.next_booking_starts_at && m.state !== "reserved" && (
                <p className="text-sm text-zinc-400">Next booking {clock(m.next_booking_starts_at)} to {clock(m.next_booking_ends_at!)}</p>
              )}

              {isOpen && open.mode === "start" && (
                <div className="space-y-2 rounded-lg bg-zinc-800/60 p-3">
                  <p className="text-sm">Cycle length</p>
                  <div className="flex flex-wrap gap-2">
                    {[undefined, 30, 45, 60, 90].map((v) => (
                      <button key={v ?? "d"} onClick={() => setMinutes(v)} aria-pressed={minutes === v}
                        className={`rounded-md px-3 py-1.5 text-sm ${minutes === v ? "bg-white text-black" : "border border-zinc-600"}`}>
                        {v ? `${v} min` : `Default (${m.default_cycle_minutes})`}
                      </button>
                    ))}
                  </div>
                  <button className="w-full rounded-lg bg-emerald-400 py-2 font-medium text-black"
                    onClick={() => run("Cycle started. We'll email you when it's done.", () => api("/api/cycles", { method: "POST", body: JSON.stringify({ machineId: m.machine_id, minutes }) }))}>
                    Start cycle
                  </button>
                </div>
              )}

              {isOpen && open.mode === "book" && (
                <div className="space-y-2 rounded-lg bg-zinc-800/60 p-3">
                  <label className="block text-sm">Start time
                    <select value={slot} onChange={(e) => setSlot(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 p-2">
                      <option value="">Choose a time</option>
                      {slots.map((s) => <option key={s} value={s}>{clock(s)}{new Date(s).getDate() !== new Date().getDate() ? " (tomorrow)" : ""}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">Length
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 p-2">
                      {[30, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </label>
                  <button disabled={!slot} className="w-full rounded-lg bg-violet-400 py-2 font-medium text-black disabled:opacity-40"
                    onClick={() => run("Slot booked.", () => api("/api/bookings", { method: "POST", body: JSON.stringify({ machineId: m.machine_id, startsAt: slot, endsAt: new Date(Date.parse(slot) + duration * 60000).toISOString() }) }))}>
                    Book slot
                  </button>
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2">
                {m.state !== "out_of_order" && (m.state === "free" || m.state === "reserved") && (
                  <button onClick={() => { setOpen(isOpen && open.mode === "start" ? null : { id: m.machine_id, mode: "start" }); setMinutes(undefined); }}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">Start cycle</button>
                )}
                {m.state !== "out_of_order" && (
                  <button onClick={() => setOpen(isOpen && open.mode === "book" ? null : { id: m.machine_id, mode: "book" })}
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm">Book a slot</button>
                )}
                {m.current_cycle_id && mine(m) && (m.state === "awaiting_collection" || m.state === "in_use") && (
                  <button onClick={() => run(m.state === "in_use" ? "Cycle cancelled." : "Marked as collected. Thanks!", () => api(`/api/cycles/${m.current_cycle_id}/release`, { method: "POST", body: JSON.stringify({ reason: m.state === "in_use" ? "cancelled" : "collected" }) }))}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${m.state === "awaiting_collection" ? "bg-amber-400 text-black" : "border border-zinc-600"}`}>
                    {m.state === "in_use" ? "Cancel my cycle" : "I've collected it"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {bookings.length > 0 && (
        <div>
          <h2 className="mb-2 text-xl font-semibold">Your bookings</h2>
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 p-4">
                <span>{label(b.machine_id)}, {clock(b.starts_at)} to {clock(b.ends_at)}</span>
                <button onClick={() => run("Booking cancelled.", () => api(`/api/bookings/${b.id}`, { method: "DELETE" }))}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm">Cancel booking</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}