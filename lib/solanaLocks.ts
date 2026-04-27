/**
 * Detect locked tokens di Solana via Helius RPC.
 *
 * Programs supported:
 *  - Jupiter Lock        : LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
 *  - SatoshiLock V1/V2   : CE7vQdyjXSEvPdeEdrmbEpM8hSPZi2L4MKAWi26kpZ2H
 *
 * Layout VERIFIED dari cryptoretire.app source (buatan user yang sama).
 */

import type { Holding } from "./types";

const HELIUS_RPC = (apiKey: string) =>
  `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

const JUP_LOCK_PROGRAM = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
const SATOSHI_LOCK_PROGRAM = "CE7vQdyjXSEvPdeEdrmbEpM8hSPZi2L4MKAWi26kpZ2H";
const SOL_MINT = "So11111111111111111111111111111111111111112";

// --- helpers ---

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function readU64LE(bytes: Uint8Array, offset: number): number {
  // DataView on Uint8Array, careful with byteOffset
  if (offset + 8 > bytes.length) return 0;
  let result = 0;
  let multiplier = 1;
  for (let i = 0; i < 8; i++) {
    result += bytes[offset + i] * multiplier;
    multiplier *= 256;
  }
  return result;
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function bytesToBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--)
    result += BASE58_ALPHABET[digits[i]];
  return result;
}

async function helius(rpcUrl: string, body: object): Promise<any> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Helius HTTP ${res.status}`);
  return res.json();
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return 0;
    const j = await res.json();
    return Number(j?.solana?.usd ?? 0);
  } catch {
    return 0;
  }
}

const TOKEN_COLORS: Record<string, { color: string; char: string }> = {
  SOL: { color: "#9945FF", char: "S" },
  USDC: { color: "#2775CA", char: "U" },
  USDT: { color: "#26A17B", char: "T" },
  JUP: { color: "#C7F284", char: "J" },
};

function styleFor(symbol: string) {
  return (
    TOKEN_COLORS[symbol] ?? {
      color: `hsl(${(symbol.charCodeAt(0) * 7) % 360}, 50%, 55%)`,
      char: symbol[0] || "?",
    }
  );
}

/**
 * Get program accounts dengan recipient/owner di filter offset.
 * Coba beberapa offset (recipient field bisa beda posisi per program).
 */
async function getAccountsForOwner(
  rpcUrl: string,
  programId: string,
  ownerAddress: string,
  offsets: number[],
): Promise<{ pubkey: string; bytes: Uint8Array }[]> {
  const seen = new Set<string>();
  const results: { pubkey: string; bytes: Uint8Array }[] = [];

  for (const offset of offsets) {
    try {
      const json = await helius(rpcUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
          programId,
          {
            commitment: "confirmed",
            encoding: "base64",
            filters: [{ memcmp: { offset, bytes: ownerAddress } }],
          },
        ],
      });

      const accs: any[] = json?.result ?? [];
      for (const a of accs) {
        if (seen.has(a.pubkey)) continue;
        seen.add(a.pubkey);
        const dataB64 = a.account?.data?.[0];
        if (!dataB64) continue;
        results.push({ pubkey: a.pubkey, bytes: b64ToBytes(dataB64) });
      }
      // Kalo udah dapet di offset ini, bisa stop (sesuai cryptoretire)
      if (results.length > 0) break;
    } catch (err) {
      console.error(
        `[Locks] getProgramAccounts ${programId.slice(0, 8)} offset=${offset} failed:`,
        String(err),
      );
    }
  }
  return results;
}

/**
 * Fetch token metadata + price via Helius getAsset.
 * SOL hardcoded (Helius kadang ga return price-nya).
 */
async function fetchTokenMeta(
  rpcUrl: string,
  mint: string,
  solPriceCache: { value: number | null },
): Promise<{ symbol: string; name: string; decimals: number; priceUsd: number }> {
  if (mint === SOL_MINT) {
    if (solPriceCache.value === null) solPriceCache.value = await fetchSolPrice();
    return {
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      priceUsd: solPriceCache.value,
    };
  }
  try {
    const json = await helius(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: { id: mint, displayOptions: { showFungible: true } },
    });
    const r = json?.result ?? {};
    const tokenInfo = r.token_info ?? {};
    const meta = r.content?.metadata ?? {};
    return {
      symbol: String(tokenInfo.symbol || meta.symbol || "?").toUpperCase(),
      name: String(meta.name || tokenInfo.symbol || "?"),
      decimals: Number(tokenInfo.decimals ?? 0),
      priceUsd: Number(tokenInfo.price_info?.price_per_token ?? 0),
    };
  } catch {
    return { symbol: "?", name: "Unknown", decimals: 0, priceUsd: 0 };
  }
}

