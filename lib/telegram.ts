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

const fmtIdr = (n: number) => {
  const rounded = Math.round(n);
  return `Rp ${rounded.toLocaleString("en-US")}`;
};

const fmtSignedIdr = (n: number) => {
  if (Math.abs(n) < 1000) return "Rp 0";
  return `${n > 0 ? "+" : "-"}${fmtIdr(Math.abs(n))}`;
};

const fmtPct = (n: number) =>
  `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

// Fetch USD/IDR rate dari exchangerate-api (no key, free, cached 1 hour)
async function getUsdToIdr(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return 16700; // fallback rate
    const json = await res.json();
    return Number(json?.rates?.IDR ?? 16700);
  } catch {
    return 16700;
  }
}

// Fetch BTC price dari Binance (no key, free, no-cache untuk reliability)
async function getBtcPrice(): Promise<number> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      {
        signal: controller.signal,
        cache: "no-store",
      },
    );
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[Telegram] BTC price Binance failed: HTTP ${res.status}, trying fallback`);
      return await getBtcPriceFallback();
    }
    const json = await res.json();
    const price = Number(json?.price ?? 0);
    if (price === 0) return await getBtcPriceFallback();
    console.log(`[Telegram] BTC price (Binance): $${price}`);
    return price;
  } catch (err) {
    console.warn(`[Telegram] BTC Binance error:`, err);
    return await getBtcPriceFallback();
  }
}

// Fallback: Coinbase API
async function getBtcPriceFallback(): Promise<number> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      {
        signal: controller.signal,
        cache: "no-store",
      },
    );
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[Telegram] BTC price Coinbase failed: HTTP ${res.status}`);
      return 0;
    }
    const json = await res.json();
    const price = Number(json?.data?.amount ?? 0);
    console.log(`[Telegram] BTC price (Coinbase): $${price}`);
    return price;
  } catch (err) {
    console.warn(`[Telegram] BTC Coinbase error:`, err);
    return 0;
  }
}

/**
 * Build pesan daily snapshot.
 * yesterday = null kalo first run (belum ada data kemarin).
 */
export async function buildDailyMessage(
  today: PortfolioData,
  yesterday: { totalValueUsd: number; holdings: { symbol: string; valueUsd: number }[] } | null,
): Promise<string> {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  const [usdToIdr, btcPrice] = await Promise.all([
    getUsdToIdr(),
    getBtcPrice(),
  ]);

  const lines: string[] = [];
  lines.push(`📊 <b>Daily Log · ${date}</b>`);
  lines.push("");

  // Net worth (USD + IDR) — pake <code> biar bisa di-copy
  const idrValue = today.totalValueUsd * usdToIdr;
  lines.push(
    `<b>Net Worth</b>   <code>${fmtUsd(today.totalValueUsd)} / ${fmtIdr(idrValue)}</code>`,
  );

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
  if (btcPrice > 0) {
    lines.push(`<code>BTC: ${fmtUsd(btcPrice)}</code>`);
  }
  lines.push(`<code>1 USD = ${fmtIdr(usdToIdr)}</code>`);
  lines.push(`<a href="https://arianthechain.com">arianthechain.com</a>`);

  return lines.join("\n");
}

/**
 * Build pesan hourly diff.
 */
export async function buildHourlyMessage(opts: {
  diffUsd: number;
  diffPct: number;
  totalValueUsd: number;
  biggestMover?: { symbol: string; diffUsd: number };
}): Promise<string> {
  const [usdToIdr, btcPrice] = await Promise.all([
    getUsdToIdr(),
    getBtcPrice(),
  ]);
  const arrow = opts.diffUsd > 0 ? "📈" : "📉";
  const idrValue = opts.totalValueUsd * usdToIdr;

  const lines: string[] = [];
  lines.push(
    `${arrow} <b>${fmtSignedUsd(opts.diffUsd)}</b> (${fmtPct(opts.diffPct)})`,
  );
  lines.push(
    `<code>Net Worth: ${fmtUsd(opts.totalValueUsd)} / ${fmtIdr(idrValue)}</code>`,
  );
  if (opts.biggestMover && Math.abs(opts.biggestMover.diffUsd) >= 0.5) {
    lines.push(
      `<code>${opts.biggestMover.symbol} ${fmtSignedUsd(opts.biggestMover.diffUsd)}</code>`,
    );
  }
  if (btcPrice > 0) {
    lines.push(`<code>BTC: ${fmtUsd(btcPrice)}</code>`);
  }
  lines.push(`<code>1 USD = ${fmtIdr(usdToIdr)}</code>`);
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
