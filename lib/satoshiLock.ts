/**
 * SatoshiLock detection — fetch user's locked positions via Ethereum RPC.
 *
 * Contract: 0xf8cBE46f0619471fAf313aed509FC0d0c8fC3683 (mainnet)
 *
 * Functions used:
 *   getLocksByRecipient(address)  → bytes32[]
 *   getLock(bytes32)              → tuple (creator, recipient, token, totalAmount, withdrawnAmount, ...)
 *   claimable(bytes32)            → uint256
 *
 * Locked-still = totalAmount - withdrawnAmount - claimable
 * Token = address(0) → ETH native
 */

import type { Holding } from "./types";

const SATOSHILOCK_ADDRESSES = [
  "0xf8cBE46f0619471fAf313aed509FC0d0c8fC3683", // SatoshiLock latest (1 hari)
  "0xd40febe77b4a9bde56e13cf4067638b98a061925", // SatoshiLockV2 (3 hari)
  "0xbd1d35b574361632ec2cc1376dcd346741997474", // SatoshiLock V1 (4 hari)
];
const RPC_URL = "https://ethereum-rpc.publicnode.com";

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

async function ethCall(contract: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
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
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result || "0x";
}

function decodeLockIds(hex: string): string[] {
  const data = stripHex(hex);
  if (data.length < 128) return [];
  const length = Number(readU256(data, 1));
  const ids: string[] = [];
  for (let i = 0; i < length; i++) {
    const start = 128 + i * 64;
    ids.push("0x" + data.slice(start, start + 64));
  }
  return ids;
}

function decodeLock(hex: string): {
  creator: string;
  recipient: string;
  token: string;
  totalAmount: bigint;
  withdrawnAmount: bigint;
} {
  const data = stripHex(hex);
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
  USDC: { color: "#2775CA", char: "U" },
  USDT: { color: "#26A17B", char: "T" },
};

function styleFor(symbol: string) {
  return (
    TOKEN_COLORS[symbol] ?? {
      color: `hsl(${(symbol.charCodeAt(0) * 7) % 360}, 50%, 55%)`,
      char: symbol[0] || "?",
    }
  );
}

export async function fetchSatoshiLockHoldings(
  evmAddresses: string[],
): Promise<Holding[]> {
  if (evmAddresses.length === 0) return [];

  const results: Holding[] = [];
  let ethPriceCache: number | null = null;

  for (const addr of evmAddresses) {
    for (const contract of SATOSHILOCK_ADDRESSES) {
      try {
        const callData =
          SEL_GET_LOCKS_BY_RECIPIENT +
          pad(addr.toLowerCase().replace(/^0x/, ""));
        const lockIdsHex = await ethCall(contract, callData);
        const lockIds = decodeLockIds(lockIdsHex);

        if (lockIds.length === 0) continue;

        console.log(
          `[SatoshiLock] ${addr.slice(0, 10)}... @ ${contract.slice(0, 10)}... → ${lockIds.length} lock(s)`,
        );

        for (const lockId of lockIds) {
          try {
            const lockIdNoPrefix = stripHex(lockId);
            const [lockHex, claimableHex] = await Promise.all([
              ethCall(contract, SEL_GET_LOCK + lockIdNoPrefix),
              ethCall(contract, SEL_CLAIMABLE + lockIdNoPrefix),
            ]);

            const lock = decodeLock(lockHex);
            const claimable = BigInt("0x" + (stripHex(claimableHex) || "0"));

            const stillLocked =
              lock.totalAmount - lock.withdrawnAmount - claimable;
            if (stillLocked <= 0n) continue;

            if (lock.token !== ZERO_ADDR) {
              console.log(
                `[SatoshiLock]   skip ERC20 lock (token=${lock.token}, not yet supported)`,
              );
              continue;
            }

            if (ethPriceCache === null) ethPriceCache = await fetchEthPrice();
            const priceUsd = ethPriceCache;
            const decimals = 18;
            const amountReadable = Number(stillLocked) / Math.pow(10, decimals);
            const valueUsd = amountReadable * priceUsd;

            if (valueUsd < 0.01 && amountReadable < 0.0001) continue;

            const style = styleFor("ETH");

            results.push({
              symbol: "ETH",
              name: "Ethereum",
              amount: amountReadable,
              priceUsd,
              valueUsd,
              change24h: 0,
              iconChar: style.char,
              color: style.color,
              isLocked: true,
              location: "SatoshiLock",
            });

            console.log(
              `[SatoshiLock]   → ETH ${amountReadable.toFixed(6)} ($${valueUsd.toFixed(2)}) locked`,
            );
          } catch (innerErr) {
            console.error(
              `[SatoshiLock]   lock ${lockId} @ ${contract.slice(0, 10)} failed:`,
              String(innerErr),
            );
          }
        }
      } catch (err) {
        console.error(
          `[SatoshiLock] ${addr} @ ${contract.slice(0, 10)} failed:`,
          String(err),
        );
      }
    }
  }

  return results;
}
