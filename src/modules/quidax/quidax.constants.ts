// ─────────────────────────────────────────────────────────────────────────────
// Network name converters
// ─────────────────────────────────────────────────────────────────────────────

// Quidax network string → canonical app format stored in the wallet table
const QUIDAX_TO_APP: Record<string, string> = {
  erc20: "ETHEREUM",
  bep20: "BINANCE",
  base: "BASE",
  trc20: "TRON",
  pol: "POLYGON",
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
  matic: "POLYGON",
};

// App format → Quidax network string (undefined means native / no network param)
const APP_TO_QUIDAX: Record<string, string | undefined> = {
  ETHEREUM: "erc20",
  BINANCE: "bep20",
  BASE: "base",
  TRON: "trc20",
  POLYGON: "pol",
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

// ─────────────────────────────────────────────────────────────────────────────
// Currency list
// ─────────────────────────────────────────────────────────────────────────────

// One entry per (currency, network) pair — each gets its own deposit address.
// Native single-network coins omit the network field (Quidax uses the default).
// Network identifiers match Quidax API values:
//   erc20 = Ethereum  |  bep20 = BNB Smart Chain  |  trc20 = Tron
//   base  = Base      |  ton   = TON               |  optimism = Optimism
//   celo  = Celo      |  lisk  = Lisk              |  arbitrum = Arbitrum
export const QUIDAX_CURRENCIES: Array<{ currency: string; network?: string }> =
  [
    // ── USDT: ETHEREUM, BINANCE, TRON, TON, OPTIMISM, CELO, LISK, ARBITRUM ──
    { currency: "usdt", network: "erc20" },
    { currency: "usdt", network: "bep20" },
    { currency: "usdt", network: "trc20" },
    // { currency: "usdt", network: "ton" },
    // { currency: "usdt", network: "optimism" },
    // { currency: "usdt", network: "celo" },
    // { currency: "usdt", network: "lisk" },
    // { currency: "usdt", network: "arbitrum" },
    { currency: "usdt", network: "pol" },
    { currency: "usdt", network: "sol" },

    // ── USDC: ETHEREUM, BINANCE, BASE ────────────────────────────────────────
    { currency: "usdc", network: "erc20" },
    { currency: "usdc", network: "bep20" },
    { currency: "usdc", network: "base" },

    // ── ETH: ETHEREUM (native), BINANCE, BASE ────────────────────────────────
    { currency: "eth" },
    { currency: "eth", network: "bep20" },
    { currency: "eth", network: "base" },
    // { currency: "eth", network: "lisk" },
    // { currency: "eth", network: "arbitrum" },

    // ── ADA: CARDANO (native) ────────────────────────────────────────────────
    { currency: "ada" },

    // ── XRP: RIPPLE (native) ─────────────────────────────────────────────────
    { currency: "xrp" },

    // ── DOGE: DOGE (native) ──────────────────────────────────────────────────
    { currency: "doge" },

    // ── BTC: BITCOIN (native), BINANCE ───────────────────────────────────────
    { currency: "btc" },
    { currency: "btc", network: "bep20" },

    // ── SOL: SOLANA (native) ─────────────────────────────────────────────────
    { currency: "sol" },
    { currency: "sol", network: "bep20" },

    // ── BNB: BEP20 (native) ──────────────────────────────────────────────────
    { currency: "bnb" },
  ];
