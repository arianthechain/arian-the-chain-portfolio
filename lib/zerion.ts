import type { Holding, PortfolioData } from "./types";
import { config } from "./config";

const ZERION_BASE = "https://api.zerion.io/v1";

/**
 * Color mapping untuk avatar token
 */
const TOKEN_COLORS: Record<string, { color: string; char: string }> = {
  BTC: { color: "#F7931A", char: "B" },
  ETH: { color: "#627EEA", char: "E" },
  SOL: { color: "#9945FF", char: "S" },
  LINK: { color: "#2A5ADA", char: "L" },
  AAVE: { color: "#B6509E", char: "A" },
  USDC: { color: "#2775CA", char: "U" },
  USDT: { color: "#26A17B", char: "T" },
  MATIC: { color: "#8247E5", char: "M" },
  ARB: { color: "#28A0F0", char: "A" },
  OP: { color: "#FF0420", char: "O" },
};

function tokenStyle(symbol: string): { color: string; char: string } {
  return TOKEN_COLORS[symbol] ?? { color: "#888780", char: symbol[0] ?? "?" };
}

function authHeader(): string {
  const key = process.env.ZERION_API_KEY;
  if (!key) throw new Error("ZERION_API_KEY not set");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

/**
 * Fetch positions (holdings) untuk satu wallet EVM.
 * Zerion handle multi-chain otomatis di endpoint ini.
 */
async function fetchPositions(address: string): Promise<Holding[]> {
  const url = `${ZERION_BASE}/wallets/${address}/positions/?currency=usd&filter[positions]=no_filter`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Zerion positions ${res.status}`);
  const json = await res.json();

  return (json.data ?? []).map((pos: any): Holding => {
    const attr = pos.attributes ?? {};
    const fungible = attr.fungible_info ?? {};
    const symbol = String(fungible.symbol ?? "").toUpperCase();
    const style = tokenStyle(symbol);
    return {
      symbol,
      name: fungible.name ?? symbol,
      amount: Number(attr.quantity?.float ?? 0),
      priceUsd: Number(attr.price ?? 0),
      valueUsd: Number(attr.value ?? 0),
      change24h: Number(attr.changes?.percent_1d ?? 0),
      color: style.color,
      iconChar: style.char,
    };
  });
}

/**
 * Fetch P&L untuk satu wallet (cost basis + lifetime gain).
 */
async function fetchPnl(address: string): Promise<{ costBasis: number; pnl: number }> {
  const url = `${ZERION_BASE}/wallets/${address}/pnl/?currency=usd`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return { costBasis: 0, pnl: 0 };
  const json = await res.json();
  const attr = json.data?.attributes ?? {};
  return {
    costBasis: Number(attr.total_fees ?? attr.bought ?? 0),
    pnl: Number(attr.realized_gain ?? attr.unrealized_gain ?? 0),
  };
}

/**
 * Cari tx paling awal di wallet (biar bisa tau sejak kapan aktif).
 * Zerion default sort by mined_at desc, jadi kita ambil 1 tx terbaru,
 * lalu pake pagination meta untuk dapet yang paling lama.
 */
async function fetchFirstTxDate(address: string): Promise<Date | null> {
  // Coba ambil transaksi paling lama dengan reverse sort
  const url = `${ZERION_BASE}/wallets/${address}/transactions/?currency=usd&page[size]=100`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const txs = json.data ?? [];
    if (txs.length === 0) return null;
    // Cari tx dengan mined_at paling awal
    let earliest: Date | null = null;
    for (const tx of txs) {
      const minedAt = tx.attributes?.mined_at;
      if (!minedAt) continue;
      const d = new Date(minedAt);
      if (!earliest || d < earliest) earliest = d;
    }
    return earliest;
  } catch {
    return null;
  }
}

/**
 * Aggregate semua wallet jadi satu portfolio.
 * Internal transfer otomatis ke-skip karena Zerion track at-wallet level.
 */
export async function fetchPortfolio(): Promise<PortfolioData> {
  const evmAddresses = config.wallets.evm;
  const hasApiKey = !!process.env.ZERION_API_KEY;
  const hasAddresses = evmAddresses.length > 0;

  console.log("\n[Portfolio] ─────────────────────────────");
  console.log("[Portfolio] API key:", hasApiKey ? "SET ✓" : "MISSING ✗");
  console.log("[Portfolio] EVM addresses:", evmAddresses.length, evmAddresses);

  if (!hasApiKey || !hasAddresses) {
    console.log("[Portfolio] → Using MOCK data (set API key + addresses to use real data)\n");
    return mockPortfolio();
  }

  console.log("[Portfolio] → Fetching REAL data from Zerion...\n");

  const allHoldings: Holding[] = [];
  let totalCostBasis = 0;
  let totalPnl = 0;
  let earliestTx: Date | null = null;

  for (const addr of evmAddresses) {
    try {
      const [positions, pnl, firstTx] = await Promise.all([
        fetchPositions(addr),
        fetchPnl(addr),
        fetchFirstTxDate(addr),
      ]);
      console.log(`[Portfolio]   ${addr.slice(0, 10)}... → ${positions.length} positions, first tx: ${firstTx?.toISOString() ?? "none"}`);
      allHoldings.push(...positions);
      totalCostBasis += pnl.costBasis;
      totalPnl += pnl.pnl;
      if (firstTx && (!earliestTx || firstTx < earliestTx)) {
        earliestTx = firstTx;
      }
    } catch (err) {
      console.error(`[Portfolio]   ${addr} FAILED:`, err);
    }
  }

  // Merge same-symbol holdings dari multi wallet
  const merged = mergeHoldings(allHoldings);

  // Tambahin manual holdings
  for (const m of config.manualHoldings) {
    const style = tokenStyle(m.symbol);
    merged.push({
      symbol: m.symbol,
      name: m.name,
      amount: m.amount,
      priceUsd: m.amount > 0 ? m.valueUsd / m.amount : 0,
      valueUsd: m.valueUsd,
      change24h: 0,
      color: style.color,
      iconChar: style.char,
      isLocked: true,
      location: m.location,
    });
  }

  // Sort by value desc
  merged.sort((a, b) => b.valueUsd - a.valueUsd);

  const totalValue = merged.reduce((s, h) => s + h.valueUsd, 0);
  const change24hUsd = merged.reduce(
    (s, h) => s + (h.valueUsd * h.change24h) / 100,
    0,
  );
  const change24hPct = totalValue > 0 ? (change24hUsd / totalValue) * 100 : 0;

  const costBasis =
    config.costBasis.mode === "manual"
      ? config.costBasis.manualValue
      : totalCostBasis;
  const allTimePnl = totalValue - costBasis;
  const allTimePct = costBasis > 0 ? (allTimePnl / costBasis) * 100 : 0;

  console.log(`[Portfolio] → Total: $${totalValue.toFixed(2)}, ${merged.length} holdings\n`);

  return {
    totalValueUsd: totalValue,
    change24hPct,
    change24hUsd,
    costBasisUsd: costBasis,
    allTimePnlUsd: allTimePnl,
    allTimePnlPct: allTimePct,
    holdings: merged,
    firstSeenAt: earliestTx ? earliestTx.toISOString() : null,
    fetchedAt: new Date().toISOString(),
  };
}

function mergeHoldings(items: Holding[]): Holding[] {
  const map = new Map<string, Holding>();
  for (const h of items) {
    const existing = map.get(h.symbol);
    if (existing) {
      existing.amount += h.amount;
      existing.valueUsd += h.valueUsd;
    } else {
      map.set(h.symbol, { ...h });
    }
  }
  return Array.from(map.values());
}

/**
 * Mock data — kepake kalo belum set API key / wallet address.
 * Biar lo bisa preview UI dulu sebelum config.
 */
function mockPortfolio(): PortfolioData {
  const holdings: Holding[] = [
    { symbol: "BTC", name: "Bitcoin", amount: 8.5, priceUsd: 78016, valueUsd: 663136, change24h: 0.4, color: "#F7931A", iconChar: "B" },
    { symbol: "ETH", name: "Ethereum", amount: 120, priceUsd: 2331, valueUsd: 279720, change24h: 0.46, color: "#627EEA", iconChar: "E" },
    { symbol: "SOL", name: "Solana", amount: 1500, priceUsd: 145.2, valueUsd: 217800, change24h: 2.15, color: "#9945FF", iconChar: "S" },
    { symbol: "LINK", name: "Chainlink", amount: 5000, priceUsd: 14.2, valueUsd: 71000, change24h: -1.2, color: "#2A5ADA", iconChar: "L" },
    { symbol: "AAVE", name: "Aave", amount: 250, priceUsd: 202.5, valueUsd: 50625, change24h: 3.4, color: "#B6509E", iconChar: "A" },
    { symbol: "USDC", name: "USD Coin", amount: 50000, priceUsd: 1, valueUsd: 50000, change24h: 0, color: "#2775CA", iconChar: "U" },
  ];
  const totalValue = holdings.reduce((s, h) => s + h.valueUsd, 0);
  const change24hUsd = holdings.reduce((s, h) => s + (h.valueUsd * h.change24h) / 100, 0);
  const costBasis = 485000;
  return {
    totalValueUsd: totalValue,
    change24hPct: (change24hUsd / totalValue) * 100,
    change24hUsd,
    costBasisUsd: costBasis,
    allTimePnlUsd: totalValue - costBasis,
    allTimePnlPct: ((totalValue - costBasis) / costBasis) * 100,
    holdings,
    firstSeenAt: "2021-01-15T08:23:11Z",
    fetchedAt: new Date().toISOString(),
  };
}
