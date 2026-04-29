import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchCoupons, createCoupon, updateCoupon, deleteCoupon } from '../api/client'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'

const DISCOUNT_TYPES = [
  { value: 'percent',        label: '% off cart',         suffix: '%' },
  { value: 'fixed_cart',     label: 'Fixed cart',          suffix: '€' },
  { value: 'fixed_product',  label: 'Fixed per product',   suffix: '€' },
]

const TYPE_BY_VALUE = Object.fromEntries(DISCOUNT_TYPES.map(t => [t.value, t]))

function formatAmount(coupon) {
  const cfg = TYPE_BY_VALUE[coupon.discount_type]
  if (!cfg) return coupon.amount
  return cfg.suffix === '%' ? `${coupon.amount}%` : `€${coupon.amount}`
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function expiryStatus(coupon) {
  if (!coupon.date_expires) return null
  const expires = new Date(coupon.date_expires)
  const now = new Date()
  if (expires < now) return { label: 'Expired', class: 'bg-red-100 text-red-700' }
  const daysLeft = Math.ceil((expires - now) / 86400000)
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, class: 'bg-orange-100 text-orange-700' }
  return { label: formatDate(coupon.date_expires), class: 'bg-gray-100 text-gray-600' }
}

// ─── Form modal ────────────────────────────────────────────────────────

