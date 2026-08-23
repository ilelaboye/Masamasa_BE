import { appConfig } from "@/config";
import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { randomBytes } from "crypto";
import { Request, Response } from "express";
import {
  REFERRAL_CODE_URL_PATTERN,
  renderReferralLanding,
  LandingPlatform,
} from "./referral-landing.template";
import { ReferralsService } from "./referrals.service";

/**
 * The web half of referral deep links. Unauthenticated by design — every route
 * here is hit by a browser, by Apple's CDN or by Google's verifier, none of
 * which carry the session cookie.
 *
 * These are served from the API but reached at `referral.masamasa.ng` via the
 * Netlify proxy rules in `docs/referral-deep-links.md`, because a Universal
 * Link only works when the association file is served from the *same* host as
 * the link.
 */
@ApiTags("Referral Links")
@Controller()
export class ReferralLinksController {
  constructor(private readonly referralsService: ReferralsService) {}

  /**
   * `https://referral.masamasa.ng/r/<CODE>` — the link users actually share.
   *
   * On a device with the app installed the OS intercepts this URL and hands it
   * to the app; the request never arrives here. So everything this renders is
   * for the install case: it points the visitor at the right store, and on
   * Android it threads the code through the Play install referrer so signup can
   * prefill it after the install completes.
   */
  @ApiExcludeEndpoint()
  @Get("r/:code")
  async referralLanding(
    @Param("code") rawCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const code = (rawCode ?? "").trim().toUpperCase();
    const isWellFormed = REFERRAL_CODE_URL_PATTERN.test(code);

    // A malformed code is not worth a database round trip, and an unknown one
    // must still render — a broken link should land people in the store, not
    // on a 404.
    const referrer = isWellFormed
      ? await this.referralsService.lookupByCode(code)
      : null;

    const platform = detectPlatform(req.get("user-agent") ?? "");
    const validCode = referrer ? code : "";

    const androidStoreUrl = withPlayReferrer(
      appConfig.ANDROID_STORE_URL,
      validCode,
    );
    const iosStoreUrl = appConfig.IOS_STORE_URL;

    const nonce = randomBytes(16).toString("base64");

    // helmet's default policy blocks inline <style>/<script>, which this page
    // is built from. Replacing the header for this one response is narrower
    // than loosening the app-wide policy.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'none'",
        `style-src 'nonce-${nonce}'`,
        `script-src 'nonce-${nonce}'`,
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),
    );
    // Codes are per-user, so a shared cache must never hand one link's page to
    // the next visitor.
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(
      renderReferralLanding({
        code: validCode,
        referrerName: referrer?.first_name ?? null,
        platform,
        storeUrl: platform === "ios" ? iosStoreUrl : androidStoreUrl,
        iosStoreUrl,
        androidStoreUrl,
        appSchemeUrl: `${appConfig.APP_LINK_SCHEME}://referral?code=${encodeURIComponent(validCode)}`,
        nonce,
      }),
    );
  }

  /**
   * iOS Universal Links association file.
   *
   * Apple fetches this over HTTPS with no redirects and requires
   * `application/json`. `appIDs` is the modern spelling; `apps: []` and the
   * legacy `details` shape are kept because older iOS versions still read them.
   */
  @ApiExcludeEndpoint()
  @Get(".well-known/apple-app-site-association")
  appleAppSiteAssociation(@Res() res: Response) {
    const appId = `${appConfig.IOS_TEAM_ID}.${appConfig.IOS_BUNDLE_ID}`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(
      JSON.stringify({
        applinks: {
          apps: [],
          details: [
            {
              appID: appId,
              appIDs: [appId],
              // Only the referral path is claimed. Claiming "*" would make the
              // app intercept every masamasa.ng link, including the marketing
              // site people expect to open in a browser.
              paths: ["/r/*"],
              components: [{ "/": "/r/*", comment: "Referral invite links" }],
            },
          ],
        },
      }),
    );
  }

  /**
   * Android App Links verification file.
   *
   * `ANDROID_CERT_FINGERPRINTS` must list the SHA-256 of every certificate the
   * shipped APK can be signed with. With Play App Signing that is the one under
   * Play Console → Test and release → App integrity, *not* the local upload
   * keystore — using the upload cert alone silently breaks verification on
   * every store install.
   */
  @ApiExcludeEndpoint()
  @Get(".well-known/assetlinks.json")
  assetLinks(@Res() res: Response) {
    const fingerprints = (appConfig.ANDROID_CERT_FINGERPRINTS ?? "")
      .split(",")
      .map((fingerprint) => fingerprint.trim())
      .filter(Boolean);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(
      JSON.stringify([
        {
          relation: [
            "delegate_permission/common.handle_all_urls",
            "delegate_permission/common.get_login_creds",
          ],
          target: {
            namespace: "android_app",
            package_name: appConfig.ANDROID_PACKAGE_NAME,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]),
    );
  }

  /**
   * Whose code is this? Used by the sign-up screen to confirm a prefilled code
   * belongs to a real account before showing "Invited by …".
   *
   * Deliberately returns `{ valid: false }` rather than a 400 for an unknown
   * code: this runs while the user is still typing, and it only ever exposes a
   * first name — never enough to work back to an account.
   */
  @Get("referrals/lookup/:code")
  async lookup(@Param("code") rawCode: string) {
    const code = (rawCode ?? "").trim().toUpperCase();
    if (!REFERRAL_CODE_URL_PATTERN.test(code)) {
      return { valid: false, code, referrer_name: null };
    }

    const referrer = await this.referralsService.lookupByCode(code);
    return {
      valid: Boolean(referrer),
      code,
      referrer_name: referrer?.first_name ?? null,
    };
  }
}

/** Coarse on purpose — it only decides which store button to show. */
const detectPlatform = (userAgent: string): LandingPlatform => {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
};

/**
 * Appends Play's `referrer` parameter, which the Install Referrer API hands
 * back to the app after installation — the only official way to carry a code
 * across a fresh Android install.
 *
 * The whole value must be URL-encoded once as a single parameter, so the inner
 * `key=value` pairs survive Play's own round trip.
 */
const withPlayReferrer = (storeUrl: string, code: string): string => {
  if (!code) return storeUrl;

  const payload = `utm_source=referral&utm_medium=app&utm_campaign=refer_and_earn&referral_code=${code}`;
  const separator = storeUrl.includes("?") ? "&" : "?";
  return `${storeUrl}${separator}referrer=${encodeURIComponent(payload)}`;
};
