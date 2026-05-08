import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
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
  fetchNeedsAttention,
  fetchOrdersHeatmap,
  fetchTopCustomers,
  fetchOrdersSparkline,
  fetchInventoryStats,
  fetchCoupons,
} from '../api/client'
import Spinner from '../components/Spinner'

// ── Helpers ────────────────────────────────────────────────────────────

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
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n) }
  catch { return `${currency} ${n.toFixed(2)}` }
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatLongDate(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function pctDelta(current, previous) {
  if (previous == null || previous === 0) return null
  const diff = ((current - previous) / Math.abs(previous)) * 100
  return Math.round(diff * 10) / 10
}

// ── Density context (shared via localStorage) ──────────────────────────

function useDensity() {
  const [dense, setDense] = useState(() => localStorage.getItem('dashboard-density') === 'compact')
  useEffect(() => { localStorage.setItem('dashboard-density', dense ? 'compact' : 'comfortable') }, [dense])
  return [dense, setDense]
}

// ── KPI card with sparkline + delta ────────────────────────────────────

function Sparkline({ values, color = '#3b82f6', height = 28 }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const W = 100
  const stepX = W / (values.length - 1)
  const points = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height: `${height}px` }}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function DeltaBadge({ pct }) {
  if (pct == null) return null
  const positive = pct > 0
  const negative = pct < 0
  const cls = positive ? 'text-green-600 bg-green-50' : negative ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50'
  const arrow = positive ? '▲' : negative ? '▼' : '–'
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {arrow} {Math.abs(pct)}%
    </span>
  )
}

