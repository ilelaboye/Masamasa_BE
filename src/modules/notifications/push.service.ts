import { appConfig } from "@/config";
import { Injectable, Logger } from "@nestjs/common";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Sends FCM push notifications to user devices. Disabled (no-op with a
 * warning) when FIREBASE_SERVICE_ACCOUNT_BASE64 is not configured, so
 * environments without Firebase credentials still boot.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor() {
    const encoded = appConfig.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!encoded) {
      this.logger.warn(
        "FIREBASE_SERVICE_ACCOUNT_BASE64 not set — push notifications disabled",
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(
        Buffer.from(encoded, "base64").toString("utf8"),
      );
      if (!getApps().length) {
        initializeApp({ credential: cert(serviceAccount) });
      }
      this.enabled = true;
    } catch (err) {
      this.logger.error(
        `Failed to initialize firebase-admin: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Sends the same notification to many device tokens. FCM multicast is
   * capped at 500 tokens per request, so the list is chunked. Returns the
   * number of successful deliveries. Never throws — push is best-effort.
   */
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<number> {
    const valid = tokens.filter(Boolean);
    if (!this.enabled || valid.length === 0) return 0;

    let delivered = 0;
    const chunkSize = 500;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize);
      try {
        const result = await getMessaging().sendEach(
          chunk.map((token) => ({
            token,
            notification: { title, body },
            data: data ?? {},
            android: { priority: "high" as const },
            apns: {
              payload: { aps: { sound: "default", badge: 1 } },
            },
          })),
        );
        delivered += result.successCount;
      } catch (err) {
        this.logger.error(
          `FCM multicast failed for ${chunk.length} token(s): ${(err as Error).message}`,
        );
      }
    }
    return delivered;
  }
}