/**
 * Main: fetch semua locked positions di Solana untuk address yang dikasih.
 */
export async function fetchSolanaLocks(
  solanaAddresses: string[],
): Promise<Holding[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey || solanaAddresses.length === 0) return [];

  const rpcUrl = HELIUS_RPC(apiKey);
  const all: Holding[] = [];
  const solPriceCache = { value: null as number | null };

  for (const owner of solanaAddresses) {
    // ─── Jupiter Lock ───
    try {
      const accounts = await getAccountsForOwner(
        rpcUrl,
        JUP_LOCK_PROGRAM,
        owner,
        [72, 8],
      );
      console.log(
        `[JupLock] ${owner.slice(0, 8)}... → ${accounts.length} account(s)`,
      );

      for (const acc of accounts) {
        try {
          const { bytes } = acc;
          if (bytes.length < 192) continue;

          // Mint at offset 40..72 (verified)
          const mintAddr = bytesToBase58(bytes.slice(40, 72));
          const cliffUnlock = readU64LE(bytes, 160);
          const amtPerPeriod = readU64LE(bytes, 168);
          const numPeriod = readU64LE(bytes, 176);
          const claimed = readU64LE(bytes, 184);
          const totalDeposited = cliffUnlock + amtPerPeriod * numPeriod;
          const remaining = Math.max(totalDeposited - claimed, 0);

          console.log(
            `[JupLock]   mint=${mintAddr.slice(0, 8)} cliff=${cliffUnlock} perPeriod=${amtPerPeriod} periods=${numPeriod} claimed=${claimed} remaining=${remaining}`,
          );

          if (remaining === 0) continue;

          const meta = await fetchTokenMeta(rpcUrl, mintAddr, solPriceCache);
          const amt = remaining / Math.pow(10, meta.decimals);
          const valueUsd = amt * meta.priceUsd;
          if (valueUsd < 0.01) continue;

          const style = styleFor(meta.symbol);
          all.push({
            symbol: meta.symbol,
            name: meta.name,
            amount: amt,
            priceUsd: meta.priceUsd,
            valueUsd,
            change24h: 0,
            iconChar: style.char,
            color: style.color,
            isLocked: true,
            location: "Jupiter Lock",
          });
          console.log(
            `[JupLock]   → ${meta.symbol} ${amt.toFixed(6)} ($${valueUsd.toFixed(2)})`,
          );
        } catch (e) {
          console.warn("[JupLock] parse:", String(e));
        }
      }
    } catch (e) {
      console.error("[JupLock] failed:", String(e));
    }

    // ─── SatoshiLock V1/V2 (Solana) ───
    try {
      const accounts = await getAccountsForOwner(
        rpcUrl,
        SATOSHI_LOCK_PROGRAM,
        owner,
        [8, 40],
      );
      console.log(
        `[SatoshiLock-Sol] ${owner.slice(0, 8)}... → ${accounts.length} account(s)`,
      );

      for (const acc of accounts) {
        try {
          const { bytes } = acc;
          if (bytes.length < 171) continue;
          // Layout (verified):
          //   72..104  mint
          //   104      amount (u64)
          //   112      withdrawn (u64)
          const mintAddr = bytesToBase58(bytes.slice(72, 104));
          const amount = readU64LE(bytes, 104);
          const withdrawn = readU64LE(bytes, 112);
          const remaining = Math.max(amount - withdrawn, 0);

          console.log(
            `[SatoshiLock-Sol]   mint=${mintAddr.slice(0, 8)} amount=${amount} withdrawn=${withdrawn} remaining=${remaining}`,
          );

          if (remaining === 0) continue;

          const meta = await fetchTokenMeta(rpcUrl, mintAddr, solPriceCache);
          const amt = remaining / Math.pow(10, meta.decimals);
          const valueUsd = amt * meta.priceUsd;
          if (valueUsd < 0.01) continue;

          const style = styleFor(meta.symbol);
          all.push({
            symbol: meta.symbol,
            name: meta.name,
            amount: amt,
            priceUsd: meta.priceUsd,
            valueUsd,
            change24h: 0,
            iconChar: style.char,
            color: style.color,
            isLocked: true,
            location: "SatoshiLock",
          });
          console.log(
            `[SatoshiLock-Sol]   → ${meta.symbol} ${amt.toFixed(6)} ($${valueUsd.toFixed(2)})`,
          );
        } catch (e) {
          console.warn("[SatoshiLock-Sol] parse:", String(e));
        }
      }
    } catch (e) {
      console.error("[SatoshiLock-Sol] failed:", String(e));
    }
  }

  return all;
}