function KpiCard({ label, value, sublabel, accent = 'gray', loading = false, sparkline, delta, dense }) {
  const accentClasses = {
    gray:   'border-gray-200',
    green:  'border-green-300 bg-green-50/40',
    yellow: 'border-yellow-300 bg-yellow-50/40',
    red:    'border-red-300 bg-red-50/40',
    blue:   'border-blue-300 bg-blue-50/40',
  }[accent]
  const sparkColor = { green: '#10b981', yellow: '#eab308', red: '#ef4444', blue: '#3b82f6', gray: '#6b7280' }[accent]
  return (
    <div className={`bg-white border rounded-lg ${dense ? 'p-3' : 'p-4'} ${accentClasses}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <DeltaBadge pct={delta} />
      </div>
      {loading
        ? <div className="mt-2 mb-1"><Spinner size="lg" /></div>
        : <p className={`${dense ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 mt-1`}>{value}</p>
      }
      {sublabel && !loading && <p className="text-xs text-gray-400 mt-1">{sublabel}</p>}
      {sparkline && sparkline.length > 1 && !loading && (
        <div className="mt-2 -mb-1 opacity-70">
          <Sparkline values={sparkline} color={sparkColor} height={dense ? 20 : 28} />
        </div>
      )}
    </div>
  )
}

// ── Common section wrapper ────────────────────────────────────────────

function Section({ title, children, action, dense }) {
  return (
    <section className={`bg-white border border-gray-200 rounded-lg ${dense ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// ── Existing pieces (re-used) ──────────────────────────────────────────

function BarRow({ label, count, max, color = 'blue', href }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const colorClass = { blue: 'bg-blue-500', green: 'bg-green-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500' }[color]
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

function TopSellersList() {
  const { data: products = [], isLoading } = useQuery({ queryKey: ['dashboard', 'top-sellers'], queryFn: () => fetchTopSellers(10) })
  if (isLoading) return <Spinner />
  if (products.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400">
        <p className="text-3xl mb-2">🏆</p>
        <p className="text-sm">No sales data yet — keep marketing!</p>
      </div>
    )
  }
  const maxSales = Math.max(...products.map(p => p.total_sales), 1)
  return (
    <div className="space-y-2">
      {products.map((p, idx) => (
        <Link key={p.id} to={`/edit/${p.id}`} className="flex items-center gap-3 p-2 -mx-2 rounded hover:bg-gray-50 transition-colors">
          <span className="text-xs font-semibold text-gray-400 w-5 shrink-0">#{idx + 1}</span>
          {p.image
            ? <img src={p.image} alt="" className="w-10 h-10 rounded object-cover shrink-0 border border-gray-200" />
            : <div className="w-10 h-10 rounded bg-gray-100 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-green-500 h-full" style={{ width: `${(p.total_sales / maxSales) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 font-medium w-16 text-right">{p.total_sales} sale{p.total_sales !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function OutOfStockList() {
  const { data: products = [], isLoading } = useQuery({ queryKey: ['dashboard', 'out-of-stock'], queryFn: fetchOutOfStock })
  if (isLoading) return <Spinner />
  if (products.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-3xl mb-1">✅</p>
        <p className="text-sm text-green-600 font-medium">Everything's in stock</p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {products.slice(0, 8).map(p => (
        <Link key={p.id} to={`/edit/${p.id}`} className="flex items-center gap-3 p-1.5 -mx-1.5 rounded hover:bg-gray-50 text-sm transition-colors">
          {p.image ? <img src={p.image} alt="" className="w-7 h-7 rounded object-cover shrink-0 border border-gray-200" /> : <div className="w-7 h-7 rounded bg-gray-100 shrink-0" />}
          <span className="text-gray-700 truncate flex-1">{p.name}</span>
          <span className="text-xs text-red-500 font-medium shrink-0">out</span>
        </Link>
      ))}
      {products.length > 8 && <Link to="/products" className="block text-xs text-blue-600 hover:underline pt-1">View all {products.length}…</Link>}
    </div>
  )
}

function CategoryDistribution() {
  const { data: cats = [], isLoading } = useQuery({ queryKey: ['dashboard', 'by-category'], queryFn: fetchByCategory })
  if (isLoading) return <Spinner />
  if (cats.length === 0) return <p className="text-sm text-gray-400 italic">No categories with products.</p>
  const max = Math.max(...cats.map(c => c.count), 1)
  return <div className="space-y-0.5">{cats.map(c => <BarRow key={c.id} label={c.name} count={c.count} max={max} color="blue" />)}</div>
}

function TagDistribution() {
  const { data: tags = [], isLoading } = useQuery({ queryKey: ['dashboard', 'by-tag'], queryFn: fetchByTag })
  if (isLoading) return <Spinner />
  if (tags.length === 0) return <p className="text-sm text-gray-400 italic">No tags assigned to any product.</p>
  const max = Math.max(...tags.map(t => t.count), 1)
  return <div className="space-y-0.5">{tags.map(t => <BarRow key={t.id} label={t.name} count={t.count} max={max} color="purple" />)}</div>
}

function SecretTagDistribution() {
  const [enabled, setEnabled] = useState(false)
  const { data: tags = [], isLoading, isFetching } = useQuery({
    queryKey: ['dashboard', 'by-secret-tag'], queryFn: fetchBySecretTag, enabled, staleTime: 60_000,
  })
  if (!enabled) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500 mb-3">Counting secret tags requires scanning every product.</p>
        <button onClick={() => setEnabled(true)} className="px-4 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600">Run scan</button>
      </div>
    )
  }
  if (isLoading || isFetching) return <Spinner label="Scanning all products…" />
  if (tags.length === 0) return <p className="text-sm text-gray-400">No secret tags found.</p>
  const max = Math.max(...tags.map(t => t.count), 1)
  return <div className="space-y-0.5">{tags.map(t => <BarRow key={t.tag} label={t.tag} count={t.count} max={max} color="yellow" />)}</div>
}

function MonthlyOrdersChart() {
  const [months, setMonths] = useState(12)
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({ queryKey: ['dashboard', 'monthly-trend', months], queryFn: () => fetchMonthlyTrend(months) })

  function goToMonth(yyyymm, label) {
    // Build ISO date range for the given YYYY-MM (start of month → start of next month)
    const [y, m] = yyyymm.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const end   = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString()
    const params = new URLSearchParams({ after: start, before: end, label })
    navigate(`/orders?${params.toString()}`)
  }
  if (isLoading) return <Spinner label="Loading…" />
  if (isError) return <p className="text-sm text-gray-400">Couldn't load monthly trend.</p>
  const monthly = data?.monthly ?? []
  const currency = data?.currency ?? 'EUR'
  if (monthly.length === 0) return <p className="text-sm text-gray-400">No data.</p>
  const totalOrders = monthly.reduce((s, m) => s + m.orders, 0)
  const totalRevenue = monthly.reduce((s, m) => s + m.sales, 0)
  const W = 800, H = 220, padL = 36, padR = 16, padT = 16, padB = 28
  const innerW = W - padL - padR, innerH = H - padT - padB
  const maxOrders = Math.max(...monthly.map(m => m.orders), 1)
  const stepX = monthly.length > 1 ? innerW / (monthly.length - 1) : 0
  const points = monthly.map((m, i) => ({ x: padL + i * stepX, y: padT + innerH - (m.orders / maxOrders) * innerH, ...m }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
  const yTicks = [0, Math.round(maxOrders / 2), maxOrders]
  const labelEvery = Math.ceil(monthly.length / 6)
  const formatMonthLabel = (yyyymm) => { const [y, m] = yyyymm.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) }
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <div><p className="text-xs text-gray-500">Orders</p><p className="text-lg font-bold text-gray-900">{totalOrders}</p></div>
          <div><p className="text-xs text-gray-500">Revenue</p><p className="text-lg font-bold text-gray-900">{formatMoney(totalRevenue, currency)}</p></div>
        </div>
        <select value={months} onChange={e => setMonths(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
          <option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option><option value={36}>Last 36 months</option>
        </select>
      </div>
      <p className="text-[10px] text-gray-400 mb-1">Click any dot to view that month's orders.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {yTicks.map((t, i) => { const y = padT + innerH - (t / maxOrders) * innerH; return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e5e7eb" strokeDasharray="3 3" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{t}</text>
          </g>
        )})}
        <path d={areaPath} fill="rgba(59, 130, 246, 0.1)" />
        <path d={linePath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g
            key={p.month}
            onClick={() => goToMonth(p.month, formatMonthLabel(p.month))}
            style={{ cursor: 'pointer' }}
            className="group"
          >
            <title>{formatMonthLabel(p.month)} — {p.orders} order{p.orders !== 1 ? 's' : ''}, {formatMoney(p.sales, currency)} (click to view)</title>
            {/* Larger invisible hover/click target */}
            <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
            {/* Visible dot — grows on hover */}
            <circle
              cx={p.x} cy={p.y} r="3.5" fill="white" stroke="rgb(59, 130, 246)" strokeWidth="2"
              className="group-hover:r-[5] transition-all"
            />
            <circle cx={p.x} cy={p.y} r="6" fill="rgb(59, 130, 246)" opacity="0" className="group-hover:opacity-20 transition-opacity" />
            {i % labelEvery === 0 && <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{formatMonthLabel(p.month)}</text>}
          </g>
        ))}
      </svg>
    </div>
  )
}

function RecentOrdersList() {
  const { data: orders = [], isLoading, isError } = useQuery({ queryKey: ['dashboard', 'recent-orders'], queryFn: () => fetchRecentOrders(10) })
  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-gray-400">Orders endpoint not accessible.</p>
  if (orders.length === 0) return <p className="text-sm text-gray-400">No orders yet.</p>
  return (
    <div className="divide-y divide-gray-100">
      {orders.map(o => (
        <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 -mx-2 px-2 rounded hover:bg-gray-50 transition-colors">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">#{o.number || o.id}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS_STYLES[o.status] ?? 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">{o.customer_name} · {o.items_count} item{o.items_count !== 1 ? 's' : ''} · {formatDate(o.date_created)}</p>
          </div>
          <span className="text-sm font-semibold text-gray-900 shrink-0">{formatMoney(o.total, o.currency)}</span>
        </Link>
      ))}
    </div>
  )
}

function SalesTrendChart({ period }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['dashboard', 'sales-trend', period], queryFn: () => fetchSalesTrend(period) })
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
        <div><p className="text-xs text-gray-500">Period total</p><p className="text-lg font-bold text-gray-900">{formatMoney(totalSales, currency)}</p></div>
        <div><p className="text-xs text-gray-500">Orders</p><p className="text-lg font-bold text-gray-900">{totalOrders}</p></div>
      </div>
      <div className="flex items-end gap-1 h-32 border-b border-gray-200 px-1">
        {daily.map(d => {
          const heightPct = (d.sales / max) * 100
          const hasData = d.sales > 0 || d.orders > 0
          return (
            <div key={d.date} className="flex-1 min-w-[2px] flex items-end relative group" title={`${d.date}: ${formatMoney(d.sales, currency)} · ${d.orders} order${d.orders !== 1 ? 's' : ''}`}>
              <div className={`w-full rounded-t transition-all ${hasData ? 'bg-green-500 group-hover:bg-green-600' : 'bg-gray-100'}`} style={{ height: `${Math.max(heightPct, hasData ? 4 : 1)}%` }} />
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

// ── NEW: Needs attention ───────────────────────────────────────────────

function NeedsAttention() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', 'needs-attention'], queryFn: fetchNeedsAttention })
  if (isLoading) return <Spinner />
  const items = []
  if (data?.orders_to_ship_count) items.push({
    icon: '📦', label: `${data.orders_to_ship_count} order${data.orders_to_ship_count !== 1 ? 's' : ''} to ship`,
    sub: 'Status: processing', href: '/orders?status=processing', color: 'blue',
  })
  if (data?.expiring_coupons?.length) items.push({
    icon: '🏷️', label: `${data.expiring_coupons.length} coupon${data.expiring_coupons.length !== 1 ? 's' : ''} expiring soon`,
    sub: data.expiring_coupons.slice(0, 2).map(c => `${c.code} (${c.days_left}d)`).join(', '),
    href: '/coupons', color: 'orange',
  })
  if (data?.low_stock?.length) items.push({
    icon: '⚠️', label: `${data.low_stock.length} product${data.low_stock.length !== 1 ? 's' : ''} low on stock`,
    sub: data.low_stock.slice(0, 2).map(p => `${p.name} (${p.stock_quantity})`).join(', '),
    href: '/products', color: 'yellow',
  })

  if (items.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-3xl mb-1">🌴</p>
        <p className="text-sm text-green-600 font-medium">Inbox zero — nothing urgent right now.</p>
      </div>
    )
  }

  const colorClasses = {
    blue:   'border-blue-200 bg-blue-50 hover:bg-blue-100',
    orange: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
    yellow: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100',
  }

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {items.map((it, i) => (
        <Link key={i} to={it.href} className={`block border rounded-lg p-3 transition-colors ${colorClasses[it.color]}`}>
          <div className="flex items-start gap-2">
            <span className="text-2xl leading-none">{it.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{it.label}</p>
              <p className="text-xs text-gray-600 truncate">{it.sub}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── NEW: Day-of-week heatmap ───────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function OrdersHeatmap() {
  const [days, setDays] = useState(90)
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', 'heatmap', days], queryFn: () => fetchOrdersHeatmap(days) })
  if (isLoading) return <Spinner />
  const matrix = data?.matrix ?? Array.from({ length: 7 }, () => Array(24).fill(0))
  const total = data?.total ?? 0
  const max = Math.max(1, ...matrix.flat())

  // Find the busiest day and hour overall
  const dayTotals = matrix.map(row => row.reduce((a, b) => a + b, 0))
  const hourTotals = Array.from({ length: 24 }, (_, h) => matrix.reduce((sum, row) => sum + row[h], 0))
  const busiestDay = dayTotals.indexOf(Math.max(...dayTotals))
  const busiestHour = hourTotals.indexOf(Math.max(...hourTotals))

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex gap-4">
          <div><p className="text-xs text-gray-500">Total orders</p><p className="text-lg font-bold text-gray-900">{total}</p></div>
          <div><p className="text-xs text-gray-500">Busiest day</p><p className="text-lg font-bold text-gray-900">{total > 0 ? DAY_LABELS[busiestDay] : '—'}</p></div>
          <div><p className="text-xs text-gray-500">Peak hour</p><p className="text-lg font-bold text-gray-900">{total > 0 ? `${busiestHour}:00` : '—'}</p></div>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
          <option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-gray-400 font-normal px-1 w-8"></th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="text-gray-400 font-normal px-0.5 text-center w-5" style={{ minWidth: '20px' }}>
                  {h % 3 === 0 ? h : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, d) => (
              <tr key={d}>
                <td className="text-gray-500 font-medium pr-2 text-right">{DAY_LABELS[d]}</td>
                {row.map((count, h) => {
                  const intensity = count / max
                  const bg = count === 0
                    ? '#f3f4f6'
                    : `rgba(59, 130, 246, ${0.15 + intensity * 0.85})`
                  return (
                    <td key={h} className="p-0.5">
                      <div
                        className="w-full aspect-square rounded-sm hover:ring-2 hover:ring-blue-400 cursor-default"
                        style={{ backgroundColor: bg, minWidth: '16px', minHeight: '16px' }}
                        title={`${DAY_LABELS[d]} ${h}:00 — ${count} order${count !== 1 ? 's' : ''}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">Hours are in your local timezone. Darker blue = more orders.</p>
    </div>
  )
}

// ── NEW: Top customers ─────────────────────────────────────────────────

function TopCustomersList({ period }) {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', 'top-customers', period], queryFn: () => fetchTopCustomers(period, 8) })
  if (isLoading) return <Spinner />
  const customers = data?.customers ?? []
  const currency = data?.currency ?? 'EUR'
  if (customers.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400">
        <p className="text-2xl mb-1">👥</p>
        <p className="text-sm">No customers in this period yet.</p>
      </div>
    )
  }
  const max = Math.max(...customers.map(c => c.total_spent), 1)
  return (
    <div className="space-y-2">
      {customers.map((c, idx) => (
        <div key={c.email} className="flex items-center gap-3 p-2 -mx-2 rounded hover:bg-gray-50">
          <span className="text-xs font-semibold text-gray-400 w-5 shrink-0">#{idx + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
            <p className="text-xs text-gray-500 truncate">
              {c.email} · {c.orders_count} order{c.orders_count !== 1 ? 's' : ''}
              {c.city && ` · ${c.city}`}
            </p>
            <div className="bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
              <div className="bg-blue-500 h-full" style={{ width: `${(c.total_spent / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-sm font-semibold text-gray-900 shrink-0">{formatMoney(c.total_spent, currency)}</span>
        </div>
      ))}
    </div>
  )
}

// ── NEW: Active coupons widget ─────────────────────────────────────────

function ActiveCouponsList() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', 'active-coupons'], queryFn: () => fetchCoupons({ per_page: 100 }) })
  if (isLoading) return <Spinner />
  const all = data?.coupons ?? []
  const now = new Date()
  const active = all
    .filter(c => !c.date_expires || new Date(c.date_expires) > now)
    .filter(c => !c.usage_limit || c.usage_count < c.usage_limit)
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
    .slice(0, 5)

  if (active.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400">
        <p className="text-2xl mb-1">🎟️</p>
        <p className="text-sm">No active coupons.</p>
        <Link to="/coupons" className="text-xs text-blue-600 hover:underline">Create one</Link>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {active.map(c => {
        const remaining = c.usage_limit ? c.usage_limit - (c.usage_count || 0) : null
        const pct = c.usage_limit ? ((c.usage_count || 0) / c.usage_limit) * 100 : null
        const amount = c.discount_type === 'percent' ? `${c.amount}%` : `€${c.amount}`
        return (
          <Link key={c.id} to="/coupons" className="block p-2 -mx-2 rounded hover:bg-gray-50">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono font-semibold text-sm uppercase text-gray-900">{c.code}</span>
              <span className="text-sm font-semibold text-blue-600">{amount}</span>
            </div>
            <p className="text-xs text-gray-500">
              {c.usage_count || 0} use{c.usage_count !== 1 ? 's' : ''}
              {remaining != null && `, ${remaining} left`}
            </p>
            {pct != null && (
              <div className="bg-gray-100 rounded-full h-1 mt-1 overflow-hidden">
                <div className="bg-blue-500 h-full" style={{ width: `${pct}%` }} />
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ── Greeting + quick actions header ────────────────────────────────────

function DashboardHeader({ dense, setDense, lastFetched, onRefresh }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatLongDate()}
          {lastFetched && (
            <span className="ml-2 text-gray-400">
              · refreshed {Math.max(0, Math.round((Date.now() - lastFetched) / 1000))}s ago
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link to="/create" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Product</Link>
        <Link to="/coupons" className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">+ Coupon</Link>
        <Link to="/bulk" className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Bulk import</Link>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          title="Refresh dashboard data"
        >↻</button>
        <button
          onClick={() => setDense(!dense)}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          title={dense ? 'Switch to comfortable density' : 'Switch to compact density'}
        >{dense ? '⊞' : '⊟'}</button>
      </div>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const qc = useQueryClient()
  const [dense, setDense] = useDensity()
  const [orderPeriod, setOrderPeriod] = useState('month')
  const [lastFetched, setLastFetched] = useState(Date.now())

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard', 'overview'], queryFn: fetchDashboardOverview,
  })
  const { data: orders, isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ['dashboard', 'orders-overview', orderPeriod],
    queryFn: () => fetchOrdersOverview(orderPeriod), retry: 0,
  })
  const { data: sparkline } = useQuery({
    queryKey: ['dashboard', 'sparkline'], queryFn: () => fetchOrdersSparkline(30),
  })
  const { data: inventory } = useQuery({
    queryKey: ['dashboard', 'inventory'], queryFn: fetchInventoryStats,
  })

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    setLastFetched(Date.now())
  }

  const total = overview ? Object.values(overview.by_status).reduce((a, b) => a + b, 0) : 0
  const stock = overview?.by_stock ?? { instock: 0, outofstock: 0, onbackorder: 0 }
  const pendingOrders = (orders?.by_status?.processing ?? 0) + (orders?.by_status?.pending ?? 0) + (orders?.by_status?.['on-hold'] ?? 0)

  const PERIOD_LABEL = { week: 'this week', month: 'this month', last_month: 'last month', year: 'this year', all: 'all time' }[orderPeriod] || orderPeriod

  // Sparkline values
  const dailySalesSpark = (sparkline?.points ?? []).map(p => p.sales)
  const dailyOrdersSpark = (sparkline?.points ?? []).map(p => p.orders)

  // Comparison deltas
  const revenueDelta = orders?.previous ? pctDelta(orders.total_sales, orders.previous.total_sales) : null
  const ordersDelta  = orders?.previous ? pctDelta(orders.total_orders, orders.previous.total_orders) : null
  const aovDelta     = orders?.previous ? pctDelta(orders.avg_order_value, orders.previous.avg_order_value) : null

  const gap = dense ? 'gap-3' : 'gap-4'
  const ySpacing = dense ? 'space-y-4' : 'space-y-6'

  return (
    <div className={ySpacing}>
      <DashboardHeader dense={dense} setDense={setDense} lastFetched={lastFetched} onRefresh={handleRefresh} />

      {/* Needs attention */}
      <Section title="Needs your attention" dense={dense}>
        <NeedsAttention />
      </Section>

      {/* Catalog KPIs */}
      <div className={`grid grid-cols-2 md:grid-cols-4 ${gap}`}>
        <KpiCard label="Total products" value={total} sublabel={overview ? `${overview.by_status.publish} published` : ''} accent="blue" loading={overviewLoading} dense={dense} />
        <KpiCard label="In stock" value={stock.instock} accent="green" loading={overviewLoading} dense={dense} />
        <KpiCard label="Out of stock" value={stock.outofstock} sublabel={stock.outofstock > 0 ? 'needs attention' : 'all good'} accent={stock.outofstock > 0 ? 'red' : 'green'} loading={overviewLoading} dense={dense} />
        <KpiCard label="Stock value" value={inventory ? formatMoney(inventory.total_stock_value, overview ? 'EUR' : 'EUR') : '…'} sublabel={inventory ? `${inventory.in_stock_units} units across ${inventory.managed_products} products` : ''} accent="gray" loading={!inventory} dense={dense} />
      </div>

      {/* Status & Type breakdown */}
      {overview && (
        <div className={`grid md:grid-cols-2 ${gap}`}>
          <Section title="By status" dense={dense}>
            <div className="space-y-0.5">
              {Object.entries(overview.by_status).filter(([, c]) => c > 0).map(([status, count]) => (
                <BarRow key={status} label={status.charAt(0).toUpperCase() + status.slice(1)} count={count} max={Math.max(...Object.values(overview.by_status))} color="green" />
              ))}
            </div>
          </Section>
          <Section title="By type" dense={dense}>
            <div className="space-y-0.5">
              {Object.entries(overview.by_type).filter(([, c]) => c > 0).map(([type, count]) => (
                <BarRow key={type} label={type.charAt(0).toUpperCase() + type.slice(1)} count={count} max={Math.max(...Object.values(overview.by_type))} color="blue" />
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
              <select value={orderPeriod} onChange={e => setOrderPeriod(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="week">This week</option><option value="month">This month</option>
                <option value="last_month">Last month</option><option value="year">This year</option>
                <option value="all">All time</option>
              </select>
            </div>

            <div className={`grid grid-cols-2 md:grid-cols-4 ${gap}`}>
              <KpiCard label="Revenue" value={formatMoney(orders?.total_sales, orders?.currency)} accent="green" loading={ordersLoading} dense={dense} sparkline={dailySalesSpark} delta={revenueDelta} />
              <KpiCard label="Orders" value={orders?.total_orders ?? 0} accent="blue" loading={ordersLoading} dense={dense} sparkline={dailyOrdersSpark} delta={ordersDelta} />
              <KpiCard label="Avg order value" value={formatMoney(orders?.avg_order_value, orders?.currency)} accent="gray" loading={ordersLoading} dense={dense} delta={aovDelta} />
              <KpiCard
                label="Refunds"
                value={orders?.refunds_count ? `${orders.refunds_count} (${formatMoney(orders.refunds_total, orders.currency)})` : '0'}
                sublabel={pendingOrders > 0 ? `${pendingOrders} order${pendingOrders !== 1 ? 's' : ''} pending action` : ''}
                accent={orders?.refunds_count > 0 ? 'red' : 'gray'}
                loading={ordersLoading}
                dense={dense}
              />
            </div>
          </div>

          <div className={`grid md:grid-cols-3 ${gap}`}>
            <div className="md:col-span-2">
              <Section title="Sales trend" dense={dense}><SalesTrendChart period={orderPeriod} /></Section>
            </div>
            <Section title="Orders by status" dense={dense}>
              {orders && Object.keys(orders.by_status).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(orders.by_status).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                    <BarRow key={status} label={status.charAt(0).toUpperCase() + status.slice(1)} count={count} max={Math.max(...Object.values(orders.by_status))} color="blue" />
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400 italic">No status data.</p>}
            </Section>
          </div>

          <Section title="Orders per month" dense={dense}><MonthlyOrdersChart /></Section>

          <Section title="When orders arrive" dense={dense}><OrdersHeatmap /></Section>

          <div className={`grid md:grid-cols-2 ${gap}`}>
            <Section title="Top customers" dense={dense}><TopCustomersList period={orderPeriod} /></Section>
            <Section title="Recent orders" dense={dense}><RecentOrdersList /></Section>
          </div>
        </>
      )}

      {ordersError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          ⚠ Order statistics couldn't be loaded. The WooCommerce orders endpoint may require additional permissions on your API key.
        </div>
      )}

      {/* Top sellers + out of stock + active coupons */}
      <div className={`grid md:grid-cols-3 ${gap}`}>
        <div className="md:col-span-2">
          <Section title="Top sellers" action={<span className="text-xs text-gray-400">By total sales</span>} dense={dense}>
            <TopSellersList />
          </Section>
        </div>
        <Section title={<span className="flex items-center gap-2">Out of stock {stock.outofstock > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{stock.outofstock}</span>}</span>} dense={dense}>
          <OutOfStockList />
        </Section>
      </div>

      <div className={`grid md:grid-cols-3 ${gap}`}>
        <Section title="Active coupons" action={<Link to="/coupons" className="text-xs text-blue-600 hover:underline">Manage →</Link>} dense={dense}>
          <ActiveCouponsList />
        </Section>
        <Section title="Products per category" dense={dense}><CategoryDistribution /></Section>
        <Section title="Products per tag" dense={dense}><TagDistribution /></Section>
      </div>

      <Section title={<span className="flex items-center gap-2">Products per secret tag <span className="text-xs text-gray-400 font-normal">internal</span></span>} dense={dense}>
        <SecretTagDistribution />
      </Section>

      <p className="text-xs text-gray-400 italic text-center pb-4">
        WooCommerce doesn't track product views or clicks natively. Integrate Google Analytics for those metrics.
      </p>
    </div>
  )
}
