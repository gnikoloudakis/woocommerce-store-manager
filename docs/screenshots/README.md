# Screenshots

The main `README.md` references the images in this folder. The `*.svg` files are
**placeholders** so the README looks complete before you add real captures.

## How to replace with real screenshots

1. Run the app (`uvicorn api.main:app --reload` + `npm run dev` in `ui/`).
2. Capture each screen below (a viewport around **1440×900** looks best; use PNG).
3. Save each as the filename shown, **replacing** the placeholder.
4. Because the README links to `.svg`, either:
   - save your capture as SVG-wrapped PNG (rare), **or**
   - save as `.png` and update that one image link in `README.md` (change `.svg` → `.png`).

> ⚠️ This repo is **public** — blur or use test data for anything with real
> customer names, emails, addresses, or order values before committing.

## Shot list

| Filename | Screen | What to show |
|----------|--------|--------------|
| `dashboard.png` | Dashboard (`/`) | KPI cards, a sales-trend chart, and the "needs attention" widget |
| `guided-add.png` | Add Products → Guided (`/bulk`) | The wizard with 2–3 product cards, a variation table, stock column |
| `products.png` | Products (`/products`) | The product list with images, filters, and a couple of rows selected |
| `order-boxnow.png` | Order detail (`/orders/:id`) | An order with the BOX NOW panel and the S/M/L size selector |
| `migration.png` | Imports / Exports (`/imports-exports`) | Source → target selectors with a migration in progress |

Add more as you like — just drop the file here and reference it from `README.md`.
