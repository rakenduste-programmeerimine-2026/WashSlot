// Cycle emails through Brevo. "finished" uses Brevo's scheduled sending, so no scheduler of our own is needed.
// Without BREVO_API_KEY (local development), emails are logged instead of sent.

const BREVO = "https://api.brevo.com/v3/smtp/email";

export type CycleEmailKind = "started" | "cancelled" | "finished";

export type CycleEmail = {
  kind: CycleEmailKind;
  cycleId: string; // the "finished" email's Brevo batchId, so it can be cancelled later
  to: string;
  machineLabel: string;
  endsAt: string;
  timezone: string;
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function buildCycleEmail(email: CycleEmail) {
  const label = email.machineLabel;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: email.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(email.endsAt));

  const { subject, text } = {
    started: {
      subject: `${label} started`,
      text: `You started ${label}. It will finish at ${time}, and we'll email you when it's done.`,
    },
    cancelled: {
      subject: `${label} cancelled`,
      text: `Your cycle on ${label} was cancelled.`,
    },
    finished: {
      subject: `Your laundry in ${label} is done`,
      text:
        `Your laundry in ${label} finished at ${time}. ` +
        "Please collect it as soon as possible so the next person can use the machine.",
    },
  }[email.kind];
  return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
}

/** Sends the email now, or for "finished", schedules it for the finish time. Throws if Brevo rejects it. */
export async function sendCycleEmail(email: CycleEmail): Promise<void> {
  const { subject, text, html } = buildCycleEmail(email);
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[email not sent: no BREVO_API_KEY] ${email.kind} to=${email.to} "${subject}"`);
    return;
  }

  // Brevo only accepts a future send time; anything sooner goes out straight away.
  const scheduled =
    email.kind === "finished" && new Date(email.endsAt).getTime() > Date.now() + 60_000;
  const response = await fetch(BREVO, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "WashSlot", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: email.to }],
      subject,
      textContent: text,
      htmlContent: html,
      ...(email.kind === "finished" && { batchId: email.cycleId }),
      ...(scheduled && { scheduledAt: new Date(email.endsAt).toISOString() }),
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo rejected the email (${response.status}): ${await response.text()}`);
  }
}

/** Cancels the cycle's scheduled "finished" email. Fine if it was already sent or never scheduled. */
export async function cancelFinishedEmail(cycleId: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[email not cancelled: no BREVO_API_KEY] cycle=${cycleId}`);
    return;
  }

  const response = await fetch(`${BREVO}/${cycleId}`, {
    method: "DELETE",
    headers: { "api-key": apiKey, accept: "application/json" },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Brevo could not cancel the email (${response.status}): ${await response.text()}`);
  }
}
