import { appConfig } from "@/config";
import { axiosClient } from "@/core/utils";
import {
  QuidaxCreateSubAccountData,
  QuidaxPaymentAddress,
  QuidaxResponse,
  QuidaxUser,
  QuidaxWallet,
} from "@/definitions";
import { Injectable, Logger } from "@nestjs/common";
import { QUIDAX_CURRENCIES } from "./quidax.constants";

@Injectable()
export class QuidaxService {
  private readonly logger = new Logger(QuidaxService.name);

  private get authHeader() {
    return { Authorization: `Bearer ${appConfig.QUIDAX_API_KEY}` };
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await axiosClient<QuidaxResponse<T>>(
      `${appConfig.QUIDAX_BASE_URL}${path}`,
      {
        method,
        headers: this.authHeader,
        ...(body ? { body } : {}),
        timeout: 15000,
      },
    );
    return response.data;
  }

  async listSubAccounts(page = 1, perPage = 20): Promise<QuidaxUser[]> {
    return this.request<QuidaxUser[]>("GET", `/users`);
  }

  async createSubAccount(
    data: QuidaxCreateSubAccountData,
  ): Promise<QuidaxUser> {
    const payload: Record<string, unknown> = {
      email: `quidax+${data.email}`,
      first_name: data.first_name,
      last_name: data.last_name,
    };
    // if (data.phone) payload.phone_number = data.phone;

    return this.request<QuidaxUser>("POST", "/users", payload);
  }

  async getSubAccount(quidaxUserId: string): Promise<QuidaxUser> {
    return this.request<QuidaxUser>("GET", `/users/${quidaxUserId}`);
  }

  async listWallets(quidaxUserId: string): Promise<QuidaxWallet[]> {
    return this.request<QuidaxWallet[]>(
      "GET",
      `/users/${quidaxUserId}/wallets`,
    );
  }

  async getWallet(
    quidaxUserId: string,
    currency: string,
  ): Promise<QuidaxWallet> {
    return this.request<QuidaxWallet>(
      "GET",
      `/users/${quidaxUserId}/wallets/${currency}`,
    );
  }

  async createPaymentAddress(
    quidaxUserId: string,
    currency: string,
    network?: string,
  ): Promise<QuidaxPaymentAddress> {
    const query = network ? `?network=${network}` : "";
    return this.request<QuidaxPaymentAddress>(
      "POST",
      `/users/${quidaxUserId}/wallets/${currency}/addresses${query}`,
    );
  }

  // Creates addresses for all accepted currencies in batches of 10 (Quidax
  // rate limit: 10 requests/second). Returns successful Quidax addresses and
  // a separate list of pairs Quidax doesn't support (so callers can fall back
  // to the self-custodian HD wallet for those).
  async createAllPaymentAddresses(quidaxUserId: string): Promise<{
    addresses: QuidaxPaymentAddress[];
    unsupported: Array<{ currency: string; network?: string }>;
  }> {
    const addresses: QuidaxPaymentAddress[] = [];
    const unsupported: Array<{ currency: string; network?: string }> = [];
    const batchSize = 10;

    for (let i = 0; i < QUIDAX_CURRENCIES.length; i += batchSize) {
      const batch = QUIDAX_CURRENCIES.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(({ currency, network }) =>
          this.createPaymentAddress(quidaxUserId, currency, network),
        ),
      );

      results.forEach((result, j) => {
        const { currency, network } = batch[j];
        if (result.status === "fulfilled") {
          addresses.push(result.value);
        } else {
          const msg: string =
            result.reason?.response?.data?.message ??
            result.reason?.message ??
            "";
          if (msg.toLowerCase().includes("blockchain deposits are not available")) {
            unsupported.push({ currency, network });
          } else {
            this.logger.error(
              `Failed to create Quidax address for ${currency}${network ? `/${network}` : ""} (user ${quidaxUserId}): ${result.reason?.message}`,
            );
          }
        }
      });

      // Pause between batches to respect the 10 req/s rate limit
      if (i + batchSize < QUIDAX_CURRENCIES.length) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    return { addresses, unsupported };
  }
}
