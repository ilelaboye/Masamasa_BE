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

  /** FCM multicast is capped at 500 tokens per request. */
  private static readonly CHUNK_SIZE = 500;

  /**
   * Requests in flight at once. A broadcast to a large audience is dominated by
   * round-trip latency, not by FCM's own limits, so the chunks go out in
   * batches instead of one after another.
   */
  private static readonly CONCURRENCY = 5;

  /**
   * Sends the same notification to many device tokens. Returns the number of
   * successful deliveries. Never throws — push is best-effort.
   */
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<number> {
    const valid = tokens.filter(Boolean);
    if (!this.enabled || valid.length === 0) return 0;

    const chunks: string[][] = [];
    for (let i = 0; i < valid.length; i += PushService.CHUNK_SIZE) {
      chunks.push(valid.slice(i, i + PushService.CHUNK_SIZE));
    }

    let delivered = 0;
    for (let i = 0; i < chunks.length; i += PushService.CONCURRENCY) {
      const batch = chunks.slice(i, i + PushService.CONCURRENCY);
      const counts = await Promise.all(
        batch.map((chunk) => this.sendChunk(chunk, title, body, data)),
      );
      delivered += counts.reduce((sum, count) => sum + count, 0);
    }
    return delivered;
  }

  /** One multicast request. Swallows its own failure — see sendToTokens. */
  private async sendChunk(
    chunk: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<number> {
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
      return result.successCount;
    } catch (err) {
      this.logger.error(
        `FCM multicast failed for ${chunk.length} token(s): ${(err as Error).message}`,
      );
      return 0;
    }
  }
}
