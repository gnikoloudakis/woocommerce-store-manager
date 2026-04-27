import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Spinner from '../components/Spinner'
import {
  fetchDashboardOverview,
  fetchTopSellers,
  fetchByCategory,
  fetchByTag,
  fetchBySecretTag,
  fetchOutOfStock,
  fetchOrdersOverview,
  fetchRecentOrders,
  fetchSalesTrend,
  fetchMonthlyTrend,
} from '../api/client'

const ORDER_STATUS_STYLES = {
  completed:  'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700',
  'on-hold':  'bg-yellow-100 text-yellow-700',
  pending:    'bg-orange-100 text-orange-700',
  cancelled:  'bg-gray-100 text-gray-600',
  refunded:   'bg-purple-100 text-purple-700',
  failed:     'bg-red-100 text-red-700',
}

function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function KpiCard({ label, value, sublabel, accent = 'gray', loading = false }) {
  const accentClasses = {
    gray:   'border-gray-200',
    green:  'border-green-300 bg-green-50/40',
    yellow: 'border-yellow-300 bg-yellow-50/40',
    red:    'border-red-300 bg-red-50/40',
    blue:   'border-blue-300 bg-blue-50/40',
  }[accent]
  return (
    <div className={`bg-white border rounded-lg p-4 ${accentClasses}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      {loading
        ? <div className="mt-2 mb-1"><Spinner size="lg" /></div>
        : <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      }
      {sublabel && !loading && <p className="text-xs text-gray-400 mt-1">{sublabel}</p>}
    </div>
  )
}

function BarRow({ label, count, max, color = 'blue', href }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const colorClass = {
    blue:   'bg-blue-500',
    green:  'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
  }[color]

  const content = (
    <div className="flex items-center gap-3 group">
      <span className="text-sm text-gray-700 truncate w-44 shrink-0 group-hover:text-blue-600">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`${colorClass} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-gray-600 font-medium w-10 text-right">{count}</span>
    </div>
  )

  return href ? <Link to={href} className="block py-1">{content}</Link> : <div className="py-1">{content}</div>
}

function Section({ title, children, action }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function TopSellersList() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'top-sellers'],
    queryFn: () => fetchTopSellers(10),
  })
  if (isLoading) return <Spinner />
  if (products.length === 0) return <p className="text-sm text-gray-400">No sales data yet.</p>

  const maxSales = Math.max(...products.map(p => p.total_sales), 1)
  return (
    <div className="space-y-2">
      {products.map((p, idx) => (
        <Link
          key={p.id}
          to={`/edit/${p.id}`}
          className="flex items-center gap-3 p-2 -mx-2 rounded hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-semibold text-gray-400 w-5 shrink-0">#{idx + 1}</span>
          {p.image
            ? <img src={p.image} alt="" className="w-10 h-10 rounded object-cover shrink-0 border border-gray-200" />
            : <div className="w-10 h-10 rounded bg-gray-100 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-green-500 h-full" style={{ width: `${(p.total_sales / maxSales) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 font-medium w-16 text-right">
                {p.total_sales} sale{p.total_sales !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function OutOfStockList() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'out-of-stock'],
    queryFn: fetchOutOfStock,
  })
  if (isLoading) return <Spinner />
  if (products.length === 0) return <p className="text-sm text-green-600">✓ Nothing out of stock</p>

  return (
    <div className="space-y-1.5">
      {products.slice(0, 8).map(p => (
        <Link
          key={p.id}
          to={`/edit/${p.id}`}
          className="flex items-center gap-3 p-1.5 -mx-1.5 rounded hover:bg-gray-50 text-sm transition-colors"
        >
          {p.image
            ? <img src={p.image} alt="" className="w-7 h-7 rounded object-cover shrink-0 border border-gray-200" />
            : <div className="w-7 h-7 rounded bg-gray-100 shrink-0" />
          }
          <span className="text-gray-700 truncate flex-1">{p.name}</span>
          <span className="text-xs text-red-500 font-medium shrink-0">out</span>
        </Link>
      ))}
      {products.length > 8 && (
        <Link to="/?stock_status=outofstock" className="block text-xs text-blue-600 hover:underline pt-1">
          View all {products.length}…
        </Link>
      )}
    </div>
  )
}

function CategoryDistribution() {
  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'by-category'],
    queryFn: fetchByCategory,
  })
  if (isLoading) return <Spinner />
  if (cats.length === 0) return <p className="text-sm text-gray-400">No categories.</p>
  const max = Math.max(...cats.map(c => c.count), 1)
  return (
    <div className="space-y-0.5">
      {cats.map(c => (
        <BarRow key={c.id} label={c.name} count={c.count} max={max} color="blue" />
      ))}
    </div>
  )
}

function TagDistribution() {
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'by-tag'],
    queryFn: fetchByTag,
  })
  if (isLoading) return <Spinner />
  if (tags.length === 0) return <p className="text-sm text-gray-400">No tags.</p>
  const max = Math.max(...tags.map(t => t.count), 1)
  return (
    <div className="space-y-0.5">
      {tags.map(t => (
        <BarRow key={t.id} label={t.name} count={t.count} max={max} color="purple" />
      ))}
    </div>
  )
}

function SecretTagDistribution() {
  const [enabled, setEnabled] = useState(false)
  const { data: tags = [], isLoading, isFetching } = useQuery({
    queryKey: ['dashboard', 'by-secret-tag'],
    queryFn: fetchBySecretTag,
    enabled,
    staleTime: 60_000,
  })

  if (!enabled) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500 mb-3">
          Counting secret tags requires scanning every product.
        </p>
        <button
          onClick={() => setEnabled(true)}
          className="px-4 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
        >
          Run scan
        </button>
      </div>
    )
  }

  if (isLoading || isFetching) return <Spinner label="Scanning all products…" />
  if (tags.length === 0) return <p className="text-sm text-gray-400">No secret tags found.</p>

  const max = Math.max(...tags.map(t => t.count), 1)
  return (
    <div className="space-y-0.5">
      {tags.map(t => (
        <BarRow key={t.tag} label={t.tag} count={t.count} max={max} color="yellow" />
      ))}
    </div>
  )
}

function MonthlyOrdersChart() {
  const [months, setMonths] = useState(12)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'monthly-trend', months],
    queryFn: () => fetchMonthlyTrend(months),
  })

  if (isLoading) return <Spinner label="Loading…" />
  if (isError) return <p className="text-sm text-gray-400">Couldn't load monthly trend.</p>

  const monthly = data?.monthly ?? []
  const currency = data?.currency ?? 'EUR'
  if (monthly.length === 0) return <p className="text-sm text-gray-400">No data.</p>

  const totalOrders = monthly.reduce((s, m) => s + m.orders, 0)
  const totalRevenue = monthly.reduce((s, m) => s + m.sales, 0)

  // SVG geometry
  const W = 800, H = 220
  const padL = 36, padR = 16, padT = 16, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const maxOrders = Math.max(...monthly.map(m => m.orders), 1)
  const stepX = monthly.length > 1 ? innerW / (monthly.length - 1) : 0

  const points = monthly.map((m, i) => ({
    x: padL + i * stepX,
    y: padT + innerH - (m.orders / maxOrders) * innerH,
    ...m,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`

  // Y-axis ticks (0, max/2, max)
  const yTicks = [0, Math.round(maxOrders / 2), maxOrders]

  // X-axis labels — only show every Nth so they don't overlap
  const labelEvery = Math.ceil(monthly.length / 6)

  function formatMonthLabel(yyyymm) {
    const [y, m] = yyyymm.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-gray-500">Orders</p>
            <p className="text-lg font-bold text-gray-900">{totalOrders}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Revenue</p>
            <p className="text-lg font-bold text-gray-900">{formatMoney(totalRevenue, currency)}</p>
          </div>
        </div>
        <select
          value={months}
          onChange={e => setMonths(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
          <option value={36}>Last 36 months</option>
        </select>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Y grid lines + labels */}
        {yTicks.map((t, i) => {
          const y = padT + innerH - (t / maxOrders) * innerH
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e5e7eb" strokeDasharray="3 3" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{t}</text>
            </g>
          )
        })}

        {/* Filled area under line */}
        <path d={areaPath} fill="rgba(59, 130, 246, 0.1)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Data dots with hover tooltips */}
        {points.map((p, i) => (
          <g key={p.month} className="hover:opacity-100">
            <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke="rgb(59, 130, 246)" strokeWidth="2" />
            <title>{formatMonthLabel(p.month)} — {p.orders} order{p.orders !== 1 ? 's' : ''}, {formatMoney(p.sales, currency)}</title>
            {/* Larger transparent hover target */}
            <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
            {i % labelEvery === 0 && (
              <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">
                {formatMonthLabel(p.month)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

function RecentOrdersList() {
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'recent-orders'],
    queryFn: () => fetchRecentOrders(10),
  })

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-gray-400">Orders endpoint not accessible.</p>
  if (orders.length === 0) return <p className="text-sm text-gray-400">No orders yet.</p>

  return (
    <div className="divide-y divide-gray-100">
      {orders.map(o => (
        <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">#{o.number || o.id}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS_STYLES[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {o.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {o.customer_name} · {o.items_count} item{o.items_count !== 1 ? 's' : ''} · {formatDate(o.date_created)}
            </p>
          </div>
          <span className="text-sm font-semibold text-gray-900 shrink-0">{formatMoney(o.total, o.currency)}</span>
        </div>
      ))}
    </div>
  )
}

function SalesTrendChart({ period }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'sales-trend', period],
    queryFn: () => fetchSalesTrend(period),
  })

  if (isLoading) return <Spinner label="Loading trend…" />
  if (isError) return <p className="text-sm text-gray-400">Sales report not accessible.</p>

  const daily = data?.daily ?? []
  const currency = data?.currency ?? 'EUR'
  if (daily.length === 0) return <p className="text-sm text-gray-400">No sales data for this period.</p>

  const max = Math.max(...daily.map(d => d.sales), 1)
  const totalSales = daily.reduce((sum, d) => sum + d.sales, 0)
  const totalOrders = daily.reduce((sum, d) => sum + d.orders, 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div>
          <p className="text-xs text-gray-500">Period total</p>
          <p className="text-lg font-bold text-gray-900">{formatMoney(totalSales, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Orders</p>
          <p className="text-lg font-bold text-gray-900">{totalOrders}</p>
        </div>
      </div>

      <div className="flex items-end gap-1 h-32 border-b border-gray-200 px-1">
        {daily.map(d => {
          const heightPct = (d.sales / max) * 100
          const hasData = d.sales > 0 || d.orders > 0
          return (
            <div
              key={d.date}
              className="flex-1 min-w-[2px] flex items-end relative group"
              title={`${d.date}: ${formatMoney(d.sales, currency)} · ${d.orders} order${d.orders !== 1 ? 's' : ''}`}
            >
              <div
                className={`w-full rounded-t transition-all ${hasData ? 'bg-green-500 group-hover:bg-green-600' : 'bg-gray-100'}`}
                style={{ height: `${Math.max(heightPct, hasData ? 4 : 1)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1 px-1">
        <span>{daily[0]?.date}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: fetchDashboardOverview,
  })

  const [orderPeriod, setOrderPeriod] = useState('month')

  const { data: orders, isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ['dashboard', 'orders-overview', orderPeriod],
    queryFn: () => fetchOrdersOverview(orderPeriod),
    retry: 0,
  })

  const PERIOD_LABEL = { week: 'this week', month: 'this month', last_month: 'last month', year: 'this year', all: 'all time' }[orderPeriod] || orderPeriod

  const total = overview ? Object.values(overview.by_status).reduce((a, b) => a + b, 0) : 0
  const stock = overview?.by_stock ?? { instock: 0, outofstock: 0, onbackorder: 0 }
  const pendingOrders = (orders?.by_status?.processing ?? 0) + (orders?.by_status?.pending ?? 0) + (orders?.by_status?.['on-hold'] ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your WooCommerce catalog.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total products"
          value={total}
          sublabel={overview ? `${overview.by_status.publish} published` : ''}
          accent="blue"
          loading={overviewLoading}
        />
        <KpiCard
          label="In stock"
          value={stock.instock}
          accent="green"
          loading={overviewLoading}
        />
        <KpiCard
          label="Out of stock"
          value={stock.outofstock}
          sublabel={stock.outofstock > 0 ? 'needs attention' : 'all good'}
          accent={stock.outofstock > 0 ? 'red' : 'green'}
          loading={overviewLoading}
        />
        <KpiCard
          label="On backorder"
          value={stock.onbackorder}
          accent={stock.onbackorder > 0 ? 'yellow' : 'gray'}
          loading={overviewLoading}
        />
      </div>

      {/* Status & Type breakdown */}
      {overview && (
        <div className="grid md:grid-cols-2 gap-4">
          <Section title="By status">
            <div className="space-y-0.5">
              {Object.entries(overview.by_status).filter(([, c]) => c > 0).map(([status, count]) => (
                <BarRow
                  key={status}
                  label={status.charAt(0).toUpperCase() + status.slice(1)}
                  count={count}
                  max={Math.max(...Object.values(overview.by_status))}
                  color="green"
                />
              ))}
            </div>
          </Section>

          <Section title="By type">
            <div className="space-y-0.5">
              {Object.entries(overview.by_type).filter(([, c]) => c > 0).map(([type, count]) => (
                <BarRow
                  key={type}
                  label={type.charAt(0).toUpperCase() + type.slice(1)}
                  count={count}
                  max={Math.max(...Object.values(overview.by_type))}
                  color="blue"
                />
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Orders section */}
      {!ordersError && (
        <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Orders <span className="font-normal text-gray-500">{PERIOD_LABEL}</span>
              </h2>
              <select
                value={orderPeriod}
                onChange={e => setOrderPeriod(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="last_month">Last month</option>
                <option value="year">This year</option>
                <option value="all">All time</option>
              </select>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Revenue counts only completed orders (WooCommerce excludes processing/on-hold from <code className="bg-gray-100 px-1 rounded">total_sales</code>).
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="Revenue"
                value={formatMoney(orders?.total_sales, orders?.currency)}
                accent="green"
                loading={ordersLoading}
              />
              <KpiCard
                label="Orders"
                value={orders?.total_orders ?? 0}
                accent="blue"
                loading={ordersLoading}
              />
              <KpiCard
                label="Avg order value"
                value={formatMoney(orders?.avg_order_value, orders?.currency)}
                accent="gray"
                loading={ordersLoading}
              />
              <KpiCard
                label="Needs action"
                value={pendingOrders}
                sublabel="processing + pending + on-hold"
                accent={pendingOrders > 0 ? 'yellow' : 'gray'}
                loading={ordersLoading}
              />
            </div>
          </div>

          {/* Sales trend + recent orders + status breakdown */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Section title="Sales trend">
                <SalesTrendChart period={orderPeriod} />
              </Section>
            </div>
            <Section title="Orders by status">
              {orders && Object.keys(orders.by_status).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(orders.by_status)
                    .filter(([, c]) => c > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <BarRow
                        key={status}
                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                        count={count}
                        max={Math.max(...Object.values(orders.by_status))}
                        color="blue"
                      />
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No status data.</p>
              )}
            </Section>
          </div>

          <Section title="Orders per month">
            <MonthlyOrdersChart />
          </Section>

          <Section title="Recent orders">
            <RecentOrdersList />
          </Section>
        </>
      )}

      {ordersError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          ⚠ Order statistics couldn't be loaded. The WooCommerce orders endpoint may require additional permissions on your API key (typically Read access to <code className="bg-yellow-100 px-1 rounded">orders</code> and <code className="bg-yellow-100 px-1 rounded">reports</code>).
        </div>
      )}

      {/* Two-column layout: top sellers + out of stock */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Section title="Top sellers" action={<span className="text-xs text-gray-400">By total sales</span>}>
            <TopSellersList />
          </Section>
        </div>

        <Section title={<span className="flex items-center gap-2">Out of stock {stock.outofstock > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{stock.outofstock}</span>}</span>}>
          <OutOfStockList />
        </Section>
      </div>

      {/* Distributions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Products per category">
          <CategoryDistribution />
        </Section>
        <Section title="Products per tag">
          <TagDistribution />
        </Section>
      </div>

      <Section
        title={<span className="flex items-center gap-2">Products per secret tag <span className="text-xs text-gray-400 font-normal">internal</span></span>}
      >
        <SecretTagDistribution />
      </Section>

      {/* Footnote about clicks */}
      <p className="text-xs text-gray-400 italic text-center">
        Note: WooCommerce doesn't track product views or clicks natively. To see those metrics, integrate Google Analytics or a similar tool with your store.
      </p>
    </div>
  )
}
