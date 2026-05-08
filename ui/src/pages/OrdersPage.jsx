import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrders, updateOrderStatus } from '../api/client'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = [
  { value: 'pending',    label: 'Pending',    color: 'bg-orange-100 text-orange-700' },
  { value: 'processing', label: 'Processing', color: 'bg-blue-100 text-blue-700' },
  { value: 'on-hold',    label: 'On hold',    color: 'bg-yellow-100 text-yellow-700' },
  { value: 'completed',  label: 'Completed',  color: 'bg-green-100 text-green-700' },
  { value: 'cancelled',  label: 'Cancelled',  color: 'bg-gray-100 text-gray-600' },
  { value: 'refunded',   label: 'Refunded',   color: 'bg-purple-100 text-purple-700' },
  { value: 'failed',     label: 'Failed',     color: 'bg-red-100 text-red-700' },
]

const STATUS_BY_VALUE = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o]))

function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
  } catch { return `${currency} ${n.toFixed(2)}` }
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function StatusDropdown({ order, disabled }) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (status) => updateOrderStatus(order.id, status),
    onSuccess: (updated) => {
      toast.success(`Order #${order.number || order.id} → ${updated.status}`)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order', String(order.id)] })
    },
    onError: () => toast.error('Status update failed'),
  })

  const cfg = STATUS_BY_VALUE[order.status]

  return (
    <select
      value={order.status}
      onChange={e => mutation.mutate(e.target.value)}
      disabled={disabled || mutation.isPending}
      onClick={e => e.stopPropagation()}
      className={`text-xs font-medium px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${cfg?.color ?? 'bg-gray-100 text-gray-600'}`}
    >
      {STATUS_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [dateAfter, setDateAfter]   = useState(searchParams.get('after')  || '')
  const [dateBefore, setDateBefore] = useState(searchParams.get('before') || '')
  const [rangeLabel, setRangeLabel] = useState(searchParams.get('label')  || '')

  // Sync URL → state when user navigates here from the dashboard chart
  useEffect(() => {
    setStatusFilter(searchParams.get('status') || '')
    setDateAfter(searchParams.get('after')  || '')
    setDateBefore(searchParams.get('before') || '')
    setRangeLabel(searchParams.get('label')  || '')
    setPage(1)
  }, [searchParams])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders', page, perPage, search, statusFilter, dateAfter, dateBefore],
    queryFn: () => fetchOrders({
      page, per_page: perPage, search,
      status: statusFilter,
      after:  dateAfter,
      before: dateBefore,
    }),
  })

  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} order{total !== 1 ? 's' : ''} total</p>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
        <form
          onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1) }}
          className="flex gap-2 flex-1 min-w-[260px]"
        >
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by order #, customer name…"
            className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button type="submit" className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Search</button>
        </form>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Any status</option>
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {(search || statusFilter || dateAfter || dateBefore) && (
          <button
            onClick={() => {
              setSearch(''); setSearchInput('');
              setStatusFilter(''); setDateAfter(''); setDateBefore(''); setRangeLabel('');
              setSearchParams({})
              setPage(1)
            }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active date-range banner */}
      {(dateAfter || dateBefore) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-blue-900">
            Showing orders {rangeLabel
              ? <>from <strong>{rangeLabel}</strong></>
              : <>between <strong>{dateAfter || '∞'}</strong> and <strong>{dateBefore || 'now'}</strong>}</>
            }
          </span>
          <button
            onClick={() => { setDateAfter(''); setDateBefore(''); setRangeLabel(''); setSearchParams({}); setPage(1) }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Clear date range
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading && <div className="py-12 flex justify-center"><Spinner /></div>}
        {isError && <div className="py-12 text-center text-red-500">Failed to load orders.</div>}
        {!isLoading && orders.length === 0 && <div className="py-12 text-center text-gray-400">No orders found.</div>}
        {!isLoading && orders.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Order</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(o => {
                const billing = o.billing || {}
                const customerName = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || '(guest)'
                return (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${o.id}`} className="font-mono text-blue-600 hover:text-blue-800 font-medium">#{o.number || o.id}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900 font-medium">{customerName}</p>
                      {billing.email && <p className="text-xs text-gray-500">{billing.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(o.date_created)}</td>
                    <td className="px-4 py-3 text-gray-600">{(o.line_items || []).length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(o.total, o.currency)}</td>
                    <td className="px-4 py-3"><StatusDropdown order={o} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/orders/${o.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && orders.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Showing <span className="font-medium text-gray-700">{(page - 1) * perPage + 1}</span>
              {' – '}
              <span className="font-medium text-gray-700">{(page - 1) * perPage + orders.length}</span>
              {' of '}<span className="font-medium text-gray-700">{total}</span>
            </span>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              Per page:
              <select
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
              >Previous</button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
              >Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
