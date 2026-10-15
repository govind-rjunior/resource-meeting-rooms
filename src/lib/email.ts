import { Resend } from "resend";
import nodemailer from "nodemailer";

interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

// Transport is chosen from the environment, in this order:
//   1. Gmail SMTP  (GMAIL_USER + GMAIL_APP_PASSWORD): sends from that Gmail
//      address, e.g. the front desk mailbox. Needs 2-step verification and an
//      app password on the Google account. Free Gmail caps at ~500 recipients
//      a day, which is plenty for one meeting room.
//   2. Resend      (RESEND_API_KEY + EMAIL_FROM on a verified domain).
//   3. Neither     -> the email is printed to the server log (development).
export async function sendMail(mail: Mail): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const resendKey = process.env.RESEND_API_KEY;
  const fromName = process.env.EMAIL_FROM_NAME || "Meeting Room";

  if (gmailUser && gmailPass) {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
    try {
      await transport.sendMail({
        from: `"${fromName}" <${gmailUser}>`,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        replyTo: mail.replyTo,
      });
    } catch (e) {
      console.error("[email:gmail:error]", (e as Error).message);
    }
    return;
  }

  if (resendKey) {
    const from = process.env.EMAIL_FROM || `${fromName} <onboarding@resend.dev>`;
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      replyTo: mail.replyTo,
    });
    if (error) console.error("[email:resend:error]", error);
    return;
  }

  console.log("[email:dev]", JSON.stringify({ to: mail.to, subject: mail.subject, html: mail.html }, null, 2));
}

// ---- templates ----------------------------------------------------------

/** Escape user-typed strings before they go into email HTML. */
export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const wrap = (title: string, body: string) => `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.5">
  <h2 style="margin:0 0 16px;font-size:20px">${title}</h2>
  ${body}
  <p style="margin-top:32px;font-size:12px;color:#777">Sent by the meeting room booking system. Reply to this email to reach the front desk.</p>
</div>`;

const btn = (href: string, label: string, color = "#1f6feb") =>
  `<a href="${href}" style="display:inline-block;padding:10px 18px;margin:6px 8px 6px 0;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${label}</a>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${k}</td><td style="padding:4px 0">${v}</td></tr>`;

export interface BookingSummary {
  who: string;
  company?: string | null;
  office?: string | null;
  email?: string | null;
  phone?: string | null;
  when: string;
  room: string;
  hours: number;
  freeHours?: number;
  paidHours?: number;
  charge?: number;
  kind: string;
}

export function summaryTable(s: BookingSummary): string {
  const rows = [
    row("Room", esc(s.room)),
    row("When", esc(s.when)),
    row("Booked by", esc(s.who) + (s.company ? ` (${esc(s.company)})` : "")),
    s.office ? row("Office", esc(s.office)) : "",
    s.email ? row("Email", esc(s.email)) : "",
    s.phone ? row("Phone", esc(s.phone)) : "",
    row("Duration", `${s.hours} hour${s.hours === 1 ? "" : "s"}`),
    s.kind === "external" ? row("Type", "External (non-member)") : "",
  ].join("");
  return `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>`;
}

export function tplVerify(p: { name: string; verifyUrl: string; summary: BookingSummary }) {
  return wrap(
    "Confirm your email to send this request",
    `<p>Hi ${esc(p.name)}, one click confirms this email address is yours. After that your request goes to the front desk. The slot is held for you for 45 minutes while you confirm.</p>
     ${summaryTable(p.summary)}
     ${btn(p.verifyUrl, "Confirm my email")}
     <p style="font-size:13px;color:#666">If you did not request this, ignore this email and nothing is booked.</p>`
  );
}

export function tplRequestReceived(p: { name: string; summary: BookingSummary; cancelUrl: string }) {
  return wrap(
    "Request received, waiting for the front desk",
    `<p>Hi ${esc(p.name)}, your request is with the front desk. The slot is held for you until they confirm or reject it. You will get another email either way.</p>
     ${summaryTable(p.summary)}
     <p style="font-size:13px;color:#666">Changed your mind? ${btn(p.cancelUrl, "Cancel this request", "#888")}</p>`
  );
}

