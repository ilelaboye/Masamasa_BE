import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
// Namespace import — a default import compiles to `mixpanel_1.default`,
// which is undefined at runtime for CommonJS modules without esModuleInterop.
import * as Mixpanel from "mixpanel";
import { appConfig } from "@/config";

/**
 * NDPA "Do Not Send" guard (see the tracking plan's Do Not Send tab).
 * Any property whose key matches one of these is dropped and logged —
 * a payload must never carry directly identifying or financial data.
 */
const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /email/i,
  /first.?name/i,
  /last.?name/i,
  /^\$?name$/i,
  /phone/i,
  /bvn/i,
  /nin(?!_)/i,
  /date.?of.?birth|birth.?date|\bdob\b/i,
  /account.?number/i,
  /wallet.?address/i,
  /^address$/i,
  /tx.?hash|transaction.?hash/i,
  /^\$?ip$/i,
  /password|pin|token|secret/i,
];

@Injectable()
export class MixpanelService {
  private readonly logger = new Logger(MixpanelService.name);
  private readonly client: Mixpanel.Mixpanel | null;

  constructor() {
    if (appConfig.MIXPANEL_TOKEN) {
      this.client = Mixpanel.init(appConfig.MIXPANEL_TOKEN, {
        // Never let Mixpanel geolocate — IP is personal data under NDPA
        geolocate: false,
      });
    } else {
      this.client = null;
      this.logger.warn("MIXPANEL_TOKEN not set — analytics disabled");
    }
  }

  /**
   * Salted SHA-256 of our user id — the only user identifier that ever
   * reaches Mixpanel. The salt lives in the environment and must NEVER be
   * rotated: rotation silently orphans every historic user record.
   */
  hashUserId(userId: number | string): string {
    return createHash("sha256")
      .update(`${appConfig.MIXPANEL_ID_SALT}${userId}`)
      .digest("hex")
      .slice(0, 16);
  }

  /**
   * Tracks an event against a user. Event names are lowercase with spaces
   * per the tracking plan. Fire-and-forget: analytics must never break or
   * slow a money flow.
   */
  track(
    event: string,
    userId: number | string | null,
    properties: Record<string, unknown> = {},
  ) {
    if (!this.client) return;
    try {
      const props: Record<string, unknown> = {
        ...this.sanitize(properties),
        // ip: 0 disables geolocation for this event server-side
        ip: 0,
      };
      if (userId !== null && userId !== undefined) {
        props.distinct_id = this.hashUserId(userId);
      }
      this.client.track(event, props, (err) => {
        if (err) this.logger.warn(`track "${event}" failed: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`track "${event}" threw: ${err?.message}`);
    }
  }

  /** Sets profile properties (identify happens implicitly via distinct_id). */
  setProfile(userId: number | string, properties: Record<string, unknown>) {
    if (!this.client) return;
    try {
      this.client.people.set(
        this.hashUserId(userId),
        { ...this.sanitize(properties), $ip: 0 } as Record<string, any>,
        (err) => {
          if (err) this.logger.warn(`people.set failed: ${err.message}`);
        },
      );
    } catch (err) {
      this.logger.warn(`people.set threw: ${err?.message}`);
    }
  }

  /** Increments numeric lifetime counters (never `set` for these). */
  incrementProfile(
    userId: number | string,
    properties: Record<string, number>,
  ) {
    if (!this.client) return;
    try {
      this.client.people.increment(
        this.hashUserId(userId),
        properties as Record<string, number>,
        (err) => {
          if (err) this.logger.warn(`people.increment failed: ${err.message}`);
        },
      );
    } catch (err) {
      this.logger.warn(`people.increment threw: ${err?.message}`);
    }
  }

  /** Drops forbidden keys and undefined values from a payload. */
  private sanitize(
    properties: Record<string, unknown>,
  ): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined || value === null) continue;
      if (FORBIDDEN_KEY_PATTERNS.some((p) => p.test(key))) {
        this.logger.warn(
          `Dropped forbidden analytics property "${key}" (Do Not Send list)`,
        );
        continue;
      }
      clean[key] = value;
    }
    return clean;
  }
}
