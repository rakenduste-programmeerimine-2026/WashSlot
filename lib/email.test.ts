import {
  buildCycleEmail,
  cancelFinishedEmail,
  sendCycleEmail,
  type CycleEmail,
} from "@/lib/email";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const CYCLE_ID = "6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b";
const email = (endsAt: string): CycleEmail => ({
  cycleId: CYCLE_ID,
  to: "resident@example.com",
  machineLabel: "Washer 3",
  endsAt,
  timezone: "Europe/Tallinn",
});
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BREVO_API_KEY", "test-key");
  vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.com");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// 12:35 UTC is 14:35 in Tallinn in November.
const ENDS = "2026-11-12T12:35:00Z";

test("email asks the owner to collect, with the time in the building's timezone", () => {
  const { subject, text } = buildCycleEmail(email(ENDS));
  expect(subject).toBe("Your laundry in Washer 3 is done");
  expect(text).toContain("finished at 14:35");
  expect(text).toContain("collect it as soon as possible");
});

test("escapes the machine label in the HTML version", () => {
  const { html } = buildCycleEmail({ ...email(ENDS), machineLabel: "<b>W1</b>" });
  expect(html).not.toContain("<b>");
  expect(html).toContain("&#60;b&#62;W1");
});

test("is scheduled at the finish time, keyed by cycle id", async () => {
  const endsAt = inMinutes(30);
  await sendCycleEmail(email(endsAt));
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.brevo.com/v3/smtp/email");
  expect(fetchMock.mock.calls[0][1].headers["api-key"]).toBe("test-key");
  expect(sentBody()).toMatchObject({
    sender: { email: "sender@example.com" },
    to: [{ email: "resident@example.com" }],
    batchId: CYCLE_ID,
    scheduledAt: endsAt,
  });
});

test("goes out straight away when under a minute away", async () => {
  await sendCycleEmail(email(inMinutes(0.5)));
  expect(sentBody().scheduledAt).toBeUndefined();
});

test("throws when Brevo rejects the email", async () => {
  fetchMock.mockResolvedValue(new Response("bad key", { status: 401 }));
  await expect(sendCycleEmail(email(inMinutes(30)))).rejects.toThrow("401");
});

test("cancel deletes by cycle id and ignores 404", async () => {
  await cancelFinishedEmail(CYCLE_ID);
  expect(fetchMock.mock.calls[0][0]).toBe(`https://api.brevo.com/v3/smtp/email/${CYCLE_ID}`);
  expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");

  fetchMock.mockResolvedValue(new Response("", { status: 404 }));
  await expect(cancelFinishedEmail(CYCLE_ID)).resolves.toBeUndefined();
});

test("logs instead of sending when there is no API key", async () => {
  vi.stubEnv("BREVO_API_KEY", "");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await sendCycleEmail(email(inMinutes(30)));
  await cancelFinishedEmail(CYCLE_ID);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(2);
  log.mockRestore();
});
