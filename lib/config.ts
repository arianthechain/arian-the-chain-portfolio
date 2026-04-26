import type { AppConfig } from "./types";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

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
  },

  wallets: {
    evm: [
      "0x9bA0f2565c532F4a5efe40AAc914163594f8e468",
    ],
    solana: [
      // Tambah address Solana lo
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
   * - Locked di custom contract yang belum di-index
   * - Off-chain custody
   */
  manualHoldings: [
    // Contoh:
    // {
    //   symbol: "ETH",
    //   name: "Ethereum (locked)",
    //   amount: 50,
    //   valueUsd: 116000,
    //   location: "Custom vesting contract",
    // },
  ],
};

// Validate EVM addresses biar fail-fast kalo ada yang typo
for (const addr of _config.wallets.evm) {
  if (!EVM_ADDRESS_RE.test(addr)) {
    throw new Error(
      `Invalid EVM address di config: "${addr}". Harus format 0x + 40 hex chars.`,
    );
  }
}

export const config = _config;
