import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SATOSHILOCK_V3 = "0xf8cBE46f0619471fAf313aed509FC0d0c8fC3683";
const RPC_URL = "https://ethereum-rpc.publicnode.com";

const SEL_GET_LOCKS_BY_RECIPIENT = "0x858e8af4";
const SEL_GET_LOCK = "0xd6f27b58";
const SEL_CLAIMABLE = "0x4eb64431";

function pad(hex: string, length = 64) {
  return hex.replace(/^0x/, "").padStart(length, "0");
}

async function ethCall(data: string) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: SATOSHILOCK_V3, data }, "latest"],
    }),
  });
  return res.json();
}

export async function GET() {
  const addr = "0x1503E5acb203e1C19ad490f34D19271127493E3a";
  const callData =
    SEL_GET_LOCKS_BY_RECIPIENT + pad(addr.toLowerCase().replace(/^0x/, ""));

  const lockIdsResponse = await ethCall(callData);
  const result: any = {
    contract: SATOSHILOCK_V3,
    address: addr,
    getLocksByRecipient_raw: lockIdsResponse,
    locks: [],
  };

  if (lockIdsResponse.result) {
    const data = lockIdsResponse.result.replace(/^0x/, "");
    if (data.length >= 128) {
      const length = parseInt(data.slice(64, 128), 16);
      const ids: string[] = [];
      for (let i = 0; i < length; i++) {
        const start = 128 + i * 64;
        ids.push("0x" + data.slice(start, start + 64));
      }

      // Coba getLock untuk lock pertama
      if (ids.length > 0) {
        const firstId = ids[0];
        const getLockResp = await ethCall(
          SEL_GET_LOCK + firstId.replace(/^0x/, ""),
        );
        const claimableResp = await ethCall(
          SEL_CLAIMABLE + firstId.replace(/^0x/, ""),
        );
        result.locks.push({
          id: firstId,
          getLock_raw: getLockResp,
          claimable_raw: claimableResp,
        });
      }
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
