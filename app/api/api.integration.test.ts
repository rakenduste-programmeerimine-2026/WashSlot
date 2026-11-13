// Calls the real /api route handlers against local Supabase (`npx supabase start`), signing in with Bearer tokens.
// Run with `npm run test:integration`. Creates throwaway users and a test machine, then deletes them.
import { DELETE as cancelBookingRoute } from "@/app/api/bookings/[id]/route";
import { GET as listBookings, POST as createBooking } from "@/app/api/bookings/route";
import { POST as releaseCycle } from "@/app/api/cycles/[id]/release/route";
import { POST as startCycle } from "@/app/api/cycles/route";
import { PATCH as updateMachine } from "@/app/api/machines/[id]/route";
import { GET as listMachines, POST as addMachine } from "@/app/api/machines/route";
import { GET as me } from "@/app/api/me/route";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Brevo is mocked: calls to it are recorded and answered with brevoStatus; everything else hits real Supabase.
const realFetch = globalThis.fetch;
const brevoCalls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let brevoStatus = 201;
vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.brevo.com/")) return realFetch(input, init);
  brevoCalls.push({
    url,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : null,
  });
  return new Response("{}", { status: brevoStatus });
});
process.env.BREVO_API_KEY = "test-key";
process.env.BREVO_SENDER_EMAIL = "sender@example.com";

// Route handlers read the request headers through next/headers; point it at the request being made.
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const status = (() => {
  const out = execSync("npx supabase status -o json", { encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("{"))) as {
    API_URL: string;
    PUBLISHABLE_KEY: string;
    SECRET_KEY: string;
  };
})();
process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
const service = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } });

const run = Date.now();
const userIds: string[] = [];
const token: Record<"admin" | "alice" | "bob", string> = { admin: "", alice: "", bob: "" };
let machineId: string;

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function call(
  handler: Handler,
  opts: { as?: keyof typeof token; body?: unknown; id?: string; rawBody?: string } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.as) headers.set("authorization", `Bearer ${token[opts.as]}`);
  requestHeaders = headers;
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  const response = await handler(
    new Request("http://localhost/api/test", { method: body ? "POST" : "GET", headers, body }),
    { params: Promise.resolve({ id: opts.id ?? "" }) },
  );
  return { status: response.status, json: await response.json() };
}

async function makeUser(name: keyof typeof token) {
  const email = `it-${name}-${run}@example.com`;
  const password = "integration-password-123";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const client: SupabaseClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const join = await client.rpc("join_building", { code: "DEMO2026" });
  if (join.error) throw join.error;
  token[name] = signIn.data.session.access_token;
  return data.user.id;
}

const stateOf = async () =>
  (await call(listMachines, { as: "alice" })).json.find(
    (m: { machine_id: string }) => m.machine_id === machineId,
  )?.state;

beforeAll(async () => {
  const adminId = await makeUser("admin");
  await makeUser("alice");
  await makeUser("bob");
  const promote = await service.from("profiles").update({ role: "admin" }).eq("id", adminId);
  if (promote.error) throw promote.error;
}, 60_000);

afterAll(async () => {
  if (machineId) await service.from("machines").delete().eq("id", machineId);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
});

describe("auth and request checks", () => {
  test("no token or a bad token gives 401", async () => {
    expect(await call(listMachines)).toEqual({ status: 401, json: { error: "Not logged in." } });
    requestHeaders = new Headers({ authorization: "Bearer not-a-real-token" });
    const response = await listMachines(new Request("http://localhost/api/machines"), {
      params: Promise.resolve({ id: "" }),
    });
    expect(response.status).toBe(401);
  });

  test("non-JSON bodies are rejected", async () => {
    expect((await call(startCycle, { as: "alice", rawBody: "not json" })).status).toBe(400);
  });

  test("GET /api/me returns building and admin flag", async () => {
    const alice = await call(me, { as: "alice" });
    expect(alice.status).toBe(200);
    expect(alice.json).toMatchObject({ isAdmin: false, building: { timezone: "Europe/Tallinn" } });
    expect((await call(me, { as: "admin" })).json.isAdmin).toBe(true);
  });
});

