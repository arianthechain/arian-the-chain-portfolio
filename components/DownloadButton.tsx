"use client";

import { useState } from "react";

export function DownloadButton() {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const card = document.getElementById("portfolio-card");
      if (!card) {
        console.error("Card element not found");
        return;
      }
      const dataUrl = await toPng(card, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0a0b14",
      });
      const link = document.createElement("a");
      link.download = `portfolio-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={busy}
      className="text-[10px] tracking-[0.18em] uppercase text-white/40 hover:text-white/80 font-mono transition-colors disabled:opacity-50 cursor-pointer"
    >
      {busy ? "Saving…" : "↓ Save as image"}
    </button>
  );
}
