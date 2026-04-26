# Arian the Chain — Portfolio

TCG-style on-chain portfolio profile page. Buka link → liat portfolio. Ga perlu connect wallet, ga perlu login.

## Stack
- Next.js 14 (App Router)
- Tailwind CSS
- TypeScript
- Zerion API (auto-fetch holdings + cost basis dari semua wallet)

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`, isi `ZERION_API_KEY` (daftar gratis di https://zerion.io/api).

Lalu edit `lib/config.ts`:
- `profile` — nama, handle, tahun start, dll
- `wallets.evm` — paste address EVM lo (Ethereum, Base, Arbitrum, Polygon, dll auto-detect)
- `wallets.solana` / `wallets.bitcoin` — kalau ada
- `costBasis.mode` — `"auto"` (Zerion calculate) atau `"manual"` (set sendiri)
- `manualHoldings` — buat aset di CEX atau locked di custom contract yang ga ke-detect

Run:

```bash
npm run dev
```

Buka http://localhost:3000

> Belum set API key / address? App pakai mock data dulu — UI tetep keliatan.

## Deploy ke Vercel

1. Push ke GitHub
2. Import di vercel.com
3. Set env var `ZERION_API_KEY` di project settings
4. Deploy

Custom domain → Settings → Domains → tambahin domain lo.

## Cara kerja cost basis auto-detect

Zerion scan semua incoming tx ke wallet lo, ambil harga USD di timestamp masing-masing tx, di-sum jadi cost basis. Internal transfer antar wallet (yang lo daftarin di config) otomatis ke-skip — jadi yang kehitung cuma duit baru dari luar.

Akurasi ~80–90% tergantung kompleksitas history. Kalo ga akurat, ganti ke `mode: "manual"` dan isi `manualValue` sesuai catatan lo.

## Cara nambah aset locked di custom contract

Dua opsi:

**1. Daftarin contract address sebagai wallet** — kalo aset masih kelihatan sebagai balance di contract:

```ts
wallets: {
  evm: ["0xYourMainWallet", "0xYourLockContract"]
}
```

**2. Manual entry** — kalo aset terkunci dalam logic kontrak (ga kelihatan sebagai balance):

```ts
manualHoldings: [
  {
    symbol: "ETH",
    name: "Ethereum (vesting)",
    amount: 50,
    valueUsd: 116000,
    location: "Custom vesting contract"
  }
]
```

## Customization lanjutan

- **Ganti font** — edit `app/layout.tsx`, swap `Instrument_Serif` ke font lain dari `next/font/google`
- **Ganti warna gold** — edit `tailwind.config.ts` di `colors.gold`
- **Ganti text "Legendary" / edition** — edit `lib/config.ts` → `profile.rarity` & `profile.edition`
- **Tambah lebih banyak holdings di display** — edit `components/PortfolioCard.tsx`, ubah `slice(0, 6)` di `visibleHoldings`

## Cache strategy

Halaman di-revalidate tiap 60 detik. Walaupun 1000 orang buka dalam 1 menit, cuma ~1-2 API call ke Zerion. Hemat quota + cepet.
