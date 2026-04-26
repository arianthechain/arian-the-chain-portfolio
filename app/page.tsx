import { fetchPortfolio } from "@/lib/zerion";
import { PortfolioCard } from "@/components/PortfolioCard";
import { DownloadButton } from "@/components/DownloadButton";

export const revalidate = 30;

export default async function Home() {
  const data = await fetchPortfolio();

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 relative z-10">
      <div className="w-full max-w-[420px] animate-fade-in">
        <PortfolioCard data={data} />
        <div className="mt-4 flex justify-center">
          <DownloadButton />
        </div>
      </div>
    </main>
  );
}
