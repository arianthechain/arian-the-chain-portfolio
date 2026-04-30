/**
 * Daily snapshot cron — Vercel Cron schedule: jam 1 UTC = 8 AM WIB.
 *
 * Flow:
 * 1. Fetch portfolio sekarang
 * 2. Ambil snapshot kemarin dari Vercel KV (kalo ada)
 * 3. Build message dengan diff
 * 4. Kirim ke Telegram
 * 5. Simpan snapshot hari ini ke KV (jadi "kemarin" buat besok)
 */

import { NextResponse } from "next/server";
import { fetchPortfolio } from "@/lib/zerion";
import { buildDailyMessage, sendTelegramMessage } from "@/lib/telegram";
import { kvGet, kvSet } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KV_KEY = "portfolio:last-snapshot";

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  // Skip auth check kalo ga di set, biar bisa manual trigger
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 1. Fetch current portfolio
    const today = await fetchPortfolio();

    // 2. Ambil snapshot kemarin dari KV
    let yesterday: {
      totalValueUsd: number;
      holdings: { symbol: string; valueUsd: number }[];
    } | null = null;
    try {
      const cached = await kvGet<{
        totalValueUsd: number;
        holdings: { symbol: string; valueUsd: number }[];
        savedAt: string;
      }>(KV_KEY);
      if (cached) yesterday = cached;
    } catch (kvErr) {
      console.warn("[Cron] KV read failed:", String(kvErr));
    }

    // 3. Build message
    const message = await buildDailyMessage(today, yesterday);
    console.log("[Cron] message:\n", message);

    // 4. Send to Telegram
    const result = await sendTelegramMessage(message);
    if (!result.ok) {
      console.error("[Cron] Telegram failed:", result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    // 5. Save snapshot today (jadi "kemarin" untuk run besok)
    try {
      await kvSet(KV_KEY, {
        totalValueUsd: today.totalValueUsd,
        holdings: today.holdings.map((h) => ({
          symbol: h.symbol,
          valueUsd: h.valueUsd,
        })),
        savedAt: new Date().toISOString(),
      });
    } catch (kvErr) {
      console.warn("[Cron] KV write failed:", String(kvErr));
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      hadYesterday: yesterday !== null,
      totalValueUsd: today.totalValueUsd,
    });
  } catch (err) {
    console.error("[Cron] error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
