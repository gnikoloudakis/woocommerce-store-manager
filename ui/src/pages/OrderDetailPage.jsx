import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchOrder,
  updateOrderStatus,
  fetchOrderNotes,
  addOrderNote,
  fetchBoxNowVoucher,
  createBoxNowVoucher,
  cancelBoxNowVoucher,
  trackBoxNowParcel,
} from '../api/client'
import Spinner from '../components/Spinner'
import { useState } from 'react'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = [
  { value: 'pending',    label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'on-hold',    label: 'On hold' },
  { value: 'completed',  label: 'Completed' },
  { value: 'cancelled',  label: 'Cancelled' },
  { value: 'refunded',   label: 'Refunded' },
  { value: 'failed',     label: 'Failed' },
]

const STATUS_COLORS = {
  pending:    'bg-orange-100 text-orange-700 border-orange-200',
  processing: 'bg-blue-100 text-blue-700 border-blue-200',
  'on-hold':  'bg-yellow-100 text-yellow-700 border-yellow-200',
  completed:  'bg-green-100 text-green-700 border-green-200',
  cancelled:  'bg-gray-100 text-gray-600 border-gray-200',
  refunded:   'bg-purple-100 text-purple-700 border-purple-200',
  failed:     'bg-red-100 text-red-700 border-red-200',
}

function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount) || 0
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n) }
  catch { return `${currency} ${n.toFixed(2)}` }
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
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

function AddressBlock({ address, type }) {
  if (!address || !address.first_name) return <p className="text-sm text-gray-400">No {type} address.</p>
  return (
    <address className="text-sm text-gray-700 not-italic leading-relaxed">
      <strong>{address.first_name} {address.last_name}</strong>
      {address.company && <><br />{address.company}</>}
      {address.address_1 && <><br />{address.address_1}</>}
      {address.address_2 && <><br />{address.address_2}</>}
      {(address.city || address.postcode) && <><br />{address.postcode} {address.city}</>}
      {address.state && <><br />{address.state}</>}
      {address.country && <><br />{address.country}</>}
      {address.phone && <><br /><a href={`tel:${address.phone}`} className="text-blue-600 hover:underline">{address.phone}</a></>}
      {address.email && <><br /><a href={`mailto:${address.email}`} className="text-blue-600 hover:underline">{address.email}</a></>}
    </address>
  )
}

