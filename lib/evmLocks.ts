/**
 * Detect locked tokens di Ethereum via SatoshiLock V3.
 *
 * Contract: 0xf8cBE46f0619471fAf313aed509FC0d0c8fC3683
 *
 * ABI used:
 *   getLocksByRecipient(address) → bytes32[]
 *   getLock(bytes32) → tuple(creator, recipient, token, totalAmount, withdrawnAmount, ...)
 *   claimable(bytes32) → uint256
 *
 * Decoding tuple return:
 *   Tuple ini static-sized (semua field static — no dynamic strings/arrays),
 *   jadi ABI-encoded tanpa offset prefix. Field langsung di-pack berurutan.
 */

import type { Holding } from "./types";

const SATOSHILOCK_V3 = "0xf8cBE46f0619471fAf313aed509FC0d0c8fC3683";

// Multiple RPC fallback (publicnode kadang rate-limit)
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
];

// Function selectors (4-byte)
const SEL_GET_LOCKS_BY_RECIPIENT = "0x858e8af4";
const SEL_GET_LOCK = "0xd6f27b58";
const SEL_CLAIMABLE = "0x4eb64431";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function pad(hex: string, length = 64): string {
  return hex.replace(/^0x/, "").padStart(length, "0");
}

function stripHex(hex: string): string {
  return hex.replace(/^0x/, "");
}

function readU256(hex: string, slot: number): bigint {
  const start = slot * 64;
  const slice = hex.slice(start, start + 64);
  return BigInt("0x" + (slice || "0"));
}

function readAddress(hex: string, slot: number): string {
  const start = slot * 64;
  const slice = hex.slice(start, start + 64);
  return "0x" + slice.slice(24).toLowerCase();
}

async function ethCallWithFallback(
  contract: string,
  data: string,
): Promise<string> {
  let lastErr: Error | null = null;
  for (const rpcUrl of RPC_URLS) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: contract, data }, "latest"],
        }),
        next: { revalidate: 60 },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} from ${rpcUrl}`);
        continue;
      }
      const json = await res.json();
      if (json.error) {
        lastErr = new Error(
          `RPC error from ${rpcUrl}: ${json.error.message}`,
        );
        continue;
      }
      return json.result || "0x";
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error("All RPCs failed");
}

function decodeLockIds(hex: string): string[] {
  const data = stripHex(hex);
  if (data.length < 128) return [];
  // bytes32[] return encoding: [offset(32) | length(32) | item0 | item1 | ...]
  const length = Number(readU256(data, 1));
  const ids: string[] = [];
  for (let i = 0; i < length; i++) {
    const start = 128 + i * 64;
    ids.push("0x" + data.slice(start, start + 64));
  }
  return ids;
}

/**
 * Decode getLock tuple — static fields only, no offset prefix.
 *
 * Field layout (each 32 bytes):
 *   slot 0: creator (address)
 *   slot 1: recipient (address)
 *   slot 2: token (address)
 *   slot 3: totalAmount (uint256)
 *   slot 4: withdrawnAmount (uint256)
 *   slot 5+: timing & flags (skip)
 */
function decodeLock(hex: string): {
  creator: string;
  recipient: string;
  token: string;
  totalAmount: bigint;
  withdrawnAmount: bigint;
} | null {
  const data = stripHex(hex);
  if (data.length < 5 * 64) return null;
  return {
    creator: readAddress(data, 0),
    recipient: readAddress(data, 1),
    token: readAddress(data, 2),
    totalAmount: readU256(data, 3),
    withdrawnAmount: readU256(data, 4),
  };
}

async function fetchEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return 0;
    const j = await res.json();
    return Number(j?.ethereum?.usd ?? 0);
  } catch {
    return 0;
  }
}

const TOKEN_COLORS: Record<string, { color: string; char: string }> = {
  ETH: { color: "#627EEA", char: "E" },
};

export async function fetchEvmLocks(
  evmAddresses: string[],
): Promise<Holding[]> {
  if (evmAddresses.length === 0) return [];

  const results: Holding[] = [];
  let ethPriceCache: number | null = null;

  for (const addr of evmAddresses) {
    try {
      const callData =
        SEL_GET_LOCKS_BY_RECIPIENT +
        pad(addr.toLowerCase().replace(/^0x/, ""));
      const lockIdsHex = await ethCallWithFallback(SATOSHILOCK_V3, callData);
      const lockIds = decodeLockIds(lockIdsHex);

      console.log(
        `[SatoshiLock-V3] ${addr.slice(0, 10)}... → ${lockIds.length} lock(s)`,
      );

      if (lockIds.length === 0) continue;

      for (const lockId of lockIds) {
        try {
          const lockIdNoPrefix = stripHex(lockId);

          // getLock harus berhasil, kalo revert berarti lockId invalid
          const lockHex = await ethCallWithFallback(
            SATOSHILOCK_V3,
            SEL_GET_LOCK + lockIdNoPrefix,
          );

          const lock = decodeLock(lockHex);
          if (!lock) {
            console.warn(
              `[SatoshiLock-V3]   lock ${lockId.slice(0, 12)}: decode failed (data too short)`,
            );
            continue;
          }

          // claimable() bisa revert kalo lock belum mulai (startTime di masa depan)
          // atau cliff belum habis. Kalo revert → assume nothing claimable yet.
          let claimable = 0n;
          try {
            const claimableHex = await ethCallWithFallback(
              SATOSHILOCK_V3,
              SEL_CLAIMABLE + lockIdNoPrefix,
            );
            claimable = BigInt("0x" + (stripHex(claimableHex) || "0"));
          } catch (claimErr) {
            console.log(
              `[SatoshiLock-V3]   lock ${lockId.slice(0, 12)}: claimable() reverted (likely not started yet) — treating as 0`,
            );
          }

          const stillLocked =
            lock.totalAmount - lock.withdrawnAmount - claimable;

          console.log(
            `[SatoshiLock-V3]   lock=${lockId.slice(0, 12)} token=${lock.token.slice(0, 10)} total=${lock.totalAmount} withdrawn=${lock.withdrawnAmount} claimable=${claimable} stillLocked=${stillLocked}`,
          );

          if (stillLocked <= 0n) continue;

          // Cuma support ETH native saat ini
          if (lock.token !== ZERO_ADDR) {
            console.log(
              `[SatoshiLock-V3]   skip ERC20 lock (token=${lock.token})`,
            );
            continue;
          }

          if (ethPriceCache === null) ethPriceCache = await fetchEthPrice();
          const amount = Number(stillLocked) / 1e18;
          const valueUsd = amount * ethPriceCache;

          if (valueUsd < 0.01) continue;

          results.push({
            symbol: "ETH",
            name: "Ethereum",
            amount,
            priceUsd: ethPriceCache,
            valueUsd,
            change24h: 0,
            iconChar: TOKEN_COLORS.ETH.char,
            color: TOKEN_COLORS.ETH.color,
            isLocked: true,
            location: "SatoshiLock",
          });
          console.log(
            `[SatoshiLock-V3]   → ETH ${amount.toFixed(6)} ($${valueUsd.toFixed(2)})`,
          );
        } catch (innerErr) {
          console.error(
            `[SatoshiLock-V3]   lock ${lockId.slice(0, 12)} failed:`,
            String(innerErr),
          );
        }
      }
    } catch (err) {
      console.error(`[SatoshiLock-V3] ${addr} failed:`, String(err));
    }
  }

  return results;
}
