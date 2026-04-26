# Arian the Chain — Portfolio

TCG-style on-chain portfolio profile page. Buka link → liat portfolio. Ga perlu connect wallet, ga perlu login.

## Stack
- Next.js 14 (App Router)
- Tailwind CSS
- TypeScript
- Zerion API

## Setup

```bash
npm install
cp .env.example .env.local
```

Isi `ZERION_API_KEY` di `.env.local` (daftar di https://developers.zerion.io).

Edit `lib/config.ts`:
- `profile` — nama, handle, X username, domain
- `wallets.evm` — address EVM (auto-detect semua chain EVM)
- `costBasis.mode`:
  - `"first_deposit"` — anchor di deposit pertama (top up berikutnya = P&L)
  - `"auto"` — sum semua incoming tx
  - `"manual"` — fix di `manualValue`

Run:
```bash
npm run dev
```

## Deploy ke Vercel

1. Push ke GitHub
2. Import di vercel.com
3. Set env var `ZERION_API_KEY`
4. Deploy

## Customization

- Font → `app/layout.tsx`
- Warna gold → `tailwind.config.ts`
- Verified badge color → `Verified()` di `components/PortfolioCard.tsx`
- Jumlah holdings tampil → `slice(0, 6)` di `PortfolioCard.tsx`