function CouponFormModal({ coupon, onClose, onSaved }) {
  const isEdit = !!coupon?.id
  const [form, setForm] = useState(() => ({
    code:                          coupon?.code ?? '',
    discount_type:                 coupon?.discount_type ?? 'percent',
    amount:                        coupon?.amount ?? '10',
    description:                   coupon?.description ?? '',
    date_expires:                  coupon?.date_expires ? coupon.date_expires.slice(0, 10) : '',
    individual_use:                coupon?.individual_use ?? false,
    free_shipping:                 coupon?.free_shipping ?? false,
    exclude_sale_items:            coupon?.exclude_sale_items ?? false,
    minimum_amount:                coupon?.minimum_amount ?? '',
    maximum_amount:                coupon?.maximum_amount ?? '',
    usage_limit:                   coupon?.usage_limit ?? '',
    usage_limit_per_user:          coupon?.usage_limit_per_user ?? '',
    limit_usage_to_x_items:        coupon?.limit_usage_to_x_items ?? '',
    email_restrictions:            (coupon?.email_restrictions ?? []).join(', '),
    product_ids:                   (coupon?.product_ids ?? []).join(', '),
    excluded_product_ids:          (coupon?.excluded_product_ids ?? []).join(', '),
    product_categories:            (coupon?.product_categories ?? []).join(', '),
    excluded_product_categories:   (coupon?.excluded_product_categories ?? []).join(', '),
  }))

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function buildPayload() {
    const intList = (s) => s.split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean)
    const strList = (s) => s.split(',').map(x => x.trim()).filter(Boolean)
    const intOrNull = (v) => (v === '' || v == null) ? null : parseInt(v, 10)

    return {
      code:                          form.code.trim(),
      discount_type:                 form.discount_type,
      amount:                        String(form.amount || '0'),
      description:                   form.description,
      date_expires:                  form.date_expires ? `${form.date_expires}T23:59:59` : null,
      individual_use:                form.individual_use,
      free_shipping:                 form.free_shipping,
      exclude_sale_items:            form.exclude_sale_items,
      minimum_amount:                String(form.minimum_amount || '0'),
      maximum_amount:                String(form.maximum_amount || '0'),
      usage_limit:                   intOrNull(form.usage_limit),
      usage_limit_per_user:          intOrNull(form.usage_limit_per_user),
      limit_usage_to_x_items:        intOrNull(form.limit_usage_to_x_items),
      email_restrictions:            strList(form.email_restrictions),
      product_ids:                   intList(form.product_ids),
      excluded_product_ids:          intList(form.excluded_product_ids),
      product_categories:            intList(form.product_categories),
      excluded_product_categories:   intList(form.excluded_product_categories),
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload()
      return isEdit ? updateCoupon(coupon.id, payload) : createCoupon(payload)
    },
    onSuccess: (data) => {
      toast.success(isEdit ? 'Coupon updated' : 'Coupon created')
      onSaved(data)
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Save failed'),
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.code.trim()) { toast.error('Code is required'); return }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{isEdit ? `Edit coupon #${coupon.id}` : 'New coupon'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Basic */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Code *</label>
              <input
                required
                type="text"
                value={form.code}
                onChange={e => set('code', e.target.value)}
                placeholder="e.g. SUMMER25"
                className="w-full font-mono uppercase border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Discount type</label>
              <select
                value={form.discount_type}
                onChange={e => set('discount_type', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {DISCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="10"
                />
                <span className="absolute right-3 top-2.5 text-gray-400 text-sm pointer-events-none">{TYPE_BY_VALUE[form.discount_type]?.suffix}</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Optional internal note"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expires (date)</label>
              <input
                type="date"
                value={form.date_expires}
                onChange={e => set('date_expires', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Behavior</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.individual_use} onChange={e => set('individual_use', e.target.checked)} className="mt-0.5" />
              <span><span className="font-medium">Individual use only</span><span className="text-gray-500"> — cannot combine with other coupons</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.free_shipping} onChange={e => set('free_shipping', e.target.checked)} className="mt-0.5" />
              <span><span className="font-medium">Free shipping</span><span className="text-gray-500"> — requires "Free shipping" zone enabled</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.exclude_sale_items} onChange={e => set('exclude_sale_items', e.target.checked)} className="mt-0.5" />
              <span><span className="font-medium">Exclude sale items</span></span>
            </label>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <p className="col-span-2 text-xs font-medium text-gray-700 uppercase tracking-wide">Usage limits</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Total uses</label>
              <input type="number" min="0" value={form.usage_limit} onChange={e => set('usage_limit', e.target.value)} placeholder="unlimited" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Uses per customer</label>
              <input type="number" min="0" value={form.usage_limit_per_user} onChange={e => set('usage_limit_per_user', e.target.value)} placeholder="unlimited" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Limit to N items</label>
              <input type="number" min="0" value={form.limit_usage_to_x_items} onChange={e => set('limit_usage_to_x_items', e.target.value)} placeholder="all matching" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min spend (€)</label>
              <input type="text" value={form.minimum_amount} onChange={e => set('minimum_amount', e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max spend (€)</label>
              <input type="text" value={form.maximum_amount} onChange={e => set('maximum_amount', e.target.value)} placeholder="0" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Restrictions */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Restrictions <span className="text-gray-400 font-normal lowercase">(comma-separated IDs)</span></p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Allowed products</label>
                <input type="text" value={form.product_ids} onChange={e => set('product_ids', e.target.value)} placeholder="e.g. 12, 34, 56" className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Excluded products</label>
                <input type="text" value={form.excluded_product_ids} onChange={e => set('excluded_product_ids', e.target.value)} placeholder="e.g. 78" className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Allowed categories</label>
                <input type="text" value={form.product_categories} onChange={e => set('product_categories', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Excluded categories</label>
                <input type="text" value={form.excluded_product_categories} onChange={e => set('excluded_product_categories', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Allowed customer emails (comma-separated)</label>
                <input type="text" value={form.email_restrictions} onChange={e => set('email_restrictions', e.target.value)} placeholder="user@example.com, other@example.com" className="w-full border border-gray-300 rounded px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded">Cancel</button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : (isEdit ? 'Save changes' : 'Create coupon')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── List page ────────────────────────────────────────────────────────

export default function CouponsPage() {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | <coupon object>
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['coupons', page, perPage, search],
    queryFn: () => fetchCoupons({ page, per_page: perPage, search }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCoupon,
    onSuccess: () => {
      toast.success('Coupon deleted')
      qc.invalidateQueries({ queryKey: ['coupons'] })
    },
    onError: () => toast.error('Delete failed'),
  })

  const coupons = data?.coupons ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} coupon{total !== 1 ? 's' : ''} total</p>}
        </div>
        <button
          onClick={() => setEditing('new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New coupon
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1) }} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by code or description…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="submit" className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Search</button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700">Clear</button>
        )}
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading && <div className="py-12 flex justify-center"><Spinner /></div>}
        {isError && <div className="py-12 text-center text-red-500">Failed to load coupons.</div>}
        {!isLoading && coupons.length === 0 && <div className="py-12 text-center text-gray-400">No coupons yet.</div>}
        {!isLoading && coupons.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Discount</th>
                <th className="px-4 py-3 text-left">Used</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Flags</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map(c => {
                const expiry = expiryStatus(c)
                const remaining = c.usage_limit ? `${c.usage_count} / ${c.usage_limit}` : `${c.usage_count}`
                const isExhausted = c.usage_limit && c.usage_count >= c.usage_limit
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-gray-900 uppercase">{c.code}</p>
                      {c.description && <p className="text-xs text-gray-500 truncate max-w-xs">{c.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{formatAmount(c)}</p>
                      <p className="text-xs text-gray-500">{TYPE_BY_VALUE[c.discount_type]?.label ?? c.discount_type}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${isExhausted ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{remaining}</span>
                      {c.usage_limit_per_user && <p className="text-xs text-gray-400">{c.usage_limit_per_user}/customer</p>}
                    </td>
                    <td className="px-4 py-3">
                      {expiry ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expiry.class}`}>{expiry.label}</span>
                      ) : (
                        <span className="text-xs text-gray-400">No expiry</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.individual_use && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">solo</span>}
                        {c.free_shipping && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">ship</span>}
                        {c.exclude_sale_items && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">no-sale</span>}
                        {Number(c.minimum_amount) > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">min €{c.minimum_amount}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setEditing(c)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                        <button
                          onClick={() => { if (window.confirm(`Delete coupon "${c.code}"?`)) deleteMutation.mutate(c.id) }}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && coupons.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-700">{(page - 1) * perPage + 1}</span>
            {' – '}<span className="font-medium text-gray-700">{(page - 1) * perPage + coupons.length}</span>
            {' of '}<span className="font-medium text-gray-700">{total}</span>
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50">Previous</button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <CouponFormModal
          coupon={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ['coupons'] })
          }}
        />
      )}
    </div>
  )
}
