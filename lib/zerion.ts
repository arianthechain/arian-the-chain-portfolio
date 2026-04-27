import type { Holding, PortfolioData } from "./types";
import { config } from "./config";
import { fetchSolanaLocks } from "./solanaLocks";
import { fetchEvmLocks } from "./evmLocks";

const ZERION_BASE = "https://api.zerion.io/v1";

/**
 * Color mapping untuk avatar token
 */
const TOKEN_COLORS: Record<string, { color: string; char: string }> = {
  BTC: { color: "#F7931A", char: "B" },
  ETH: { color: "#627EEA", char: "E" },
  SOL: { color: "#9945FF", char: "S" },
  BNB: { color: "#F3BA2F", char: "B" },
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
  // btoa works di edge + node, beda sama Buffer.from yang node-only
  return "Basic " + btoa(`${key}:`);
}

/**
 * Fetch Solana positions via Helius DAS API.
 * Free tier: helius.dev → 100k req/bulan.
 */
async function fetchSolanaPositions(address: string): Promise<Holding[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.warn("[Solana] HELIUS_API_KEY not set, skipping Solana fetch");
    return [];
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const holdings: Holding[] = [];

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "portfolio",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: address,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      console.error(`[Solana] Helius HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const result = json?.result ?? {};
    const items: any[] = result.items ?? [];

    // SPL fungible tokens
    for (const item of items) {
      if (item.interface !== "FungibleToken" && item.interface !== "FungibleAsset") {
        continue;
      }
      const tokenInfo = item.token_info ?? {};
      const decimals = Number(tokenInfo.decimals ?? 0);
      const balance = Number(tokenInfo.balance ?? 0) / Math.pow(10, decimals);
      const valueUsd = Number(tokenInfo.price_info?.total_price ?? 0);

      if (valueUsd < 0.01) continue;

      const symbol = String(
        tokenInfo.symbol || item.content?.metadata?.symbol || "?",
      ).toUpperCase();
      const name = item.content?.metadata?.name || symbol;
      const style = tokenStyle(symbol);
      const priceUsd = Number(tokenInfo.price_info?.price_per_token ?? 0);

      holdings.push({
        symbol,
        name,
        amount: balance,
        priceUsd,
        valueUsd,
        change24h: 0,
        iconChar: style.char,
        color: style.color,
      });
    }

    // Native SOL
    const nativeBalance = result.nativeBalance;
    if (nativeBalance) {
      const lamports = Number(nativeBalance.lamports ?? 0);
      const solAmount = lamports / 1e9;
      let solValue = Number(nativeBalance.total_price ?? 0);

      // Kalo Helius ga return price, fallback ke CoinGecko
      if (solValue === 0 && solAmount > 0.0001) {
        try {
          const priceRes = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
            { next: { revalidate: 300 } },
          );
          if (priceRes.ok) {
            const p = await priceRes.json();
            solValue = solAmount * Number(p?.solana?.usd ?? 0);
          }
        } catch {
          // ignore
        }
      }

      if (solValue >= 0.01) {
        const style = tokenStyle("SOL");
        const priceUsd = solAmount > 0 ? solValue / solAmount : 0;
        holdings.push({
          symbol: "SOL",
          name: "Solana",
          amount: solAmount,
          priceUsd,
          valueUsd: solValue,
          change24h: 0,
          iconChar: style.char,
          color: style.color,
        });
      }
    }

    console.log(
      `[Solana]   ${address.slice(0, 10)}... → ${holdings.length} positions`,
    );
  } catch (err) {
    console.error(`[Solana]   ${address} FAILED:`, err);
  }

  return holdings;
}

/**
 * Fetch positions (holdings) untuk satu wallet EVM.
 * Zerion handle multi-chain otomatis di endpoint ini.
 */
async function fetchPositions(address: string): Promise<Holding[]> {
  const url = `${ZERION_BASE}/wallets/${address}/positions/?currency=usd&filter[positions]=no_filter`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(
        `[Portfolio]   positions ${address}: HTTP ${res.status} ${res.statusText}`,
      );
      return [];
    }
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
  } catch (err) {
    console.error(`[Portfolio]   positions ${address} threw:`, err);
    return [];
  }
}

/**
 * Fetch tx stats:
 * - firstTxDate: tanggal tx pertama (untuk "Active since")
 * - totalReceivedUsd: sum semua incoming value (kalo mode "auto")
 * - firstDepositUsd: USD value cuma deposit pertama (kalo mode "first_deposit")
 */
async function fetchTxStats(
  address: string,
  ownAddresses: Set<string>,
): Promise<{
  firstTxDate: Date | null;
  totalReceivedUsd: number;
  firstDepositUsd: number;
  txCount: number;
}> {
  const url = `${ZERION_BASE}/wallets/${address}/transactions/?currency=usd&page[size]=100`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.log(`[Portfolio]   txStats ${address}: HTTP ${res.status}`);
      return {
        firstTxDate: null,
        totalReceivedUsd: 0,
        firstDepositUsd: 0,
        txCount: 0,
      };
    }
    const json = await res.json();
    const txs = json.data ?? [];

    // Collect all incoming external transfers dengan timestamp
    type Inflow = { date: Date; valueUsd: number };
    const inflows: Inflow[] = [];

    for (const tx of txs) {
      const attr = tx.attributes ?? {};
      const minedAt = attr.mined_at;
      if (!minedAt) continue;
      const txDate = new Date(minedAt);

      const transfers = attr.transfers ?? [];
      for (const t of transfers) {
        if (t.direction !== "in") continue;

        const senderAddr = (t.sender ?? t.sender_address ?? "").toLowerCase();
        if (senderAddr && ownAddresses.has(senderAddr)) continue;

        const value = Number(t.value ?? 0);
        if (Number.isFinite(value) && value > 0) {
          inflows.push({ date: txDate, valueUsd: value });
        }
      }
    }

    if (inflows.length === 0) {
      return {
        firstTxDate: null,
        totalReceivedUsd: 0,
        firstDepositUsd: 0,
        txCount: txs.length,
      };
    }

    // Sort by date asc
    inflows.sort((a, b) => a.date.getTime() - b.date.getTime());

    const earliest = inflows[0].date;
    const firstDepositUsd = inflows[0].valueUsd;
    const totalReceivedUsd = inflows.reduce((s, i) => s + i.valueUsd, 0);

    return {
      firstTxDate: earliest,
      totalReceivedUsd,
      firstDepositUsd,
      txCount: txs.length,
    };
  } catch (err) {
    console.error(`[Portfolio]   txStats ${address} error:`, err);
    return {
      firstTxDate: null,
      totalReceivedUsd: 0,
      firstDepositUsd: 0,
      txCount: 0,
    };
  }
}

/**
 * Aggregate semua wallet jadi satu portfolio.
 * Internal transfer otomatis ke-skip karena Zerion track at-wallet level.
 */
export async function fetchPortfolio(): Promise<PortfolioData> {
  const evmAddresses = config.wallets.evm;
  const solanaAddresses = config.wallets.solana ?? [];
  const allAddresses = [...evmAddresses, ...solanaAddresses];
  const hasApiKey = !!process.env.ZERION_API_KEY;
  const hasAddresses = allAddresses.length > 0;

  console.log("\n[Portfolio] ─────────────────────────────");
  console.log("[Portfolio] API key:", hasApiKey ? "SET ✓" : "MISSING ✗");
  console.log("[Portfolio] EVM:", evmAddresses.length, "/ Solana:", solanaAddresses.length);

  if (!hasApiKey || !hasAddresses) {
    console.log("[Portfolio] → Using MOCK data (set API key + addresses to use real data)\n");
    return mockPortfolio();
  }

  console.log("[Portfolio] → Fetching REAL data...\n");

  const ownAddresses = new Set(allAddresses.map((a) => a.toLowerCase()));
  const allHoldings: Holding[] = [];
  let totalReceived = 0;
  let firstDepositValue = 0;
  let earliestTx: Date | null = null;

  // EVM via Zerion
  for (const addr of evmAddresses) {
    try {
      const [positions, txStats] = await Promise.all([
        fetchPositions(addr),
        fetchTxStats(addr, ownAddresses),
      ]);
      console.log(
        `[Portfolio] EVM ${addr.slice(0, 10)}... → ${positions.length} positions, ${txStats.txCount} txs, received $${txStats.totalReceivedUsd.toFixed(2)}, first deposit $${txStats.firstDepositUsd.toFixed(2)}, first tx ${txStats.firstTxDate?.toISOString() ?? "none"}`,
      );
      allHoldings.push(...positions);
      totalReceived += txStats.totalReceivedUsd;
      if (
        txStats.firstTxDate &&
        (!earliestTx || txStats.firstTxDate < earliestTx)
      ) {
        earliestTx = txStats.firstTxDate;
        firstDepositValue = txStats.firstDepositUsd;
      }
    } catch (err) {
      console.error(`[Portfolio] EVM ${addr} FAILED:`, err);
    }
  }

  // Solana via Helius
  for (const addr of solanaAddresses) {
    try {
      const positions = await fetchSolanaPositions(addr);
      allHoldings.push(...positions);
    } catch (err) {
      console.error(`[Portfolio] Solana ${addr} FAILED:`, err);
    }
  }

  // Solana locks (Jupiter Lock + SatoshiLock V1/V2)
  if (solanaAddresses.length > 0) {
    try {
      const locked = await fetchSolanaLocks(solanaAddresses);
      allHoldings.push(...locked);
    } catch (err) {
      console.error("[Portfolio] Solana locks FAILED:", err);
    }
  }

  // EVM locks (SatoshiLock V3 di Ethereum)
  if (evmAddresses.length > 0) {
    try {
      const locked = await fetchEvmLocks(evmAddresses);
      allHoldings.push(...locked);
    } catch (err) {
      console.error("[Portfolio] EVM locks FAILED:", err);
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

  let costBasis: number;
  if (config.costBasis.mode === "manual") {
    costBasis = config.costBasis.manualValue;
  } else if (config.costBasis.mode === "first_deposit") {
    // Auto-detect dari tx history. Kalo Zerion ga return data, fallback ke manualValue.
    costBasis = firstDepositValue || config.costBasis.manualValue;
  } else {
    // "auto" — sum semua incoming, fallback ke manualValue kalo gagal
    costBasis = totalReceived || config.costBasis.manualValue;
  }

  const allTimePnl = totalValue - costBasis;
  const allTimePct = costBasis > 0 ? (allTimePnl / costBasis) * 100 : 0;

  console.log(
    `[Portfolio] → Total: $${totalValue.toFixed(2)}, basis: $${costBasis.toFixed(2)} (${config.costBasis.mode}), P&L: $${allTimePnl.toFixed(2)}\n`,
  );

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