describe("machines", () => {
  const label = `IT ${run}`.slice(0, 30);

  test("residents get 403 when adding", async () => {
    const result = await call(addMachine, {
      as: "alice",
      body: { label: "IT nope", type: "washer", defaultCycleMinutes: 30 },
    });
    expect(result).toEqual({ status: 403, json: { error: "Not allowed." } });
  });

  test("invalid input gives 400", async () => {
    const bad = [
      { label: "", type: "washer", defaultCycleMinutes: 30 },
      { label: "IT x", type: "oven", defaultCycleMinutes: 30 },
      { label: "IT x", type: "washer", defaultCycleMinutes: 3 },
    ];
    for (const body of bad) expect((await call(addMachine, { as: "admin", body })).status).toBe(400);
    expect((await call(updateMachine, { as: "admin", id: "nope", body: { label: "x" } })).status).toBe(400);
  });

  test("admin adds a machine (201) and it shows as free", async () => {
    const result = await call(addMachine, {
      as: "admin",
      body: { label, type: "washer", defaultCycleMinutes: 30 },
    });
    expect(result.status).toBe(201);
    machineId = result.json.id;
    expect(await stateOf()).toBe("free");
  });

  test("duplicate labels give 409", async () => {
    const result = await call(addMachine, {
      as: "admin",
      body: { label, type: "dryer", defaultCycleMinutes: 30 },
    });
    expect(result).toEqual({ status: 409, json: { error: "A machine with this label already exists." } });
  });

  test("residents get 404 when updating", async () => {
    const result = await call(updateMachine, { as: "alice", id: machineId, body: { outOfOrder: true } });
    expect(result).toEqual({ status: 404, json: { error: "Not allowed or not found." } });
  });

  test("out-of-order machines can't be started", async () => {
    expect((await call(updateMachine, { as: "admin", id: machineId, body: { outOfOrder: true } })).status).toBe(200);
    expect(await stateOf()).toBe("out_of_order");
    const start = await call(startCycle, { as: "alice", body: { machineId, minutes: 30 } });
    expect(start).toEqual({ status: 409, json: { error: "Machine is out of order" } });
    expect((await call(updateMachine, { as: "admin", id: machineId, body: { outOfOrder: false } })).status).toBe(200);
  });
});

describe("cycles", () => {
  let cycleId: string;

  test("invalid minutes give 400", async () => {
    for (const minutes of [4, 241, "30"]) {
      expect((await call(startCycle, { as: "alice", body: { machineId, minutes } })).status).toBe(400);
    }
  });

  test("start (201), then the machine is in use", async () => {
    const result = await call(startCycle, { as: "alice", body: { machineId, minutes: 30 } });
    expect(result.status).toBe(201);
    cycleId = result.json.id;
    expect(await stateOf()).toBe("in_use");
  });

  test("a busy machine gives 409", async () => {
    const result = await call(startCycle, { as: "bob", body: { machineId } });
    expect(result).toEqual({ status: 409, json: { error: "Machine is already in use" } });
  });

  test("only the owner can release a cycle", async () => {
    const bob = await call(releaseCycle, { as: "bob", id: cycleId, body: { reason: "cancelled" } });
    expect(bob).toEqual({ status: 404, json: { error: "Active cycle not found" } });
    const bad = await call(releaseCycle, { as: "alice", id: cycleId, body: { reason: "nope" } });
    expect(bad.status).toBe(400);
    const alice = await call(releaseCycle, { as: "alice", id: cycleId, body: { reason: "cancelled" } });
    expect(alice.status).toBe(200);
    expect(await stateOf()).toBe("free");
  });
});

