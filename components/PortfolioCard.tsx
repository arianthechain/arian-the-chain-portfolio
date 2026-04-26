import type { PortfolioData } from "@/lib/types";
import { config } from "@/lib/config";
import { SyncTime } from "./SyncTime";

// Clamp tiny values ke 0 biar ga muncul "-$0" atau "-0.00%" yang aneh
const clamp = (n: number, threshold = 0.5) =>
  Math.abs(n) < threshold ? 0 : n;

const fmtUsd = (n: number) => {
  const clean = clamp(n);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(clean);
};

const fmtPct = (n: number) => {
  const clean = Math.abs(n) < 0.01 ? 0 : n;
  return `${clean > 0 ? "+" : ""}${clean.toFixed(2)}%`;
};

const fmtSignedUsd = (n: number) => {
  const clean = clamp(n);
  if (clean === 0) return "$0";
  return `${clean > 0 ? "+" : ""}${fmtUsd(clean)}`;
};

function activeSinceText(
  data: PortfolioData,
  profile: typeof config.profile,
): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // Manual override pertama kalo di-set
  if (profile.activeSince) return profile.activeSince;
  // Auto-detect dari tx pertama
  if (data.firstSeenAt) return fmt(new Date(data.firstSeenAt));
  // Fallback: kalo ada holdings tapi tx history ga ke-detect, pake hari ini
  if (data.holdings.length > 0) return fmt(new Date());
  return "—";
}

export function PortfolioCard({ data }: { data: PortfolioData }) {
  const { profile } = config;
  const visibleHoldings = data.holdings.slice(0, 6);
  const totalValue = data.totalValueUsd || 1;

  const cleanPctAll = Math.abs(data.allTimePnlPct) < 0.01 ? 0 : data.allTimePnlPct;

  const colorAllTime =
    cleanPctAll > 0
      ? "text-emerald-400"
      : cleanPctAll < 0
        ? "text-red-400"
        : "text-white/70";

  return (
    <div className="card-holo rounded-[14px] p-[1.5px]">
      <div className="rounded-[12px] p-5 sm:p-6">
        {/* Top: status + label */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/5">
          <span className="text-[10px] tracking-[0.18em] uppercase text-white/40 font-mono">
            Personal portfolio
          </span>
          <LiveIndicator />
        </div>

        {/* Art panel: avatar + name */}
        <div className="foil rounded-lg bg-gradient-to-b from-ink-700 to-ink-800 border border-white/5 px-5 py-7 text-center mb-4">
          <div className="inline-flex w-16 h-16 rounded-full bg-ink-950 border border-gold-500/30 items-center justify-center mb-3 relative z-10">
            <span className="font-display text-2xl text-gold-400 tracking-wider">
              {profile.initials}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-1 relative z-10">
            <h1 className="font-display text-2xl text-white leading-none">
              {profile.name}
            </h1>
            <Verified />
          </div>
          <p className="font-mono text-[11px] text-white/50 relative z-10">
            {profile.twitter ? (
              <a
                href={`https://x.com/${profile.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/80 transition-colors"
              >
                /u/{profile.handle}
              </a>
            ) : (
              <>/u/{profile.handle}</>
            )}
          </p>
        </div>

        {/* Net worth */}
        <div className="text-center py-4 border-y border-white/5 mb-4">
          <p className="text-[10px] tracking-[0.18em] uppercase text-white/40 font-mono mb-1.5">
            Net worth
          </p>
          <p className="font-display text-[32px] text-white leading-none tracking-tight">
            {fmtUsd(data.totalValueUsd)}
          </p>
        </div>

        {/* Stats */}
        <div className="mb-4">
          <p className="text-[10px] tracking-[0.18em] uppercase text-white/40 font-mono mb-2">
            Stats
          </p>
          <Stat label="Cost basis" value={fmtUsd(data.costBasisUsd)} />
          <Stat
            label="P&L"
            value={`${fmtSignedUsd(data.allTimePnlUsd)} · ${fmtPct(cleanPctAll)}`}
            valueClass={colorAllTime}
          />
          <Stat label="Active since" value={activeSinceText(data, profile)} />
          <Stat label="Holdings" value={`${data.holdings.length} assets`} />
        </div>

        {/* Holdings list */}
        <div className="mb-4">
          <p className="text-[10px] tracking-[0.18em] uppercase text-white/40 font-mono mb-2">
            Holdings
          </p>
          <div
            className={
              visibleHoldings.length <= 2
                ? "flex flex-col gap-1.5"
                : "grid grid-cols-2 gap-x-3 gap-y-1.5"
            }
          >
            {visibleHoldings.map((h) => {
              const pct = (h.valueUsd / totalValue) * 100;
              return (
                <div
                  key={h.symbol}
                  className="flex items-center gap-2 text-[11px]"
                  title={h.isLocked ? `${h.location}` : `${h.amount} ${h.symbol}`}
                >
                  <span
                    className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-medium text-white shrink-0"
                    style={{ background: h.color }}
                  >
                    {h.iconChar}
                  </span>
                  <span className="text-white/90">{h.symbol}</span>
                  <span className="ml-auto text-white/40 font-mono">
                    {fmtUsd(h.valueUsd)}
                    <span className="text-white/30 mx-1.5">·</span>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-3 border-t border-white/5 text-[9px] tracking-[0.15em] uppercase text-white/30 font-mono">
          <span>
            <SyncTime fetchedAt={data.fetchedAt} />
          </span>
          <span>{profile.domain}</span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-dashed border-white/5 last:border-0">
      <span className="text-[12px] text-white/50">{label}</span>
      <span className={`text-[12px] font-medium font-mono ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

function Verified() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Verified">
      <circle cx="12" cy="12" r="10" fill="#1d9bf0" />
      <path
        d="M7.5 12.5l3 3 6-7"
        stroke="white"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></span>
        <span className="relative rounded-full w-2 h-2 bg-emerald-400"></span>
      </span>
      <span className="text-[10px] tracking-[0.18em] uppercase text-emerald-400 font-mono">
        Live
      </span>
    </div>
  );
}
