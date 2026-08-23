import { REFERRAL_CODE_ALPHABET } from "@/core/helpers/generateAlphaNumericString";

export type LandingPlatform = "ios" | "android" | "other";

export interface ReferralLandingOptions {
  /** Uppercased code from the URL. Empty when the link carried none. */
  code: string;
  /** Referrer's first name when the code resolved, null when it did not. */
  referrerName: string | null;
  platform: LandingPlatform;
  /** Where to send this visitor. Already carries `referrer=` on Android. */
  storeUrl: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  /** `masamasa://` link tried first, in case App Links verification is off. */
  appSchemeUrl: string;
  /** CSP nonce for the single inline <style> and <script>. */
  nonce: string;
}

/** Anything user-controlled that lands in the HTML goes through this first. */
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );

/** For values interpolated into the inline script rather than into markup. */
const escapeJs = (value: string): string => JSON.stringify(value);

/**
 * Names are stored lowercase, so "ada invited you" is what a raw read gives.
 * Titlecased here rather than in the service, which other callers share.
 */
const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .map((word) =>
      word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word,
    )
    .join(" ");

/**
 * The page a referral link lands on when the app is **not** installed.
 *
 * When it is installed, iOS and Android hand the URL straight to the app and
 * this is never rendered — which is why everything here is written for the
 * install case: try the custom scheme once (covering the Android user who
 * turned "open supported links" off), then fall through to the store.
 */
export const renderReferralLanding = (
  options: ReferralLandingOptions,
): string => {
  const {
    code,
    referrerName,
    platform,
    storeUrl,
    iosStoreUrl,
    androidStoreUrl,
    appSchemeUrl,
    nonce,
  } = options;

  const isMobile = platform === "ios" || platform === "android";
  const safeCode = escapeHtml(code);
  const heading = referrerName
    ? `${escapeHtml(titleCase(referrerName))} invited you to MasaMasa`
    : "You&#39;ve been invited to MasaMasa";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${heading}</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="${heading}">
<meta property="og:description" content="Buy crypto, pay bills and send money in Nigeria. Sign up with referral code ${safeCode} and you both earn.">
<style nonce="${nonce}">
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; background: #0E0E12; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card { width: 100%; max-width: 420px; text-align: center; }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 12px; font-weight: 700; }
  p { color: rgba(255,255,255,.62); font-size: 15px; line-height: 1.5; margin: 0 0 28px; }
  .code-label { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.45); margin-bottom: 8px; }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 30px; letter-spacing: .18em; font-weight: 700;
    padding: 18px; border-radius: 16px; margin-bottom: 28px;
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
  }
  .btn {
    display: block; padding: 16px; border-radius: 999px; font-size: 16px;
    font-weight: 600; text-decoration: none; margin-bottom: 12px;
    background: linear-gradient(90deg, #F45FD0, #C824B2); color: #fff;
  }
  .btn.secondary { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); }
  .note { font-size: 13px; color: rgba(255,255,255,.4); margin: 20px 0 0; }
  .logo { width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 24px; background: linear-gradient(135deg, #F45FD0, #C824B2); }
</style>
</head>
<body>
  <div class="card">
    <div class="logo"></div>
    <h1>${heading}</h1>
    <p>Buy crypto, pay bills and send money — all in one app.</p>
    ${
      safeCode
        ? `<div class="code-label">Your referral code</div>
    <div class="code">${safeCode}</div>`
        : ""
    }
    ${
      isMobile
        ? `<a class="btn" id="store" href="${escapeHtml(storeUrl)}">Get the app</a>`
        : `<a class="btn" href="${escapeHtml(iosStoreUrl)}">Download on the App Store</a>
    <a class="btn secondary" href="${escapeHtml(androidStoreUrl)}">Get it on Google Play</a>`
    }
    <p class="note">${
      safeCode
        ? "Enter this code on the sign-up screen if it isn't already filled in."
        : "That link didn't carry a valid referral code, but you can still join."
    }</p>
  </div>
${
  // Desktop has no app to hand off to, so the scheme probe is skipped
  // entirely rather than emitted behind a dead branch.
  !isMobile
    ? ""
    : `<script nonce="${nonce}">
(function () {
  var scheme = ${escapeJs(appSchemeUrl)};
  var store = ${escapeJs(storeUrl)};

  // The app is normally opened by the Universal / App Link before this page is
  // ever fetched. Reaching here usually means it is not installed — but it can
  // also mean link verification is off for the app, so the custom scheme gets
  // one silent try. If it works the page is backgrounded and the timer never
  // fires; if it does not, nothing visible happens and we go to the store.
  var left = false;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) left = true;
  });

  window.location.href = scheme;
  setTimeout(function () {
    if (!left && !document.hidden) window.location.replace(store);
  }, 1200);
})();
</script>`
}
</body>
</html>`;
};

/** A referral code as the generator produces them — see REFERRAL_CODE_ALPHABET. */
export const REFERRAL_CODE_URL_PATTERN = new RegExp(
  `^[${REFERRAL_CODE_ALPHABET}]{7,10}$`,
);
