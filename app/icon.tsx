import { ImageResponse } from "next/og";
import { config } from "@/lib/config";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0b14",
          color: "#d4af37",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: 1,
          borderRadius: 6,
        }}
      >
        {config.profile.initials}
      </div>
    ),
    { ...size },
  );
}
