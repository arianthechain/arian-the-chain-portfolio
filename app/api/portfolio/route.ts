import { NextResponse } from "next/server";
import { fetchPortfolio } from "@/lib/zerion";

export const revalidate = 60;

export async function GET() {
  try {
    const data = await fetchPortfolio();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("Portfolio fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 });
  }
}
