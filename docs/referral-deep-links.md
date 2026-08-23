# Referral deep links

How `https://referral.masamasa.ng/r/<CODE>` gets a referral code into the
sign-up form, and what has to be configured outside this repo for it to work.

The links live on the **`referral.masamasa.ng`** subdomain (its own Netlify
site, `masamasa-referral.netlify.app`), and keep the `/r` prefix: the root of
that subdomain serves a marketing page, so only `/r/*` is claimed by the app.

## The three paths a code can travel

| Situation | Mechanism | Reliability |
|---|---|---|
| App installed, iOS | Universal Link → `DeepLinkService` | Exact |
| App installed, Android | Verified App Link → `DeepLinkService` | Exact |
| App **not** installed, Android | Landing page → Play Store `referrer=` → Install Referrer API on first launch | Exact |
| App **not** installed, iOS | Landing page shows the code; the user types it | Manual |

The iOS install case is the only gap: Apple provides no API that carries a
value across an App Store install. See "Open question" at the bottom.

## What this repo serves

All three routes are `ReferralLinksController`, mounted at the app root:

| Route | Purpose |
|---|---|
| `GET /r/:code` | The invite landing page. Only rendered when the app is **not** installed — otherwise the OS intercepts the URL first. Redirects to the right store, threading the code through Play's `referrer` parameter on Android. |
| `GET /.well-known/apple-app-site-association` | iOS Universal Link association. Apple's CDN fetches it. |
| `GET /.well-known/assetlinks.json` | Android App Link verification. Fetched at install time. |
| `GET /referrals/lookup/:code` | Public, unauthenticated. Confirms a code and returns the referrer's first name, so sign-up can show "Ada's referral code applied". |

## Configuration

New environment variables (all have working defaults except the last):

```bash
REFERRAL_LINK_BASE=https://referral.masamasa.ng/r
APP_LINK_SCHEME=masamasa
IOS_BUNDLE_ID=com.masamasang
IOS_TEAM_ID=2H446HFGL6
ANDROID_PACKAGE_NAME=com.masamasang

# Required. Comma-separated SHA-256 certificate fingerprints, uppercase hex
# with colons. Get this from Play Console → Test and release → Setup →
# App integrity → App signing key certificate.
#
# With Play App Signing this is NOT the local upload keystore's fingerprint —
# using that one alone makes verification fail silently on every store install.
# List both the app signing key and the upload key so internal-testing builds
# verify too.
ANDROID_CERT_FINGERPRINTS=AB:CD:...:EF,12:34:...:56
```

Check the fingerprint the API is publishing at any time:

```bash
curl https://referral.masamasa.ng/.well-known/assetlinks.json
```

## Netlify: proxying referral.masamasa.ng → the API

A Universal Link only works when the association file is served from the
**same host as the link**. The invite links live on `referral.masamasa.ng`
(Netlify site `masamasa-referral`) but the logic lives here, so that site needs
these rules. Add them to the `_redirects` file at the root of its published
directory — order matters, first match wins:

```
/.well-known/apple-app-site-association   https://api.masamasa.ng/.well-known/apple-app-site-association   200
/.well-known/assetlinks.json              https://api.masamasa.ng/.well-known/assetlinks.json              200
/r/*                                      https://api.masamasa.ng/r/:splat                                 200
```

The `200` status is what makes these a **proxy** rather than a redirect. That
matters: Apple refuses to follow a redirect when fetching the association file,
so a `301` here silently breaks iOS Universal Links.

Only the two specific `.well-known` files are proxied, not the whole directory —
Netlify uses that path for its own ACME certificate challenges. And only `/r/*`,
so the marketing page at `referral.masamasa.ng/` keeps being served by Netlify.

### Legacy links on the main domain

App version 2.0.0 shipped a Refer & Earn screen that shares
`https://masamasa.ng/r/<CODE>`. Those links have never resolved — the route did
not exist — so anything already shared is dead. The same `/r/*` rule added to
the **masamasa.ng** site's `_redirects` revives them: the backend serves
`/r/:code` regardless of Host, so no code change is needed.

Those links stay browser-only. The app claims `referral.masamasa.ng` and not
`masamasa.ng`, so even with the app installed they render the landing page —
which then hands off via the `masamasa://` scheme. Good enough for a legacy
path; not worth claiming a second host for.

## Apple Developer portal

Universal Links need the **Associated Domains** capability enabled on the
`com.masamasang` App ID, and the provisioning profile regenerated afterwards.
Without it, `Runner.entitlements` fails to sign and the build is rejected.

## Verifying

```bash
# The association files, as the OS sees them (must be application/json, no redirect)
curl -sI https://referral.masamasa.ng/.well-known/apple-app-site-association | head -3
curl -s  https://referral.masamasa.ng/.well-known/assetlinks.json

# Google's own verifier
open "https://developers.google.com/digital-asset-links/tools/generator"

# The landing page, as each platform sees it
curl -s -A "Mozilla/5.0 (iPhone)"     https://referral.masamasa.ng/r/ABC2345 | grep -o 'href="[^"]*"'
curl -s -A "Mozilla/5.0 (Android 14)" https://referral.masamasa.ng/r/ABC2345 | grep -o 'referrer=[^"]*'

# On a device with the app installed — should open the app, not a browser
adb shell am start -a android.intent.action.VIEW -d "https://referral.masamasa.ng/r/ABC2345"
xcrun simctl openurl booted "https://referral.masamasa.ng/r/ABC2345"

# Android link verification status after install
adb shell pm get-app-links com.masamasang
```

`pm get-app-links` printing `verified` for `referral.masamasa.ng` is the check that
matters — anything else means the fingerprint is wrong and links will open in
Chrome.

## Open question: iOS deferred installs

An iOS user who taps an invite link without the app installed lands on the
store, and nothing carries the code through the install. The landing page shows
it prominently, but they have to type it.

Closing that gap needs one of:

- **Server-side click matching** — record the landing-page hit (IP + user agent,
  short TTL) and have the app claim it on first launch. Probabilistic, roughly
  85–95% accurate, works on both platforms. Needs a new table and two endpoints.
- **Clipboard handoff** — the landing page copies the code, the app reads it
  once on first launch. Deterministic, but iOS 16+ shows an "Allow Paste" prompt.
- **A third-party SDK** (Branch, AppsFlyer) — solves it out of the box, at the
  cost of a vendor dependency.

Nothing here is built yet; the Android side is already exact via Play.
