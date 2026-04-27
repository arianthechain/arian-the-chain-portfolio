/**
 * Jupiter Lock detection via on-chain RPC (Helius).
 *
 * Cara kerja:
 * 1. Query getProgramAccounts ke program Jupiter Lock (LocpQg...QqQqjn)
 * 2. Filter: data size + memcmp offset 8 = recipient address
 * 3. Parse binary account data → ambil token_mint + amounts
 * 4. Locked = total - already_claimed
 * 5. Convert ke USD via Jupiter price API
 *
 * Reference: https://github.com/jup-ag/jup-lock
 *
 * VestingEscrow account layout (Anchor, little-endian):
 *   0..8     : discriminator
 *   8..40    : recipient (Pubkey, 32 bytes)
 *   40..72   : creator (Pubkey, 32 bytes)
 *   72..104  : token_mint (Pubkey, 32 bytes)
 *   104..136 : token_program_flag + escrow_token (skip)
 *   136..168 : escrow_token (Pubkey)
 *   168..176 : cliff_time (u64)
 *   176..184 : frequency (u64)
 *   184..192 : cliff_unlock_amount (u64)
 *   192..200 : amount_per_period (u64)
 *   200..208 : number_of_periods (u64)
 *   208..216 : total_claimed_amount (u64)
 *
 * Total locked = cliff_unlock_amount + (amount_per_period × number_of_periods)
 * Still locked = Total locked - total_claimed_amount
 */

import type { Holding } from "./types";

const JUP_LOCK_PROGRAM = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export type LockedHolding = Holding & {
  isLocked: true;
  location: string;
};

/**
 * Decode base64 → Uint8Array (works di edge runtime tanpa Buffer)
 */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Read u64 little-endian → number (loss of precision di atas 2^53,
 * tapi cukup buat amount token normal)
 */
function readU64LE(bytes: Uint8Array, offset: number): number {
  let result = 0;
  let multiplier = 1;
  for (let i = 0; i < 8; i++) {
    result += bytes[offset + i] * multiplier;
    multiplier *= 256;
  }
  return result;
}

/**
 * Encode 32-byte pubkey ke base58 string (manual, ga pake bs58 lib biar bundle kecil)
 */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function bytesToBase58(bytes: Uint8Array): string {
  // Hitung leading zeros (jadi "1" di base58)
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Convert ke base58 via repeated division
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
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

/**
 * Fetch SPL token metadata (decimals + symbol) via Helius DAS getAsset
 */
async function fetchTokenMeta(
  mint: string,
  rpcUrl: string,
): Promise<{ symbol: string; name: string; decimals: number; priceUsd: number }> {
  // SOL hardcode
  if (mint === SOL_MINT) {
    return { symbol: "SOL", name: "Solana", decimals: 9, priceUsd: 0 };
  }

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "asset",
        method: "getAsset",
        params: { id: mint, displayOptions: { showFungible: true } },
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.result ?? {};
    const tokenInfo = result.token_info ?? {};
    const meta = result.content?.metadata ?? {};
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
 * Fetch SOL price via CoinGecko (fallback kalo Helius ga return)
 */
async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return Number(json?.solana?.usd ?? 0);
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
 * Main: fetch semua locked positions buat semua Solana addresses lo.
 */
export async function fetchJupLockHoldings(
  solanaAddresses: string[],
): Promise<LockedHolding[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey || solanaAddresses.length === 0) return [];

  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const all: LockedHolding[] = [];

  for (const recipient of solanaAddresses) {
    try {
      // Query getProgramAccounts dengan filter recipient
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "lock",
          method: "getProgramAccounts",
          params: [
            JUP_LOCK_PROGRAM,
            {
              encoding: "base64",
              filters: [
                // Filter: bytes pada offset 8-40 (recipient field) = address ini
                {
                  memcmp: {
                    offset: 8,
                    bytes: recipient,
                  },
                },
              ],
            },
          ],
        }),
        next: { revalidate: 60 },
      });

      if (!res.ok) {
        console.error(`[JupLock] HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const accounts: any[] = json?.result ?? [];
      console.log(
        `[JupLock] ${recipient.slice(0, 8)}... → ${accounts.length} lock account(s)`,
      );

      for (const acc of accounts) {
        try {
          const dataB64 = acc.account?.data?.[0];
          if (!dataB64) continue;
          const bytes = b64ToBytes(dataB64);
          if (bytes.length < 216) {
            console.log(`[JupLock]   account too small: ${bytes.length} bytes`);
            continue;
          }

          // Parse fields
          const tokenMintBytes = bytes.slice(72, 104);
          const tokenMint = bytesToBase58(tokenMintBytes);
          const cliffUnlockAmount = readU64LE(bytes, 184);
          const amountPerPeriod = readU64LE(bytes, 192);
          const numberOfPeriods = readU64LE(bytes, 200);
          const claimed = readU64LE(bytes, 208);

          const totalLocked =
            cliffUnlockAmount + amountPerPeriod * numberOfPeriods;
          const stillLocked = Math.max(totalLocked - claimed, 0);

          console.log(
            `[JupLock]   parsed: mint=${tokenMint.slice(0, 8)} cliff=${cliffUnlockAmount} perPeriod=${amountPerPeriod} periods=${numberOfPeriods} claimed=${claimed} total=${totalLocked} stillLocked=${stillLocked}`,
          );

          if (stillLocked === 0) continue;

          // Fetch metadata
          const meta = await fetchTokenMeta(tokenMint, rpcUrl);
          let priceUsd = meta.priceUsd;
          let symbol = meta.symbol;
          let name = meta.name;

          // WSOL = Wrapped SOL — perlakukan sama kayak SOL (harga + label)
          if (tokenMint === SOL_MINT) {
            symbol = "SOL";
            name = "Solana";
            if (priceUsd === 0) priceUsd = await fetchSolPrice();
          }

          const decimals = meta.decimals;
          const amountReadable = stillLocked / Math.pow(10, decimals);
          const valueUsd = amountReadable * priceUsd;

          if (valueUsd < 0.01 && amountReadable < 0.0001) continue;

          const style = styleFor(symbol);

          all.push({
            symbol,
            name,
            amount: amountReadable,
            priceUsd,
            valueUsd,
            change24h: 0,
            iconChar: style.char,
            color: style.color,
            isLocked: true,
            location: "Jupiter Lock",
          });

          console.log(
            `[JupLock]   → ${symbol} ${amountReadable.toFixed(4)} ($${valueUsd.toFixed(2)}) locked`,
          );
        } catch (parseErr) {
          console.error("[JupLock] parse error:", parseErr);
        }
      }
    } catch (err) {
      console.error(`[JupLock] ${recipient} fetch failed:`, err);
    }
  }

  return all;
}
