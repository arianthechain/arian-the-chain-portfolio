import { ImageResponse } from "next/og";
import { fetchPortfolio } from "@/lib/zerion";
import { config } from "@/lib/config";

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
  const data = await fetchPortfolio();
  const profile = config.profile;
  const positiveAllTime = data.allTimePnlUsd >= 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0b14",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          color: "white",
          padding: 60,
        }}
      >
        {/* Top label */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 60,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Personal portfolio
        </div>

        <div
          style={{
            position: "absolute",
            top: 40,
            right: 60,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 18,
            color: "#34d399",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: "#34d399",
            }}
          />
          Live
        </div>

        {/* Center: profile + value */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
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
            }}
          >
            {profile.initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 56,
                fontWeight: 500,
                letterSpacing: -1.5,
                lineHeight: 1,
              }}
            >
              {profile.name}
            </div>
            <div
              style={{
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
            fontSize: 140,
            fontWeight: 600,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          {fmtUsd(data.totalValueUsd)}
        </div>
        <div
          style={{
            fontSize: 30,
            color: positiveAllTime ? "#34d399" : "#f87171",
            marginTop: 24,
          }}
        >
          {positiveAllTime ? "+" : ""}
          {fmtUsd(data.allTimePnlUsd)} all-time &middot; {data.holdings.length}{" "}
          assets
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "calc(100% - 120px)",
            fontSize: 18,
            color: "rgba(255,255,255,0.3)",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          <div>{profile.domain}</div>
          {profile.twitter && <div>@{profile.twitter}</div>}
        </div>
      </div>
    ),
    { ...size },
  );
}
