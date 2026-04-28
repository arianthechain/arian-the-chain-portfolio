/**
 * Send daily snapshot ke Telegram channel.
 *
 * Pakai Telegram Bot API langsung (no library, fetch only).
 */

import type { PortfolioData } from "./types";

const TG_API = "https://api.telegram.org";

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

const fmtPct = (n: number) =>
  `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

/**
 * Build pesan daily snapshot.
 * yesterday = null kalo first run (belum ada data kemarin).
 */
export function buildDailyMessage(
  today: PortfolioData,
  yesterday: { totalValueUsd: number; holdings: { symbol: string; valueUsd: number }[] } | null,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  const lines: string[] = [];
  lines.push(`📊 <b>Daily Log · ${date}</b>`);
  lines.push("");

  // Net worth
  lines.push(`<b>Net Worth</b>   ${fmtUsd(today.totalValueUsd)}`);

  // Today's diff (only if yesterday exists)
  if (yesterday) {
    const diff = today.totalValueUsd - yesterday.totalValueUsd;
    const pct =
      yesterday.totalValueUsd > 0
        ? (diff / yesterday.totalValueUsd) * 100
        : 0;
    if (Math.abs(diff) >= 0.5) {
      const arrow = diff > 0 ? "📈" : "📉";
      lines.push(
        `<b>Today</b>       ${fmtSignedUsd(diff)} (${fmtPct(pct)}) ${arrow}`,
      );
    } else {
      lines.push(`<b>Today</b>       $0 (flat)`);
    }
  }

  // All-time
  lines.push(
    `<b>All-time</b>    ${fmtSignedUsd(today.allTimePnlUsd)} (${fmtPct(today.allTimePnlPct)})`,
  );
  lines.push("");

  // Holdings
  lines.push("<b>Holdings</b>");
  const totalValue = today.totalValueUsd || 1;
  const visible = today.holdings.filter((h) => h.valueUsd >= 0.5);
  const yesterdayMap = new Map(
    (yesterday?.holdings ?? []).map((h) => [h.symbol, h.valueUsd]),
  );

  for (const h of visible) {
    const pct = ((h.valueUsd / totalValue) * 100).toFixed(1);
    const yVal = yesterdayMap.get(h.symbol);
    let diffStr = "";
    if (yVal !== undefined) {
      const d = h.valueUsd - yVal;
      if (Math.abs(d) >= 0.5) {
        diffStr = `  ${fmtSignedUsd(d)}`;
      }
    }
    lines.push(
      `  <code>${h.symbol.padEnd(6)}${fmtUsd(h.valueUsd).padStart(7)}  ${pct}%</code>${diffStr}`,
    );
  }

  lines.push("");
  lines.push(`<a href="https://arianthechain.com">arianthechain.com</a>`);

  return lines.join("\n");
}

/**
 * Kirim message ke Telegram channel.
 */
export async function sendTelegramMessage(text: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }

  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json();
    if (!json.ok) {
      return { ok: false, error: `TG error: ${json.description}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
