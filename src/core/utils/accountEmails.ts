import { appConfig } from "@/config";
import { ZohoMailTemplates } from "@/constants";
import { capitalizeString, INVITE_EXPIRY_HOURS } from "../helpers";
import { sendZohoMail, sendZohoMailWithTemplate } from "./mailer";

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

/** Escapes values that reach the email from webhooks or user input. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandHeader(): string {
  return appConfig.MAIL_LOGO_URL
    ? `<img src="${esc(appConfig.MAIL_LOGO_URL)}" alt="MasaMasa" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none" />`
    : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#1a1a1a">MasaMasa</span>`;
}

function shell(greetingName: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;margin:0;padding:24px 0">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <td align="left" style="padding:0 8px 20px">${brandHeader()}</td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:10px;padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
            <p style="margin:0 0 16px">Hello ${capitalizeString(greetingName || "there")},</p>
            ${body}
            <p style="margin:24px 0 0">— The MasaMasa Team</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8a8f98">
            This is an automated message from MasaMasa. Please do not reply to this email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function sendLoginAlertEmail(
  user: EmailUser,
  // Both are nullable: the device cannot always be determined from a request,
  // and getClientInfo yields null rather than undefined when it cannot.
  context: { device?: string | null; ip?: string | null } = {},
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

/** Confirmation that the account was deleted at the user's own request. */
export function sendAccountDeletedEmail(user: EmailUser, reason?: string) {
  sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: "Your MasaMasa account has been deleted",
      html: shell(
        user.first_name ?? "",
        `<p>Your account has been successfully deleted as requested.</p>
         ${reason ? `<p><b>Reason:</b> ${esc(reason)}</p>` : ""}
         <p>Your data will be permanently removed from our systems within 30 days, in line with our data retention policy.</p>
         <p><b>If you did not request this deletion, contact our support team immediately.</b></p>`,
      ),
    },
  ).catch(() => {});
}

/** Notice that an admin activated or deactivated the user's account. */
export function sendAccountStatusChangedEmail(
  user: EmailUser,
  activated: boolean,
) {
  sendZohoMail(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: activated
        ? "Your MasaMasa account has been activated"
        : "Your MasaMasa account has been deactivated",
      html: shell(
        user.first_name ?? "",
        activated
          ? `<p>Good news — your MasaMasa account has been activated. You can now log in and use all features of the app.</p>
             <p>If you have any questions, please contact our support team.</p>`
          : `<p>Your MasaMasa account has been deactivated. You will not be able to log in or perform any transactions.</p>
             <p>If you believe this is a mistake, please reach out to our support team to have your account reactivated.</p>`,
      ),
    },
  ).catch(() => {});
}

/**
 * Confirmation that a bank withdrawal was paid out successfully.
 */
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
    : "";

  sendZohoMailWithTemplate(
    {
      to: {
        name: `${capitalizeString(user.first_name ?? "")} ${capitalizeString(user.last_name ?? "")}`.trim(),
        email: user.email,
      },
    },
    {
      subject: "Withdrawal successful",
      templateId: ZohoMailTemplates.withdrawal_successful,
      variables: {
        firstName: capitalizeString(user.first_name ?? ""),
        amount,
        bankName: details.bankName ?? "",
        accountNumber: maskedAccount,
        reference: details.reference ?? "",
        date: `${nowInLagos()} (WAT)`,
        supportEmail: appConfig.SUPPORT_EMAIL,
      },
    },
  ).catch(() => {});
}

/**
 * Crypto amounts need more precision than the 2dp naira formatter — a 0.0005
 * BTC deposit must not render as "0.00 BTC". Up to 8 decimals, trailing zeros
 * dropped by the formatter.
 */
function formatCoinAmount(value: number): string {
  return (Number(value) || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 8,
  });
}

/**
 * Confirmation that a crypto deposit was credited to the user's wallet.
 */
export function sendDepositConfirmedEmail(
  user: EmailUser,
  details: {
    coinAmount: number;
    currency: string;
    network?: string;
    nairaAmount: number;
    address?: string;
  },
) {
  const currency = String(details.currency ?? "").toUpperCase();
  const coin = `${formatCoinAmount(details.coinAmount)} ${currency}`.trim();
  const naira = `NGN ${Number(details.nairaAmount ?? 0).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;

  const rows = [
    `<li><b>Amount:</b> ${esc(coin)}</li>`,
    `<li><b>Value:</b> ${naira}</li>`,
    details.network
      ? `<li><b>Network:</b> ${esc(String(details.network).toUpperCase())}</li>`
      : "",
    details.address
      ? `<li style="word-break:break-all"><b>Deposit address:</b> ${esc(details.address)}</li>`
      : "",
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
      subject: `Deposit confirmed — ${coin}`,
      html: shell(
        user.first_name ?? "",
        `<p>Your deposit has been confirmed and credited to your MasaMasa wallet.</p>
         <ul>${rows}</ul>
         <p>If you did not make this deposit, contact our support team immediately.</p>`,
      ),
    },
  ).catch(() => {});
}

/**
 * Staff invite link.
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

/**
 * Internal ops alert: a provider's float has fallen below its threshold. Goes
 * to the ops inbox rather than to a user, but through the same shell as every
 * other email we send, so it carries the MasaMasa header.
 */
export function sendLowBalanceAlertEmail(
  to: string,
  details: { provider: string; balance: number; threshold: number },
) {
  const naira = (value: number) =>
    `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

  const downstream =
    details.provider === "Nomba" ? "withdrawals" : "bill purchases";

  sendZohoMail(
    { to: { name: "MasaMasa", email: to } },
    {
      subject: `⚠️ ${details.provider} balance low — ${naira(details.balance)}`,
      html: shell(
        "team",
        `<p>The <b>${esc(details.provider)}</b> account balance is <b>${naira(details.balance)}</b>, below the ${naira(details.threshold)} threshold.</p>
         <p>Please top up the account to keep ${downstream} flowing — parked transactions retry automatically once funded.</p>`,
      ),
    },
  ).catch(() => {});
}
