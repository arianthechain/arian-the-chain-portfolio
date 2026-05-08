import type { AppConfig } from "./types";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Edit di sini — semua konfigurasi profile, wallet, dan override manual.
 */
const _config: AppConfig = {
  profile: {
    name: "Arian the Chain",
    handle: "arianthechain",
    initials: "AC",
    activeSince: "", // kosong = auto-detect dari tx pertama; isi manual misal "Jan 2021" untuk override
    domain: "arianthechain.com",
    twitter: "arianthechain", // X handle tanpa @, set "" untuk disable link
    strategy: {
      code: "330",
      label: "Strategist",
    },
  },

  wallets: {
    evm: [
      "0x1503E5acb203e1C19ad490f34D19271127493E3a",
    ],
    solana: [
      "EYfcbotWjUmmTCS6GhXYpBygMKVYrcMQz39cSJArqMqF",
    ],
    bitcoin: [
      // Tambah address Bitcoin lo
    ],
  },

  /**
   * Cost basis = anchor untuk hitung P&L.
   * - "auto" → sum semua incoming tx (cost basis nambah tiap top up)
   * - "first_deposit" → pake deposit pertama doang sebagai anchor (top up berikutnya = P&L)
   * - "manual" → pakai manualValue di bawah (fixed)
   */
  costBasis: {
    mode: "first_deposit",
    manualValue: 30,
  },

  /**
   * Holdings yang ga ke-detect API:
   * - Aset di CEX (Binance, Bybit, dll)
   * - Off-chain custody
   *
   * NOTE: Locked tokens auto-detect di Solana (Jupiter Lock + SatoshiLock V1/V2)
   * dan Ethereum (SatoshiLock V3) — ga perlu manual entry.
   */
  manualHoldings: [
    // Contoh:
    // {
    //   symbol: "USDC",
    //   name: "USDC (CEX)",
    //   amount: 5000,
    //   valueUsd: 5000,
    //   location: "Binance",
    // },
  ],

  /**
   * Target / goal — opsional. Set ke undefined buat hide section.
   * Contoh: target: { name: "BMW M3", priceUsd: 95000 }
   */
  target: undefined,
};

// Validate addresses biar fail-fast kalo ada yang typo
for (const addr of _config.wallets.evm) {
  if (!EVM_ADDRESS_RE.test(addr)) {
    throw new Error(
      `Invalid EVM address di config: "${addr}". Harus format 0x + 40 hex chars.`,
    );
  }
}
for (const addr of _config.wallets.solana ?? []) {
  if (!SOLANA_ADDRESS_RE.test(addr)) {
    throw new Error(
      `Invalid Solana address di config: "${addr}". Harus format base58 32-44 chars.`,
    );
  }
}

export const config = _config;
