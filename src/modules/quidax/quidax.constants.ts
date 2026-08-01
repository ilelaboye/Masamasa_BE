// ─────────────────────────────────────────────────────────────────────────────
// Network name converters
// ─────────────────────────────────────────────────────────────────────────────

// Quidax network string → canonical app format stored in the wallet table
const QUIDAX_TO_APP: Record<string, string> = {
  erc20: "ETHEREUM",
  bep20: "BINANCE",
  base: "BASE",
  trc20: "TRON",
  pol: "Polygon",
  sol: "SOLANA",
  ton: "TON",
  optimism: "OPTIMISM",
  celo: "CELO",
  lisk: "LISK",
  arbitrum: "ARBITRUM",
};

// For native coins Quidax sends no network field — derive from the currency
const CURRENCY_TO_APP: Record<string, string> = {
  eth: "ETHEREUM",
  bnb: "BINANCE",
  btc: "BITCOIN",
  sol: "SOLANA",
  trx: "TRON",
  ada: "CARDANO",
  xrp: "RIPPLE",
  doge: "DOGE",
  matic: "Polygon",
  pol: "Polygon",
};

// App format → Quidax network string (undefined means native / no network param)
const APP_TO_QUIDAX: Record<string, string | undefined> = {
  ETHEREUM: "erc20",
  BINANCE: "bep20",
  BASE: "base",
  TRON: "trc20",
  POLYGON: "pol",
  Polygon: "pol",
  SOLANA: "sol",
  TON: "ton",
  OPTIMISM: "optimism",
  CELO: "celo",
  LISK: "lisk",
  ARBITRUM: "arbitrum",
  CARDANO: "ada",
  RIPPLE: "xrp",
  DOGE: "doge",
  BITCOIN: "btc",
};

/**
 * Converts a Quidax network identifier (e.g. "trc20") to the canonical app
 * format stored in the wallet table (e.g. "TRON"). Falls back to the
 * currency-derived name for native coins that carry no network field.
 */
export function toAppNetwork(
  quidaxNetwork: string | null | undefined,
  currency: string,
): string {
  if (quidaxNetwork) {
    const mapped = QUIDAX_TO_APP[quidaxNetwork.toLowerCase()];
    if (mapped) return mapped;
  }
  return (
    CURRENCY_TO_APP[currency.toLowerCase()] ??
    (quidaxNetwork ?? currency).toUpperCase()
  );
}

/**
 * Converts a wallet-table network name (e.g. "TRON") back to the Quidax
 * network parameter (e.g. "trc20"). Returns undefined for native coins
 * that do not require a network query param.
 */
export function toQuidaxNetwork(appNetwork: string): string | undefined {
  return APP_TO_QUIDAX[appNetwork.toUpperCase()];
}


export const QUIDAX_CURRENCIES: Array<{ currency: string; network?: string }> =
  [
    // ── USDT: BEP20, ERC20, TRC20, POLYGON, SOLANA ───────────────────────────
    { currency: "usdt", network: "bep20" },
    { currency: "usdt", network: "erc20" },
    { currency: "usdt", network: "trc20" },
    { currency: "usdt", network: "polygon" },
    { currency: "usdt", network: "solana" },

    // ── USDC: BEP20, ERC20, TRC20, POLYGON, SOLANA ───────────────────────────
    { currency: "usdc", network: "bep20" },
    { currency: "usdc", network: "erc20" },
    // { currency: "usdc", network: "trc20" },
    { currency: "usdc", network: "polygon" },
    { currency: "usdc", network: "solana" },

    // ── ETH: ERC20 (native), BEP20 ───────────────────────────────────────────
    { currency: "eth" },
    { currency: "eth", network: "bep20" },

    // ── BNB: BEP20 (native) ──────────────────────────────────────────────────
    { currency: "bnb" },

    // ── XRP: RIPPLE (native) ─────────────────────────────────────────────────
    { currency: "xrp" },

    // ── DOGE: DOGE (native) ──────────────────────────────────────────────────
    { currency: "doge" },

    // ── TRX: TRC20 (native) ──────────────────────────────────────────────────
    { currency: "trx" },

    // ── POL: POLYGON (native), BEP20 ─────────────────────────────────────────
    { currency: "pol" },
    // { currency: "pol", network: "bep20" },

    // ── BTC: BITCOIN (native), BEP20 ─────────────────────────────────────────
    { currency: "btc" },
    { currency: "btc", network: "bep20" },

    // ── ADA: CARDANO (native) ────────────────────────────────────────────────
    { currency: "ada" },

    // ── SOL: SOLANA (native), BEP20 ──────────────────────────────────────────
    { currency: "sol" },
    { currency: "sol", network: "bep20" },
  ];

// Set of "CURRENCY|APP_NETWORK" pairs (both uppercased) accepted via Quidax.
// Wallet rows outside this set are unsupported legacy (self-custody) entries.
export const SUPPORTED_WALLET_PAIRS: ReadonlySet<string> = new Set(
  QUIDAX_CURRENCIES.map(
    ({ currency, network }) =>
      `${currency.toUpperCase()}|${toAppNetwork(network ?? null, currency).toUpperCase()}`,
  ),
);
