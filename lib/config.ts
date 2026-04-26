import type { AppConfig } from "./types";

/**
 * Edit di sini — semua konfigurasi profile, wallet, dan override manual.
 */
export const config: AppConfig = {
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
   * Cost basis = total uang fiat yang pernah masuk.
   * - "auto" → ambil dari Zerion P&L endpoint (auto-detect dari tx history)
   * - "manual" → pakai manualValue di bawah
   */
  costBasis: {
    mode: "auto",
    manualValue: 485000,
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
