export type Holding = {
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number;
  color: string;
  iconChar: string;
  isLocked?: boolean;
  location?: string;
};

export type PortfolioData = {
  totalValueUsd: number;
  change24hPct: number;
  change24hUsd: number;
  costBasisUsd: number;
  allTimePnlUsd: number;
  allTimePnlPct: number;
  holdings: Holding[];
  firstSeenAt: string | null; // ISO date dari tx pertama, null kalo wallet kosong
  fetchedAt: string;
};

export type ProfileConfig = {
  name: string;
  handle: string;
  initials: string;
  activeSince: string; // "Jan 2021"
  domain: string;
  twitter?: string; // X handle tanpa @, misal "arianthechain"
};

export type WalletConfig = {
  evm: string[];
  solana?: string[];
  bitcoin?: string[];
};

export type ManualHolding = {
  symbol: string;
  name: string;
  amount: number;
  valueUsd: number;
  location: string;
};

export type AppConfig = {
  profile: ProfileConfig;
  wallets: WalletConfig;
  costBasis: {
    mode: "auto" | "first_deposit" | "manual";
    manualValue: number;
  };
  manualHoldings: ManualHolding[];
};