export function tplAdminRequest(p: {
  summary: BookingSummary;
  confirmUrl: string;
  rejectUrl: string;
  adminUrl: string;
  newPerson: boolean;
  typedCompany?: string | null;
}) {
  const newNote = p.newPerson
    ? `<p style="padding:10px 12px;background:#fff6d6;border-radius:6px"><b>New booker.</b> This email address has not booked before. Confirming also links them to a tenant: open the request in the admin page to pick the tenant (or create one) before confirming.${
        p.typedCompany ? ` They typed company: <b>${esc(p.typedCompany)}</b>.` : ""
      }</p>`
    : "";
  return wrap(
    `Meeting room request: ${esc(p.summary.who)}, ${esc(p.summary.when)}`,
    `${newNote}
     ${summaryTable(p.summary)}
     ${p.newPerson ? btn(p.adminUrl, "Open in admin") : btn(p.confirmUrl, "Confirm", "#1a7f37") + btn(p.rejectUrl, "Reject", "#b42318")}
     <p style="font-size:13px;color:#666">The slot is held until you decide. If nobody decides before the slot starts, it expires and frees up.</p>`
  );
}

export function tplConfirmed(p: {
  name: string;
  summary: BookingSummary;
  cancelUrl: string;
  cutoffMinutes: number;
}) {
  const s = p.summary;
  const money =
    s.kind === "external"
      ? `<p>Charge: <b>₹${Math.round(s.charge ?? 0).toLocaleString("en-IN")}</b> (${s.hours} h at the external rate), payable at the front desk.</p>`
      : (s.paidHours ?? 0) > 0
        ? `<p>${s.freeHours} h from your free hours this month, ${s.paidHours} h chargeable: <b>₹${Math.round(s.charge ?? 0).toLocaleString("en-IN")}</b>.</p>`
        : `<p>Covered by your free hours this month.</p>`;
  return wrap(
    "Room allotted",
    `<p>Hi ${esc(p.name)}, the front desk has confirmed your booking.</p>
     ${summaryTable(s)}
     ${money}
     <p style="font-size:13px;color:#666">Need to cancel? Free up to ${p.cutoffMinutes} minutes before the start. ${btn(p.cancelUrl, "Cancel booking", "#888")}</p>`
  );
}

export function tplRejected(p: { name: string; summary: BookingSummary; reason?: string | null }) {
  return wrap(
    "Request not confirmed",
    `<p>Hi ${esc(p.name)}, the front desk could not confirm this request${p.reason ? `: ${esc(p.reason)}` : "."}</p>
     ${summaryTable(p.summary)}
     <p>The slot has been released. You are welcome to request another time.</p>`
  );
}

export function tplExpired(p: { name: string; summary: BookingSummary }) {
  return wrap(
    "Request expired",
    `<p>Hi ${esc(p.name)}, nobody at the front desk acted on this request before the slot's start time, so it has expired and the slot was released. Sorry about that. Please call the desk or request another time.</p>
     ${summaryTable(p.summary)}`
  );
}

export function tplCancelled(p: { name: string; summary: BookingSummary; byAdmin: boolean }) {
  return wrap(
    p.byAdmin ? "Booking cancelled by the front desk" : "Booking cancelled",
    `<p>Hi ${esc(p.name)}, this booking has been cancelled and the slot released.</p>
     ${summaryTable(p.summary)}`
  );
}

export function tplImpersonationWarning(p: { name: string; summary: BookingSummary; frontDesk: string }) {
  return wrap(
    "Someone tried to book in your name",
    `<p>Hi ${esc(p.name)}, a booking request was submitted with your office and name but a different email address. It was refused and nothing was booked. If this was you from another address, use your registered email. If not, tell the front desk at ${esc(p.frontDesk)}.</p>
     ${summaryTable(p.summary)}`
  );
}
