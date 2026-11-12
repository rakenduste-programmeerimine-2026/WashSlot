import {
  buildCycleEndEmail,
  cancelCycleEndEmail,
  scheduleCycleEndEmail,
  type CycleEndEmail,
} from "@/lib/email";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const email = (endsAt: string): CycleEndEmail => ({
  cycleId: "6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b",
  to: "resident@example.com",
  machineLabel: "Washer 3",
  endsAt,
  timezone: "Europe/Tallinn",
});
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

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

test("shows the finish time in the building's timezone", () => {
  // 12:35 UTC is 14:35 in Tallinn in November.
  const { subject, text } = buildCycleEndEmail(email("2026-11-12T12:35:00Z"));
  expect(subject).toBe("Your laundry in Washer 3 is done");
  expect(text).toContain("finished at 14:35");
  expect(text).toContain("collect it as soon as possible");
});

test("escapes the machine label in the HTML version", () => {
  const { html } = buildCycleEndEmail({ ...email(inMinutes(30)), machineLabel: "<b>W1</b>" });
  expect(html).not.toContain("<b>");
  expect(html).toContain("&#60;b&#62;W1");
});

test("schedules the email at the finish time, keyed by cycle id", async () => {
  const endsAt = inMinutes(30);
  await scheduleCycleEndEmail(email(endsAt));
  const [url, init] = fetchMock.mock.calls[0];
  const body = JSON.parse(init.body);
  expect(url).toBe("https://api.brevo.com/v3/smtp/email");
  expect(init.headers["api-key"]).toBe("test-key");
  expect(body).toMatchObject({
    sender: { email: "sender@example.com" },
    to: [{ email: "resident@example.com" }],
    batchId: "6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b",
    scheduledAt: endsAt,
  });
});

test("sends straight away when the finish time is under a minute away", async () => {
  await scheduleCycleEndEmail(email(inMinutes(0.5)));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).scheduledAt).toBeUndefined();
});

test("throws when Brevo rejects the email", async () => {
  fetchMock.mockResolvedValue(new Response("bad key", { status: 401 }));
  await expect(scheduleCycleEndEmail(email(inMinutes(30)))).rejects.toThrow("401");
});

test("cancel deletes by cycle id and ignores 404", async () => {
  await cancelCycleEndEmail("6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b");
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://api.brevo.com/v3/smtp/email/6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b",
  );
  expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");

  fetchMock.mockResolvedValue(new Response("", { status: 404 }));
  await expect(cancelCycleEndEmail("6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b")).resolves.toBeUndefined();
});

test("logs instead of sending when there is no API key", async () => {
  vi.stubEnv("BREVO_API_KEY", "");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await scheduleCycleEndEmail(email(inMinutes(30)));
  await cancelCycleEndEmail("6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(2);
  log.mockRestore();
});
