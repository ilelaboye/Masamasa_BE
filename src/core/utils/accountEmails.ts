import { capitalizeString, INVITE_EXPIRY_HOURS } from "../helpers";
import { sendZohoMail } from "./mailer";

type EmailUser = {
  first_name?: string;
  last_name?: string;
  email: string;
};

/** Lagos-time timestamp for security emails. */
function nowInLagos(): string {
  return new Date().toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shell(greetingName: string, body: string): string {
  return `<p>Hello ${capitalizeString(greetingName || "there")},</p>${body}
    <p style="margin-top:24px">— The MasaMasa Team</p>`;
}

/**
 * Security alert sent on every successful sign-in. Fire-and-forget: a mail
 * failure must never block a login.
 */
export function sendLoginAlertEmail(
  user: EmailUser,
  context: { device?: string; ip?: string } = {},
) {
  const details = [
    `<li><b>Time:</b> ${nowInLagos()} (WAT)</li>`,
    context.device ? `<li><b>Device:</b> ${context.device}</li>` : "",
    context.ip ? `<li><b>IP address:</b> ${context.ip}</li>` : "",
  ].join("");

  sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: "New login to your MasaMasa account",
      html: shell(
        user.first_name ?? "",
        `<p>We noticed a new sign-in to your MasaMasa account.</p>
         <ul>${details}</ul>
         <p>If this was you, no action is needed. <b>If you do not recognise this login, change your password immediately and contact support.</b></p>`,
      ),
    },
  ).catch(() => {});
}

/** Confirmation that the account password was changed. */
export function sendPasswordChangedEmail(user: EmailUser) {
  sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: "Your MasaMasa password was changed",
      html: shell(
        user.first_name ?? "",
        `<p>Your account password was changed on <b>${nowInLagos()} (WAT)</b>.</p>
         <p><b>If you did not make this change, contact our support team immediately</b> — your account may be at risk.</p>`,
      ),
    },
  ).catch(() => {});
}

/** Confirmation that the transaction PIN was changed. */
export function sendPinChangedEmail(user: EmailUser) {
  sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: "Your MasaMasa transaction PIN was changed",
      html: shell(
        user.first_name ?? "",
        `<p>Your transaction PIN was changed on <b>${nowInLagos()} (WAT)</b>.</p>
         <p>This PIN authorises transfers and withdrawals from your wallet.</p>
         <p><b>If you did not make this change, contact our support team immediately</b> — your account may be at risk.</p>`,
      ),
    },
  ).catch(() => {});
}

/** Confirmation that a bank withdrawal was paid out successfully. */
export function sendWithdrawalSuccessEmail(
  user: EmailUser,
  details: {
    amount: number;
    bankName?: string;
    accountNumber?: string;
    reference?: string;
  },
) {
  const amount = `NGN ${Number(details.amount ?? 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Only the last 4 digits of the account number are ever shown.
  const maskedAccount = details.accountNumber
    ? `******${String(details.accountNumber).slice(-4)}`
    : null;

  const rows = [
    `<li><b>Amount:</b> ${amount}</li>`,
    details.bankName ? `<li><b>Bank:</b> ${details.bankName}</li>` : "",
    maskedAccount ? `<li><b>Account:</b> ${maskedAccount}</li>` : "",
    details.reference ? `<li><b>Reference:</b> ${details.reference}</li>` : "",
    `<li><b>Date:</b> ${nowInLagos()} (WAT)</li>`,
  ].join("");

  sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: `Withdrawal successful — ${amount}`,
      html: shell(
        user.first_name ?? "",
        `<p>Your withdrawal has been paid out successfully.</p>
         <ul>${rows}</ul>
         <p>If you did not authorise this withdrawal, contact our support team immediately.</p>`,
      ),
    },
  ).catch(() => {});
}

/**
 * Staff invite link. Sent as raw HTML rather than a Zoho template because
 * template keys are provisioned in the Zoho dashboard and there is no
 * staff-invite template there.
 *
 * Awaited by the caller — unlike the alerts above, a silent failure here means
 * the staff member never receives their link.
 */
export function sendStaffInviteEmail(
  user: EmailUser,
  link: string,
  isResend = false,
) {
  return sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: isResend
        ? "Your new MasaMasa staff invite link"
        : "You have been invited to the MasaMasa admin team",
      html: shell(
        user.first_name ?? "",
        `<p>${
          isResend
            ? "Here is a new link to finish setting up your staff account. Any earlier link has stopped working."
            : "You have been invited to join the MasaMasa admin team. Set a password and confirm your phone number to activate your account."
        }</p>
         <p style="margin:24px 0">
           <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px">Complete your registration</a>
         </p>
         <p>This link expires in ${INVITE_EXPIRY_HOURS} hours. If it does, ask an administrator to send you a new invite.</p>
         <p>If you were not expecting this email you can ignore it — the account stays inactive until the link is used.</p>`,
      ),
    },
  );
}
