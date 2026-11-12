// Cycle-end emails through Brevo's scheduled sending, so no scheduler of our own is needed.
// Without BREVO_API_KEY (local development), emails are logged instead of sent.

const BREVO = "https://api.brevo.com/v3/smtp/email";

export type CycleEndEmail = {
  cycleId: string; // used as Brevo's batchId, so the email can be cancelled later
  to: string;
  machineLabel: string;
  endsAt: string;
  timezone: string;
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function buildCycleEndEmail(email: CycleEndEmail) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: email.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(email.endsAt));
  const subject = `Your laundry in ${email.machineLabel} is done`;
  const text =
    `Your laundry in ${email.machineLabel} finished at ${time}. ` +
    "Please collect it as soon as possible so the next person can use the machine.";
  return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
}

/** Schedules the email for the cycle's finish time. Throws if Brevo rejects it. */
export async function scheduleCycleEndEmail(email: CycleEndEmail): Promise<void> {
  const { subject, text, html } = buildCycleEndEmail(email);
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[email not sent: no BREVO_API_KEY] to=${email.to} at=${email.endsAt} "${subject}"`);
    return;
  }

  // Brevo only accepts a future send time; anything sooner goes out straight away.
  const sendLater = new Date(email.endsAt).getTime() > Date.now() + 60_000;
  const response = await fetch(BREVO, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "WashSlot", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: email.to }],
      subject,
      textContent: text,
      htmlContent: html,
      batchId: email.cycleId,
      ...(sendLater && { scheduledAt: new Date(email.endsAt).toISOString() }),
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo rejected the email (${response.status}): ${await response.text()}`);
  }
}

/** Cancels the cycle's scheduled email. Fine if it was already sent or never scheduled. */
export async function cancelCycleEndEmail(cycleId: string): Promise<void> {
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
