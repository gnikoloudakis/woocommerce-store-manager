# WooCommerce Store Manager (multi-site)

A self-hosted admin panel for managing one or more WooCommerce stores from a single browser tab. A site selector in the nav bar lets you switch between configured sites; every page (Dashboard, Products, Orders, Coupons, Categories, Taxonomy, Imports/Exports) re-fetches data for the selected store. FastAPI backend that wraps the WooCommerce REST API, the WordPress Media/Posts APIs, and a couple of niche integrations, plus a React UI for everything you'd normally do across a dozen WP-admin pages.

Beyond day-to-day store admin, it can **migrate a whole store to another site** — products, variations, orders, customers, coupons, taxes, shipping, blog posts, media, and store/email settings — with upsert semantics and URL rewriting.

Built originally to replace a hardcoded `ProductStore` Python script with something you can actually drive from a browser.

## Features

**Products**
- Browse / search / filter products (status, type, category, tag, stock)
- Per-page selector (20 / 50 / 100 / All) with server-side pagination
- Create variable products with size/color variations, per-variation pricing, and per-variation images
- Edit metadata, categories, tags, status, prices; manage main images independently with a media-library picker and lightbox preview
- Bulk import from a JSON array (upsert: existing products are updated, new ones are created — variations and long descriptions preserved on update)
- Row selection with bulk actions: append secret tags to many products at once, bulk delete
- Image hygiene tools: **image audit** (flags products whose images have suspicious numeric/external filenames) and **relink images** (swaps external image URLs for local WP media by filename match, so WooCommerce stops re-sideloading on every save)

**Categories, tags & attributes**
- Dedicated Categories page: list, create, edit, delete product categories
- Taxonomy page: manage global attributes and their terms (e.g. Color, Size), plus tags — full CRUD

**Secret tags**
- Hidden internal-only tags stored as a `<span style="display:none">` inside the product description
- Searchable from the WooCommerce admin; invisible to customers
- Editable inline in the products table, in the product edit page, and via bulk operations

**Coupons**
- List, create, edit, delete WooCommerce coupons
- Full modal covering discount type, amount, expiry, usage limits, product/category/email restrictions, and behavior flags (individual use, free shipping, exclude sale items)

**Orders**
- List with status filter, search, inline status changes
- Order detail page with line items, billing, shipping, customer notes, and internal notes (read + add)
- Filter orders by URL-driven date range (used by dashboard chart drill-down)

**BOX NOW integration** (Greek parcel locker network)
- Full Partner API v7.2 client: OAuth2 auth, create voucher, cancel, get state, fetch PDF/ZPL label
- Voucher number persisted to WC order meta in the format expected by the upstream WordPress plugin
- Order notes added on create / cancel / webhook events
- Webhook receiver at `POST /api/orders/boxnow/webhook` for parcel state changes
- Tolerant voucher extraction: handles list-formatted values, multiple meta key variants, and heuristic 10-digit detection

**Dashboard**
- KPI cards for total products, stock status, stock value, period revenue / orders / AOV / refunds
- Period selector: this week / month / last month / year / all time, with period-over-period delta percentages
- "Needs your attention" widget: orders to ship, expiring coupons, low-stock products
- Sales trend (daily bars, auto-switches to monthly buckets for year/all-time)
- Orders per month line chart with clickable dots that drill down to the orders list
- Day-of-week × hour heatmap of order timing
- Top sellers, top customers, active coupons widget
- Distribution charts: products per category / tag / secret tag
- Out-of-stock list and recent orders feed
- Compact / comfortable density toggle (persisted)
- Quick-action buttons: New Product, New Coupon, Bulk Import, Refresh

**Site-to-site migration (Imports / Exports page)**
- Copy content between any two configured sites, driven from one screen with live progress
- **Blog:** export WordPress posts (with categories, tags, featured images) and import into a target site — upsert by slug, image URLs re-hosted and rewritten, missing categories/tags created
- **Media:** export the WP media library and import into another site, deduplicating by filename + title (optional overwrite)
- **WooCommerce data:** products + variations, coupons, orders, customers, tax classes/rates, shipping zones/methods/classes, and store + email settings
- **Taxonomy sync:** replicate attributes, shipping classes, categories, and tags to the target before importing products
- Upsert everywhere (by SKU / name / slug / email / code), with ID-mapping helpers and resilient fallbacks (e.g. an order that fails with unresolvable coupons/line items is retried stripped down)