describe("bookings", () => {
  let bookingId: string;
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  test("invalid times give 400", async () => {
    const result = await call(createBooking, {
      as: "alice",
      body: { machineId, startsAt: "tomorrow", endsAt: inHours(2) },
    });
    expect(result.status).toBe(400);
  });

  test("book a slot (201) and see it in GET /api/bookings", async () => {
    const result = await call(createBooking, {
      as: "alice",
      body: { machineId, startsAt: inHours(1), endsAt: inHours(2) },
    });
    expect(result.status).toBe(201);
    bookingId = result.json.id;
    const mine = await call(listBookings, { as: "alice" });
    expect(mine.json.map((b: { id: string }) => b.id)).toContain(bookingId);
    expect((await call(listBookings, { as: "bob" })).json).toEqual([]);
  });

  test("another resident can't start into the booking", async () => {
    const result = await call(startCycle, { as: "bob", body: { machineId, minutes: 90 } });
    expect(result).toEqual({ status: 409, json: { error: "Machine is booked by another resident" } });
  });

  test("only the owner can cancel a booking", async () => {
    const bob = await call(cancelBookingRoute, { as: "bob", id: bookingId });
    expect(bob).toEqual({ status: 404, json: { error: "Booking not found" } });
    expect((await call(cancelBookingRoute, { as: "alice", id: bookingId })).status).toBe(200);
    expect((await call(listBookings, { as: "alice" })).json).toEqual([]);
  });
});

describe("email notifications", () => {
  const sent = (subjectPart: string) =>
    brevoCalls.filter((c) => c.method === "POST" && String(c.body?.subject).includes(subjectPart));

  async function startAsAlice() {
    brevoCalls.length = 0;
    const start = await call(startCycle, { as: "alice", body: { machineId, minutes: 30 } });
    expect(start.status).toBe(201);
    return start.json;
  }

  test("starting sends 'started' now and schedules 'done' for the finish time", async () => {
    const cycle = await startAsAlice();
    expect(brevoCalls).toHaveLength(2);

    const [started] = sent("started");
    expect(started.body).toMatchObject({ to: [{ email: `it-alice-${run}@example.com` }] });
    expect(started.body?.scheduledAt).toBeUndefined();

    const [done] = sent("is done");
    expect(done.body).toMatchObject({
      to: [{ email: `it-alice-${run}@example.com` }],
      batchId: cycle.id,
      scheduledAt: new Date(cycle.ends_at).toISOString(),
    });

    // Leave the machine free for the next test.
    await call(releaseCycle, { as: "alice", id: cycle.id, body: { reason: "collected" } });
  });

  test("collecting only cancels the 'done' email", async () => {
    const cycle = await startAsAlice();
    brevoCalls.length = 0;
    const release = await call(releaseCycle, { as: "alice", id: cycle.id, body: { reason: "collected" } });
    expect(release.status).toBe(200);
    expect(brevoCalls).toEqual([
      { url: `https://api.brevo.com/v3/smtp/email/${cycle.id}`, method: "DELETE", body: null },
    ]);
  });

  test("cancelling cancels the 'done' email and sends 'cancelled'", async () => {
    const cycle = await startAsAlice();
    brevoCalls.length = 0;
    const release = await call(releaseCycle, { as: "alice", id: cycle.id, body: { reason: "cancelled" } });
    expect(release.status).toBe(200);
    expect(brevoCalls).toHaveLength(2);
    expect(brevoCalls[0]).toMatchObject({
      url: `https://api.brevo.com/v3/smtp/email/${cycle.id}`,
      method: "DELETE",
    });
    const [cancelled] = sent("cancelled");
    expect(cancelled.body).toMatchObject({ to: [{ email: `it-alice-${run}@example.com` }] });
    expect(cancelled.body?.scheduledAt).toBeUndefined();
  });

  test("a failed or rejected start sends no email", async () => {
    brevoCalls.length = 0;
    expect((await call(startCycle, { as: "alice", body: { machineId, minutes: 4 } })).status).toBe(400);
    expect(brevoCalls).toHaveLength(0);
  });

  test("a Brevo failure doesn't stop the cycle starting or releasing", async () => {
    brevoStatus = 500;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const start = await call(startCycle, { as: "bob", body: { machineId, minutes: 30 } });
      expect(start.status).toBe(201);
      expect(await stateOf()).toBe("in_use");
      const release = await call(releaseCycle, { as: "bob", id: start.json.id, body: { reason: "cancelled" } });
      expect(release.status).toBe(200);
      expect(error).toHaveBeenCalled();
    } finally {
      brevoStatus = 201;
      error.mockRestore();
    }
  });
});
