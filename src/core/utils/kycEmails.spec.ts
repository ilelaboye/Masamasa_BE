jest.mock("./mailer", () => ({
  sendZohoMail: jest.fn().mockResolvedValue(undefined),
  sendZohoMailWithTemplate: jest.fn().mockResolvedValue(undefined),
}));

import { sendKycDecisionEmail, sendKycReceivedEmail } from "./accountEmails";
import { sendZohoMail } from "./mailer";

/**
 * Both reviewed tiers are decided by a person, so these emails are the entire
 * channel back to the user. The one thing that would actually hurt: a decline
 * that does not say why, leaving the user nothing to correct before
 * resubmitting.
 */

const user = { first_name: "ada", last_name: "obi", email: "ada@example.com" };
const lastMail = () =>
  (sendZohoMail as jest.Mock).mock.calls.at(-1) as [
    { to: { email: string } },
    { subject: string; html: string },
  ];

beforeEach(() => (sendZohoMail as jest.Mock).mockClear());

describe.each([
  [2 as const, /identity/i],
  [3 as const, /address/i],
])("tier %i emails", (tier, subjectMatch) => {
  it("tells the user the submission is under review", () => {
    sendKycReceivedEmail(user, tier);
    const [options, mail] = lastMail();
    expect(options.to.email).toBe("ada@example.com");
    expect(mail.subject).toMatch(subjectMatch);
    expect(mail.html).toContain("under review");
    expect(mail.html).toContain(`Tier ${tier}`);
  });

  it("carries the decline reason", () => {
    sendKycDecisionEmail(user, tier, false, "The photo is too blurred to read");
    const [, mail] = lastMail();
    expect(mail.subject).toMatch(/declined/i);
    expect(mail.html).toContain("The photo is too blurred to read");
  });

  it("escapes a reason an admin typed — it is free text going into HTML", () => {
    sendKycDecisionEmail(user, tier, false, '<script>alert("x")</script>');
    const [, mail] = lastMail();
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("sends no reason on approval, and names the tier just unlocked", () => {
    sendKycDecisionEmail(user, tier, true);
    const [, mail] = lastMail();
    expect(mail.subject).toMatch(/verified/i);
    expect(mail.html).not.toContain("Reason:");
    expect(mail.html).toContain(`Tier ${tier}`);
  });
});

it("does not mix the two tiers' copy", () => {
  // Tier 2 is the ID document, tier 3 is the address — swapping the wording
  // tells the user the wrong thing was approved.
  sendKycDecisionEmail(user, 2, true);
  expect(lastMail()[1].html).not.toMatch(/address/i);

  sendKycDecisionEmail(user, 3, true);
  expect(lastMail()[1].html).not.toMatch(/identity/i);
});