## Tech stack

| Layer    | Stack                                          |
|----------|------------------------------------------------|
| Backend  | Python 3.12, FastAPI, Pydantic 2, `woocommerce` SDK |
| Frontend | React 18 + Vite, TanStack Query, React Router, Tailwind CSS, `react-hot-toast` |
| External | WooCommerce REST API v3, WP Media API, BOX NOW Partner API v7.2 |

## Setup

### Prerequisites

- Python 3.12 (the project uses `.venv/` with 3.12)
- Node 18+
- A WooCommerce store with:
  - REST API keys (`Consumer Key` + `Consumer Secret`) with read/write permission on products, orders, coupons, and reports
  - A WordPress application password for media uploads

### 1. Install Python dependencies

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Install JS dependencies

```bash
cd ui
npm install
```

### 3. Configure sites

Sites are declared in **`sites.json`** at the project root. Each entry maps field names to `.env` variable names — credentials are never stored in the JSON file itself.

The file already contains two example sites. To add a third site:

```json
{
  "id": "my_new_site",
  "label": "my-new-site.example.com",
  "env": {
    "wc_url":      "MY_SITE_URL",
    "wp_user":     "MY_SITE_WP_USER",
    "wp_password": "MY_SITE_WP_PASSWORD",
    "wc_key":      "MY_SITE_CONSUMER_KEY",
    "wc_secret":   "MY_SITE_CONSUMER_SECRET"
  }
}
```

Then add the corresponding values to `.env`:

```bash
MY_SITE_URL=https://my-new-site.example.com
MY_SITE_WP_USER=admin
MY_SITE_WP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
MY_SITE_CONSUMER_KEY=ck_...
MY_SITE_CONSUMER_SECRET=cs_...
```

Restart the backend — the new site will appear in the nav selector immediately.

### 4. Configure environment

Create `.env` in the project root with credentials for every site listed in `sites.json`:

```bash
# ── Site 1: cranky.gr ────────────────────────────────────────────────────────
WC_URL=https://cranky.gr
CONSUMER_KEY=ck_...
CONSUMER_SECRET=cs_...
WP_USER=admin
WP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# ── Site 2: cranky.cranky.gr ─────────────────────────────────────────────────
CRANKY_CRANKY_URL=https://cranky.cranky.gr
CRANKY_CRANKY_CONSUMER_KEY=ck_...
CRANKY_CRANKY_SECRET=cs_...
CRANKY_CRANKY_WP_USER=admin
CRANKY_CRANKY_WP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# ── BOX NOW (optional — only if using the locker integration) ─────────────────
BOXNOW_API_URL=https://api-stage.boxnow.gr      # or production URL
BOXNOW_CLIENT_ID=
BOXNOW_CLIENT_SECRET=
BOXNOW_WAREHOUSE_ID=                            # your pickup point locationId
BOXNOW_WAREHOUSE_CONTACT_NAME=
BOXNOW_WAREHOUSE_CONTACT_EMAIL=
BOXNOW_WAREHOUSE_CONTACT_PHONE=+30...           # full international format
BOXNOW_LOCKER_META_KEY=_boxnow_locker_id        # the meta key your WP plugin uses
BOXNOW_VOUCHER_META_KEY=_boxnow_parcel_ids
BOXNOW_DEFAULT_COMPARTMENT_SIZE=1               # 1=S, 2=M, 3=L
BOXNOW_DEFAULT_WEIGHT=0                         # grams; 0 = unknown
BOXNOW_TRACKING_URL_TEMPLATE=https://t.boxnow.gr/?track={voucher}
```

### 5. Run

Two terminals:

```bash
# Terminal 1 — backend
source .venv/bin/activate
uvicorn api.main:app --reload
```

```bash
# Terminal 2 — frontend
cd ui
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` to the FastAPI server on port 8000.

API docs (Swagger UI) at <http://localhost:8000/docs>.

### 6. Verbose logging

```bash
uvicorn api.main:app --reload --log-level debug
```

## Project structure

