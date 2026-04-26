import { ImageResponse } from "next/og";
import { fetchPortfolio } from "@/lib/zerion";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${config.profile.name} on-chain portfolio`;

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default async function OG() {
  let totalValue = 0;
  let allTimePnl = 0;
  let holdingsCount = 0;

  try {
    const data = await fetchPortfolio();
    totalValue = data.totalValueUsd;
    allTimePnl = data.allTimePnlUsd;
    holdingsCount = data.holdings.length;
  } catch (err) {
    console.error("OG fetch failed:", err);
  }

  const profile = config.profile;
  const positiveAllTime = allTimePnl >= 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0b14",
          color: "white",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "40px 60px",
            fontSize: 18,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex", color: "rgba(255,255,255,0.4)" }}>
            Personal portfolio
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: "#34d399",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: "#34d399",
                marginRight: 10,
                display: "flex",
              }}
            />
            Live
          </div>
        </div>

        <div
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 60px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 50,
            }}
          >
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: 9999,
                background: "#11131f",
                border: "2px solid rgba(212,175,55,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#d4af37",
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: 2,
                marginRight: 28,
              }}
            >
              {profile.initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 56,
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                {profile.name}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: "rgba(255,255,255,0.5)",
                  marginTop: 10,
                }}
              >
                /u/{profile.handle}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: 6,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Net worth
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 140,
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {fmtUsd(totalValue)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: positiveAllTime ? "#34d399" : "#f87171",
              marginTop: 24,
            }}
          >
            {`${positiveAllTime ? "+" : ""}${fmtUsd(allTimePnl)} all-time · ${holdingsCount} assets`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "40px 60px",
            fontSize: 18,
            color: "rgba(255,255,255,0.3)",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>{profile.domain}</div>
          <div style={{ display: "flex" }}>
            {profile.twitter ? `@${profile.twitter}` : ""}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
