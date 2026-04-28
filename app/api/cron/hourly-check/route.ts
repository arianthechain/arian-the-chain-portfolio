/**
 * Hourly check — bandingin sama snapshot terakhir, kirim notif kalo signifikan.
 *
 * Trigger: GitHub Actions (lihat .github/workflows/hourly.yml)
 * Threshold: kirim hanya kalo perubahan ≥ $5 atau ≥ 2%
 */

import { NextResponse } from "next/server";
import { fetchPortfolio } from "@/lib/zerion";
import { sendTelegramMessage } from "@/lib/telegram";
import { kvGet, kvSet } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KV_KEY_LAST = "portfolio:last-check";

const THRESHOLD_USD = 1;
// Single condition: hanya cek USD, percent diabaikan

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtSignedUsd = (n: number) => {
  if (Math.abs(n) < 0.5) return "$0";
  return `${n > 0 ? "+" : ""}${fmtUsd(n)}`;
};

const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export async function GET(request: Request) {
  // Optional secret to prevent random hits (set CRON_SECRET di env vars)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const today = await fetchPortfolio();

    let last: {
      totalValueUsd: number;
      holdings: { symbol: string; valueUsd: number }[];
    } | null = null;
    try {
      const cached = await kvGet<{
        totalValueUsd: number;
        holdings: { symbol: string; valueUsd: number }[];
      }>(KV_KEY_LAST);
      if (cached) last = cached;
    } catch (kvErr) {
      console.warn("[Hourly] KV read failed:", String(kvErr));
    }

    if (!last) {
      await kvSet(KV_KEY_LAST, {
        totalValueUsd: today.totalValueUsd,
        holdings: today.holdings.map((h) => ({
          symbol: h.symbol,
          valueUsd: h.valueUsd,
        })),
      });
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "first run, snapshot saved",
      });
    }

    const diffUsd = today.totalValueUsd - last.totalValueUsd;
    const diffPct =
      last.totalValueUsd > 0 ? (diffUsd / last.totalValueUsd) * 100 : 0;

    const passesThreshold = Math.abs(diffUsd) >= THRESHOLD_USD;

    if (!passesThreshold) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "below threshold",
        diffUsd,
        diffPct,
      });
    }

    const arrow = diffUsd > 0 ? "📈" : "📉";

    const lastMap = new Map(last.holdings.map((h) => [h.symbol, h.valueUsd]));
    let biggestMover: { symbol: string; diff: number } | null = null;
    for (const h of today.holdings) {
      const prev = lastMap.get(h.symbol) ?? 0;
      const d = h.valueUsd - prev;
      if (
        biggestMover === null ||
        Math.abs(d) > Math.abs(biggestMover.diff)
      ) {
        biggestMover = { symbol: h.symbol, diff: d };
      }
    }

    const lines = [
      `${arrow} <b>${fmtSignedUsd(diffUsd)} (${fmtPct(diffPct)})</b>`,
      `<code>Net Worth: ${fmtUsd(today.totalValueUsd)}</code>`,
    ];
    if (biggestMover && Math.abs(biggestMover.diff) >= 0.5) {
      lines.push(
        `<code>${biggestMover.symbol} ${fmtSignedUsd(biggestMover.diff)}</code>`,
      );
    }

    const message = lines.join("\n");
    const result = await sendTelegramMessage(message);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    await kvSet(KV_KEY_LAST, {
      totalValueUsd: today.totalValueUsd,
      holdings: today.holdings.map((h) => ({
        symbol: h.symbol,
        valueUsd: h.valueUsd,
      })),
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      diffUsd,
      diffPct,
    });
  } catch (err) {
    console.error("[Hourly] error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