```
.
├── sites.json                 # Site registry — maps site IDs to .env key names
├── api/                       # FastAPI backend
│   ├── main.py                # App entrypoint, CORS, router wiring
│   ├── dependencies.py        # Per-site cached adapter instances
│   ├── site_registry.py       # Reads sites.json + .env, resolves credentials
│   ├── routers/
│   │   ├── sites.py           # GET /api/sites — list configured sites
│   │   ├── products.py        # Product + variations + bulk import + secret tags
│   │   ├── orders.py          # Orders + BOX NOW (vouchers, labels, webhook)
│   │   ├── coupons.py         # Coupon CRUD
│   │   ├── media.py           # WP media listing + upload
│   │   ├── dashboard.py       # Aggregated metrics + charts data
│   │   └── blog_migration.py  # Blog / media / WC product import-export
│   └── schemas/               # Pydantic request models
│
├── data_sources/              # External-API adapters
│   ├── wc_products_adapter.py # WooCommerce wrapper (woocommerce SDK)
│   ├── wp_image_adapter.py    # WordPress media (basic auth)
│   ├── boxnow_adapter.py      # BOX NOW Partner API client
│   └── data/products_data.py  # Legacy ProductStore (still usable via bulk import shape)
│
├── domains/                   # Domain logic
│   ├── product_domain.py      # Variable-product + variation construction
│   └── categories.py / tags.py
│
├── interactors/               # Orchestration (between adapters and domain)
│   └── create_product_interactor.py
│
├── ui/                        # React app (Vite)
│   ├── src/
│   │   ├── context/
│   │   │   └── SiteContext.jsx  # Global active-site state + selector logic
│   │   ├── pages/             # Route components
│   │   ├── components/        # Shared UI (MediaPicker, Lightbox, Spinner, …)
│   │   └── api/client.js      # axios wrapper — passes ?site= to every call
│   └── vite.config.js         # Dev proxy → http://localhost:8000
│
└── utils/config.py            # .env loader
```

## API surface (selected)

```
Sites
  GET    /api/sites                        list configured sites (from sites.json)

Products
  GET    /api/products                    list + filter + paginate
  POST   /api/products                    create (variable or simple)
  GET    /api/products/{id}
  PUT    /api/products/{id}
  DELETE /api/products/{id}
  POST   /api/products/bulk               upsert from JSON array
  POST   /api/products/{id}/relink-images swap external image URLs → local media IDs
  GET    /api/products/image-audit        flag products with suspicious image filenames
  GET    /api/products/{id}/variations
  POST   /api/products/{id}/variations
  PUT    /api/products/{id}/variations/{var_id}
  DELETE /api/products/{id}/variations/{var_id}
  GET    /api/products/{id}/secret-tags
  POST   /api/products/{id}/secret-tags

Taxonomy (categories / tags / attributes + terms — full CRUD)
  GET  POST                 /api/products/categories
  PUT  DELETE               /api/products/categories/{id}
  GET  POST                 /api/products/tags
  PUT  DELETE               /api/products/tags/{id}
  GET  POST                 /api/products/attributes
  PUT  DELETE               /api/products/attributes/{id}
  GET  POST                 /api/products/attributes/{id}/terms
  PUT  DELETE               /api/products/attributes/{id}/terms/{term_id}

Coupons
  GET    /api/coupons
  POST   /api/coupons
  GET    /api/coupons/{id}
  PUT    /api/coupons/{id}
  DELETE /api/coupons/{id}

Orders
  GET    /api/orders                       list + filter + paginate (incl. after/before)
  GET    /api/orders/{id}
  PUT    /api/orders/{id}/status
  GET    /api/orders/{id}/notes
  POST   /api/orders/{id}/notes

BOX NOW
  GET    /api/orders/{id}/boxnow           current voucher + diagnostic meta
  POST   /api/orders/{id}/boxnow           create voucher
  DELETE /api/orders/{id}/boxnow           cancel voucher
  GET    /api/orders/{id}/boxnow/track     parcel state + tracking URL
  GET    /api/orders/{id}/boxnow/label     stream PDF/ZPL label
  POST   /api/orders/boxnow/webhook        receive parcel event webhooks

Media
  GET    /api/media                        list all WP media
  POST   /api/media                        upload (multipart)

Dashboard
  GET    /api/dashboard/overview           catalog status/type/stock counts
  GET    /api/dashboard/top-sellers
  GET    /api/dashboard/by-category | by-tag | by-secret-tag
  GET    /api/dashboard/out-of-stock
  GET    /api/dashboard/inventory/stats    stock value, units, managed-product count
  GET    /api/dashboard/needs-attention    orders to ship, expiring coupons, low stock
  GET    /api/dashboard/orders/overview    period revenue / orders / AOV (+ comparison)
  GET    /api/dashboard/orders/recent
  GET    /api/dashboard/orders/sales-trend
  GET    /api/dashboard/orders/monthly-trend
  GET    /api/dashboard/orders/heatmap     7×24 matrix of order timing
  GET    /api/dashboard/orders/sparkline   compact daily series for KPI cards
  GET    /api/dashboard/customers/top

Migration (Imports / Exports — source & target selected per request)
  GET    /api/blog/sites                    list sites available for migration
  POST   /api/blog/export | /api/blog/import           WordPress posts (+cats/tags/images)
  POST   /api/media/export | /api/media/import         WP media library
  POST   /api/wc/sync-taxonomy                         attributes/shipping/cats/tags → target
  POST   /api/wc/export | /api/wc/export-variations    products + variations
  POST   /api/wc/sku-map | /api/wc/import-one          product ID maps + upsert one
  POST   /api/wc/export-coupons | /api/wc/import-coupon   (+ /api/wc/coupon-code-map)
  POST   /api/wc/export-orders  | /api/wc/import-order    (+ /api/wc/order-id-map)
  POST   /api/wc/export-customers | /api/wc/import-customer (+ /api/wc/customer-email-map)
  POST   /api/wc/export-taxes    | /api/wc/import-taxes
  POST   /api/wc/export-shipping | /api/wc/import-shipping
  POST   /api/wc/export-store-settings | /api/wc/import-store-settings
  POST   /api/wc/export-email-settings | /api/wc/import-email-settings
```