function BoxNowSection({ orderId }) {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boxnow', orderId],
    queryFn: () => fetchBoxNowVoucher(orderId),
    retry: 0,
  })

  const createMutation = useMutation({
    mutationFn: () => createBoxNowVoucher(orderId),
    onSuccess: () => {
      toast.success('Voucher created')
      qc.invalidateQueries({ queryKey: ['boxnow', orderId] })
      qc.invalidateQueries({ queryKey: ['order', String(orderId)] })
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Could not create voucher'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelBoxNowVoucher(orderId),
    onSuccess: () => {
      toast.success('Voucher cancelled')
      qc.invalidateQueries({ queryKey: ['boxnow', orderId] })
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Could not cancel voucher'),
  })

  const trackMutation = useMutation({
    mutationFn: () => trackBoxNowParcel(orderId),
    onSuccess: (data) => {
      toast.success('Tracking refreshed')
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Could not track parcel'),
  })

  if (isLoading) return <Spinner />

  // 501 = backend stub not implemented yet — show clear setup hint
  const status501 = error?.response?.status === 501
  const detail = error?.response?.data?.detail

  return (
    <div className="space-y-4">
      {data?.voucher_number ? (
        <>
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Voucher number</p>
              <p className="font-mono text-lg font-semibold text-gray-900">{data.voucher_number}</p>
              {data.tracking_url && (
                <a
                  href={data.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open public tracking page ↗
                </a>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <a
                href={`/api/orders/${orderId}/boxnow/label`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800"
              >
                Download label (PDF)
              </a>
              <button
                onClick={() => trackMutation.mutate()}
                disabled={trackMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {trackMutation.isPending ? 'Refreshing…' : 'Refresh status'}
              </button>
              <button
                onClick={() => { if (window.confirm(`Cancel voucher ${data.voucher_number}? Only works while parcel state is "New".`)) cancelMutation.mutate() }}
                disabled={cancelMutation.isPending || !data.configured}
                className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 disabled:opacity-50"
              >
                Cancel voucher
              </button>
            </div>
          </div>

          {(trackMutation.data?.details || data.details) && (
            <details className="text-xs" open={!!trackMutation.data?.details}>
              <summary className="cursor-pointer text-gray-500 select-none">Parcel details</summary>
              <pre className="bg-gray-50 rounded p-3 mt-2 overflow-x-auto text-xs">{JSON.stringify(trackMutation.data?.details ?? data.details, null, 2)}</pre>
            </details>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="text-center py-2">
            <p className="text-sm text-gray-500">No BOX NOW voucher detected in this order's metadata.</p>
            {data?.locker_id && (
              <p className="text-xs text-gray-600 mt-1">
                Customer picked locker ID <code className="bg-gray-100 px-1 rounded font-mono">{data.locker_id}</code> at checkout.
              </p>
            )}
          </div>

          {data?.candidate_meta?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
              <p className="font-medium text-blue-900 mb-2">
                ℹ Found {data.candidate_meta.length} BoxNow-related meta {data.candidate_meta.length === 1 ? 'entry' : 'entries'} on this order.
                If one of these is your voucher number, set <code className="bg-blue-100 px-1 rounded">BOXNOW_VOUCHER_META_KEY</code> in <code>.env</code> to its key.
              </p>
              <div className="bg-white rounded border border-blue-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-blue-100/50 text-blue-900 text-[10px] uppercase">
                    <tr>
                      <th className="px-2 py-1 text-left">Key</th>
                      <th className="px-2 py-1 text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {data.candidate_meta.map((m, i) => (
                      <tr key={i} className="hover:bg-blue-50/50">
                        <td className="px-2 py-1 font-mono text-blue-700">{m.key}</td>
                        <td className="px-2 py-1 font-mono text-gray-700 break-all">{m.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!data?.candidate_meta?.length && !data?.locker_id && (
            <p className="text-xs text-orange-600 text-center">
              ⚠ No BoxNow-related metadata found at all. The customer may not have picked BoxNow as the shipping method, or your store's plugin uses a non-standard meta naming.
            </p>
          )}

          <div className="text-center pt-1">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !data?.locker_id}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating…' : 'Create BOX NOW voucher'}
            </button>
          </div>
        </div>
      )}

      {(status501 || data?.configured === false) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
          ⚠ <strong>BOX NOW not configured.</strong> Set <code className="bg-yellow-100 px-1 rounded">BOXNOW_API_URL</code> and <code className="bg-yellow-100 px-1 rounded">BOXNOW_API_KEY</code> in <code>.env</code>, then implement the adapter methods in <code>data_sources/boxnow_adapter.py</code>.
          {detail && <div className="mt-1 text-yellow-700 font-mono">{detail}</div>}
        </div>
      )}
    </div>
  )
}

function OrderNotes({ orderId }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [customerNote, setCustomerNote] = useState(false)

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['order-notes', orderId],
    queryFn: () => fetchOrderNotes(orderId),
  })

  const addMutation = useMutation({
    mutationFn: () => addOrderNote(orderId, note, customerNote),
    onSuccess: () => {
      setNote('')
      setCustomerNote(false)
      qc.invalidateQueries({ queryKey: ['order-notes', orderId] })
      toast.success('Note added')
    },
    onError: () => toast.error('Could not add note'),
  })

  return (
    <div className="space-y-3">
      {isLoading ? <Spinner /> : (
        <div className="space-y-2">
          {notes.length === 0 && <p className="text-sm text-gray-400">No notes.</p>}
          {notes.map(n => (
            <div key={n.id} className={`rounded-lg p-3 text-sm ${n.customer_note ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
              <div dangerouslySetInnerHTML={{ __html: n.note }} />
              <p className="text-xs text-gray-400 mt-1">
                {n.customer_note && <span className="text-blue-600 font-medium">[Customer]</span>} {n.author} · {formatDate(n.date_created)}
              </p>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); if (note.trim()) addMutation.mutate() }} className="space-y-2 pt-3 border-t border-gray-100">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={customerNote} onChange={e => setCustomerNote(e.target.checked)} />
            Send to customer (visible in their account + email)
          </label>
          <button
            type="submit"
            disabled={!note.trim() || addMutation.isPending}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Add note
          </button>
        </div>
      </form>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
  })

  const statusMutation = useMutation({
    mutationFn: (status) => updateOrderStatus(id, status),
    onSuccess: () => {
      toast.success('Status updated')
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: () => toast.error('Status update failed'),
  })

  if (isLoading) return <div className="py-16 flex justify-center"><Spinner size="lg" label="Loading order…" /></div>
  if (isError) return <div className="py-16 text-center text-red-500">Failed to load order.</div>

  const billing = order.billing || {}
  const shipping = order.shipping || {}
  const customerName = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || '(guest)'
  const cfg = STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/orders" className="text-gray-400 hover:text-gray-700 text-sm">← Orders</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">Order #{order.number || order.id}</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg}`}>{order.status}</span>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase">Total</p>
          <p className="text-lg font-bold text-gray-900">{formatMoney(order.total, order.currency)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase">Customer</p>
          <p className="text-sm font-medium text-gray-900 truncate">{customerName}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase">Created</p>
          <p className="text-sm text-gray-700">{formatDate(order.date_created)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase">Payment</p>
          <p className="text-sm text-gray-700 truncate">{order.payment_method_title || '—'}</p>
        </div>
      </div>

      {/* Status changer */}
      <Section title="Status">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => statusMutation.mutate(opt.value)}
              disabled={statusMutation.isPending || order.status === opt.value}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                order.status === opt.value
                  ? `${STATUS_COLORS[opt.value]} cursor-default`
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {statusMutation.isPending && <Spinner size="sm" />}
        </div>
      </Section>

      {/* Line items */}
      <Section title={`Items (${(order.line_items || []).length})`}>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
            <tr>
              <th className="py-2 text-left">Product</th>
              <th className="py-2 text-left">SKU</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(order.line_items || []).map(item => (
              <tr key={item.id}>
                <td className="py-2.5">
                  <p className="text-gray-900 font-medium">{item.name}</p>
                  {item.meta_data?.length > 0 && (
                    <p className="text-xs text-gray-500">
                      {item.meta_data.filter(m => !m.key.startsWith('_')).map(m => `${m.display_key || m.key}: ${m.display_value || m.value}`).join(' · ')}
                    </p>
                  )}
                </td>
                <td className="py-2.5 font-mono text-xs text-gray-500">{item.sku || '—'}</td>
                <td className="py-2.5 text-right text-gray-700">{item.quantity}</td>
                <td className="py-2.5 text-right text-gray-700">{formatMoney(item.price, order.currency)}</td>
                <td className="py-2.5 text-right font-semibold text-gray-900">{formatMoney(item.total, order.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr>
              <td colSpan={4} className="pt-3 text-right text-gray-500">Subtotal</td>
              <td className="pt-3 text-right text-gray-700">{formatMoney(Number(order.total) - Number(order.shipping_total || 0) - Number(order.total_tax || 0), order.currency)}</td>
            </tr>
            {Number(order.shipping_total) > 0 && (
              <tr>
                <td colSpan={4} className="pt-1 text-right text-gray-500">Shipping</td>
                <td className="pt-1 text-right text-gray-700">{formatMoney(order.shipping_total, order.currency)}</td>
              </tr>
            )}
            {Number(order.total_tax) > 0 && (
              <tr>
                <td colSpan={4} className="pt-1 text-right text-gray-500">Tax</td>
                <td className="pt-1 text-right text-gray-700">{formatMoney(order.total_tax, order.currency)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={4} className="pt-2 text-right font-semibold text-gray-900">Total</td>
              <td className="pt-2 text-right font-bold text-gray-900">{formatMoney(order.total, order.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* BOX NOW */}
      <Section title={<span className="flex items-center gap-2">BOX NOW <span className="text-xs text-gray-400 font-normal">parcel locker</span></span>}>
        <BoxNowSection orderId={Number(id)} />
      </Section>

      {/* Addresses */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Billing">
          <AddressBlock address={billing} type="billing" />
        </Section>
        <Section title="Shipping">
          <AddressBlock address={Object.keys(shipping).length ? shipping : billing} type="shipping" />
        </Section>
      </div>

      {/* Customer note */}
      {order.customer_note && (
        <Section title="Customer note">
          <p className="text-sm text-gray-700 italic">"{order.customer_note}"</p>
        </Section>
      )}

      {/* Internal notes */}
      <Section title="Notes">
        <OrderNotes orderId={Number(id)} />
      </Section>
    </div>
  )
}