## Bulk import format

Send `POST /api/products/bulk` with a JSON array of `BulkProductItem`. Each item:

```json
{
  "product": {
    "product_name": "Organic Cotton T-Shirt",
    "short_description": "...",
    "categories":     [{"id": "t-shirts"}, {"id": "eco"}],
    "tags":           [{"id": "organic"}],
    "main_image_ids": ["tee-front", "tee-back"],
    "colors": ["Black", "White"],
    "sizes":  ["S", "M", "L", "XL", "2XL"],
    "base_price": "18.00",
    "secret_tags": ["internal-keyword"]
  },
  "variations": {
    "variation_image_mapping": {"S-Black": "tee-s-black", "M-Black": "tee-m-black"},
    "price_overrides":         {"2XL-Black": "20.00"},
    "sale_prices":             {"S-White": "12.00"}
  }
}
```

- `categories[].id` and `tags[].id` accept slugs/names or numeric IDs.
- `main_image_ids` and `variation_image_mapping` values accept WP media IDs (numeric) or filenames without extension (string).
- Behaviour is upsert: if a product with the same `product_name` already exists, it gets updated (categories, tags, images, short description, secret tags); otherwise created from scratch with variations.

## Notes

- **Order revenue calculation:** WooCommerce's legacy `/reports/sales` is unreliable and only counts `completed` orders. The dashboard computes revenue by summing orders directly from `/orders` filtered to `status=completed,processing`. Configurable in `api/routers/dashboard.py` via `DEFAULT_PAID_STATUSES`.
- **No view/click tracking:** WooCommerce doesn't track product views natively. The dashboard surfaces sales-based metrics only. Integrate Google Analytics if you need view/click data.
- **Secret-tag scan:** counting secret tags across all products requires fetching every product and parsing descriptions. Gated behind a button on the dashboard.

## Development

- Run tests: there aren't any yet; please add them as you change things.
- Format Python: follow `black` defaults if you adopt it.
- Database/state: none — every page reads live from WooCommerce.
- Caching: TanStack Query on the frontend (30s default stale time); a singleton adapter pre-fetches products/categories/tags/media on first request and invalidates after mutations.
