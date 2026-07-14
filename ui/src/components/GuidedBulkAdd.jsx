import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCategories, fetchTags, bulkCreateProducts, createCategory, createTag } from '../api/client'
import MediaPicker from './MediaPicker'
import VariationBuilder from './VariationBuilder'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  created: { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Created' },
  updated: { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'Updated' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped' },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'   },
}

const STEPS = ['Add products', 'Review & import']

let _uid = 0

// Each product is fully self-contained — nothing is shared between products.
// The values below are just per-product starting points; edit them freely.
function makeProduct() {
  return {
    key: `p${_uid++}`,
    name: '',
    short_description: '',
    main_image_ids: [],
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    colors: ['Black', 'White'],
    basePrice: '18.00',
    categories: [],
    tags: [],
    secret_tags: [],
    priceOverrides: {},
    salePrices: {},
    stockQuantities: {},
    variationImageMapping: {},
    collapsed: false,
  }
}

/* ── small reusable inputs ─────────────────────────────────────────── */

function TagInput({ values, onChange, placeholder = 'add…' }) {
  function add(val) {
    const v = val.trim()
    if (v && !values.includes(v)) onChange([...values, v])
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-2 py-0.5 rounded-full">
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))} className="text-blue-500 hover:text-blue-800 leading-none">×</button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-gray-400 italic">none</span>}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        className="text-xs border border-gray-300 rounded px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(e.target.value)
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}

function MultiSelect({ label, options, value, onChange, loading = false, onCreate, labelKey = 'name', valueKey = 'slug' }) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(v) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }
  async function handleCreate() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const val = await onCreate(name)
      if (val != null && !value.includes(val)) onChange([...value, val])
      setNewName('')
      setCreating(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? `Could not create ${label ? label.toLowerCase() : 'item'}`)
    } finally {
      setBusy(false)
    }
  }
  const q = search.trim().toLowerCase()
  const filtered = q
    ? options.filter(o => String(o[labelKey]).toLowerCase().includes(q) || String(o[valueKey]).toLowerCase().includes(q))
    : options
  const showSearch = options.length > 10

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-2 gap-2">
          <label className="block text-sm font-medium text-gray-700">
            {label} <span className="text-xs font-normal text-gray-400">
              {loading ? '(loading…)' : `(${options.length} available${value.length ? `, ${value.length} selected` : ''})`}
            </span>
          </label>
          <div className="flex items-center gap-2">
            {showSearch && (
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="text-xs border border-gray-300 rounded px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            )}
            {onCreate && !creating && (
              <button type="button" onClick={() => setCreating(true)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-blue-600 whitespace-nowrap">+ New</button>
            )}
          </div>
        </div>
      )}

      {onCreate && creating && (
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            placeholder={`New ${label ? label.toLowerCase() : 'name'}…`}
            className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button type="button" onClick={handleCreate} disabled={busy || !newName.trim()} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => { setCreating(false); setNewName('') }} className="text-xs px-2 py-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
        {loading && options.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <svg className="animate-spin h-3.5 w-3.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading {label ? label.toLowerCase() : 'options'}…
          </span>
        )}
        {!loading && options.length === 0 && <span className="text-xs text-gray-400 italic">none available — create some on the Categories / Taxonomy pages first</span>}
        {options.length > 0 && filtered.length === 0 && <span className="text-xs text-gray-400 italic">no matches for “{search}”</span>}
        {filtered.map(opt => {
          const v = opt[valueKey]
          const selected = value.includes(v)
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {opt[labelKey]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── main wizard ───────────────────────────────────────────────────── */

export default function GuidedBulkAdd() {
  const [step, setStep] = useState(0)
  const [products, setProducts] = useState(() => [makeProduct()])
  const [progress, setProgress] = useState(null) // null | { current, total, name }
  const [results, setResults] = useState(null)

  // Cache for the session — categories/tags rarely change while adding products,
  // so we fetch once and reuse instead of re-hitting WooCommerce for every card.
  const { data: allCategories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['categories'], queryFn: fetchCategories, staleTime: 5 * 60 * 1000,
  })
  const { data: allTags = [], isLoading: tagsLoading } = useQuery({
    queryKey: ['tags'], queryFn: fetchTags, staleTime: 5 * 60 * 1000,
  })
  const queryClient = useQueryClient()

  // Create a category/tag in WooCommerce on the fly, refresh the list, and
  // return its slug so the picker can auto-select it.
  async function createCategoryInline(name) {
    const created = await createCategory({ name })
    await queryClient.invalidateQueries({ queryKey: ['categories'] })
    toast.success(`Category “${created.name}” created`)
    return created.slug
  }
  async function createTagInline(name) {
    const created = await createTag({ name })
    await queryClient.invalidateQueries({ queryKey: ['tags'] })
    toast.success(`Tag “${created.name}” created`)
    return created.slug
  }

  /* product mutation helpers */
  function patchProduct(key, patch) {
    setProducts(prev => prev.map(p => p.key === key ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p))
  }
  function fieldSetter(key, field) {
    // supports both direct values and functional updates (VariationBuilder uses both)
    return valueOrFn => patchProduct(key, p => ({ [field]: typeof valueOrFn === 'function' ? valueOrFn(p[field]) : valueOrFn }))
  }
  function addProduct() {
    setProducts(prev => [...prev.map(p => ({ ...p, collapsed: true })), makeProduct()])
  }
  function removeProduct(key) {
    setProducts(prev => prev.filter(p => p.key !== key))
  }
  function duplicateProduct(key) {
    setProducts(prev => {
      const src = prev.find(p => p.key === key)
      if (!src) return prev
      const copy = { ...src, key: `p${_uid++}`, name: src.name ? `${src.name} (copy)` : '', collapsed: false }
      const idx = prev.findIndex(p => p.key === key)
      const next = prev.map(p => ({ ...p, collapsed: true }))
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  /* payload building */
  function cleanMap(map, imageMode = false) {
    const out = {}
    for (const k in map) {
      const v = map[k]
      if (v === undefined || v === null) continue
      if (!imageMode && String(v).trim() === '') continue
      out[k] = v
    }
    return out
  }
  function stockMap(map) {
    const out = {}
    for (const k in map) {
      const v = map[k]
      if (v === undefined || v === null || String(v).trim() === '') continue
      const n = parseInt(v, 10)
      if (!Number.isNaN(n)) out[k] = n
    }
    return out
  }
  function toItem(p) {
    return {
      product: {
        product_name: p.name.trim(),
        short_description: p.short_description || '',
        main_image_ids: p.main_image_ids,
        categories: p.categories.map(id => ({ id })),
        tags: p.tags.map(id => ({ id })),
        colors: p.colors,
        sizes: p.sizes,
        base_price: (p.basePrice || '0').trim(),
        secret_tags: p.secret_tags,
        related_ids: [],
        meta_data: [],
      },
      variations: {
        variation_image_mapping: cleanMap(p.variationImageMapping, true),
        price_overrides: cleanMap(p.priceOverrides),
        sale_prices: cleanMap(p.salePrices),
        stock_quantities: stockMap(p.stockQuantities),
      },
    }
  }

  /* validation */
  const nameCounts = useMemo(() => {
    const m = {}
    products.forEach(p => { const n = p.name.trim().toLowerCase(); if (n) m[n] = (m[n] || 0) + 1 })
    return m
  }, [products])

  const productIssues = useMemo(() => products.map(p => {
    const errors = []
    const warnings = []
    if (!p.name.trim()) errors.push('Missing name')
    if (!p.sizes.length) errors.push('No sizes')
    if (!p.colors.length) errors.push('No colors')
    if (p.name.trim() && nameCounts[p.name.trim().toLowerCase()] > 1) warnings.push('Duplicate name (will upsert / merge)')
    if (!p.main_image_ids.length) warnings.push('No images')
    return { errors, warnings }
  }), [products, nameCounts])

  const hasBlocking = products.length === 0 || productIssues.some(i => i.errors.length > 0)
  const isImporting = progress !== null
  const totalVariations = products.reduce((sum, p) => sum + p.sizes.length * p.colors.length, 0)

  async function runImport() {
    const items = products.map(toItem)
    setResults(null)
    const all = []
    for (let i = 0; i < items.length; i++) {
      setProgress({ current: i + 1, total: items.length, name: items[i].product.product_name })
      try {
        const res = await bulkCreateProducts([items[i]])
        all.push(...res)
      } catch (err) {
        all.push({
          product_name: items[i].product.product_name,
          status: 'error',
          reason: err.response?.data?.detail ?? 'Import failed',
        })
      }
    }
    setProgress(null)
    setResults(all)

    const created = all.filter(r => r.status === 'created').length
    const updated = all.filter(r => r.status === 'updated').length
    const errors  = all.filter(r => r.status === 'error').length
    const parts = []
    if (created) parts.push(`${created} created`)
    if (updated) parts.push(`${updated} updated`)
    if (errors)  parts.push(`${errors} failed`)
    const msg = parts.join(', ') || 'Nothing to do'
    if (errors === 0) toast.success(msg)
    else toast.error(msg)
  }

  return (
    <div className="space-y-6">

      {/* Progress blocker */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 w-[380px]">
            <svg className="animate-spin h-10 w-10 text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="w-full text-center">
              <p className="text-gray-900 font-semibold text-lg">Importing products…</p>
              <p className="text-gray-500 text-sm mt-1">{progress.current} of {progress.total}</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
            <p className="text-gray-600 text-sm text-center truncate w-full px-2" title={progress.name}>{progress.name}</p>
          </div>
        </div>
      )}

      {/* Stepper */}
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button type="button" onClick={() => { if (i === 0 || !hasBlocking) setStep(i) }} className="flex items-center gap-2 group">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                i === step ? 'bg-blue-600 text-white' : i < step ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
              }`}>{i + 1}</span>
              <span className={`${i === step ? 'text-gray-900 font-medium' : 'text-gray-500'} group-hover:text-gray-900`}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="text-gray-300 mx-1">→</span>}
          </li>
        ))}
      </ol>

      {/* ── Step 1: add products ── */}
      {step === 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Add products</h2>
              <p className="text-sm text-gray-500">{products.length} product{products.length !== 1 ? 's' : ''} · {totalVariations} variation{totalVariations !== 1 ? 's' : ''} total · each product is independent</p>
            </div>
            <button type="button" onClick={addProduct} className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">+ Add product</button>
          </div>

          {products.map((p, idx) => {
            const issue = productIssues[idx]
            const varCount = p.sizes.length * p.colors.length
            return (
              <div key={p.key} className="bg-white rounded-lg border border-gray-200">
                {/* header row */}
                <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-400 w-6 text-center">{idx + 1}</span>
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => patchProduct(p.key, { name: e.target.value })}
                    placeholder="Product name (required)"
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 ${
                      !p.name.trim() ? 'border-red-300 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-400'
                    }`}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">{varCount} var</span>
                  {issue.errors.length > 0 && <span className="text-red-600 text-xs whitespace-nowrap">✕ {issue.errors.length}</span>}
                  <button type="button" onClick={() => duplicateProduct(p.key)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Duplicate">⧉</button>
                  <button type="button" onClick={() => patchProduct(p.key, { collapsed: !p.collapsed })} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                    {p.collapsed ? 'Expand' : 'Collapse'}
                  </button>
                  <button type="button" onClick={() => removeProduct(p.key)} className="text-gray-300 hover:text-red-500 text-lg leading-none" title="Remove">×</button>
                </div>

                {!p.collapsed && (
                  <div className="p-4 space-y-5">
                    <MediaPicker value={p.main_image_ids} onChange={ids => patchProduct(p.key, { main_image_ids: ids })} multiple label="Product images" />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Short description</label>
                      <textarea
                        value={p.short_description}
                        onChange={e => patchProduct(p.key, { short_description: e.target.value })}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="Optional"
                      />
                    </div>

                    <MultiSelect label="Categories" options={allCategories} loading={catsLoading} onCreate={createCategoryInline} value={p.categories} onChange={categories => patchProduct(p.key, { categories })} />
                    <MultiSelect label="Tags" options={allTags} loading={tagsLoading} onCreate={createTagInline} value={p.tags} onChange={tags => patchProduct(p.key, { tags })} />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Secret tags <span className="text-xs font-normal text-gray-400">(hidden internal keywords)</span></label>
                      <TagInput values={p.secret_tags} onChange={secret_tags => patchProduct(p.key, { secret_tags })} placeholder="keyword…" />
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Variations (Size × Color)</h4>
                      <VariationBuilder
                        sizes={p.sizes}                     setSizes={fieldSetter(p.key, 'sizes')}
                        colors={p.colors}                   setColors={fieldSetter(p.key, 'colors')}
                        basePrice={p.basePrice}             setBasePrice={fieldSetter(p.key, 'basePrice')}
                        priceOverrides={p.priceOverrides}   setPriceOverrides={fieldSetter(p.key, 'priceOverrides')}
                        salePrices={p.salePrices}           setSalePrices={fieldSetter(p.key, 'salePrices')}
                        stockQuantities={p.stockQuantities} setStockQuantities={fieldSetter(p.key, 'stockQuantities')}
                        variationImageMapping={p.variationImageMapping} setVariationImageMapping={fieldSetter(p.key, 'variationImageMapping')}
                      />
                    </div>

                    {(issue.errors.length > 0 || issue.warnings.length > 0) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {issue.errors.map(e => <span key={e} className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">✕ {e}</span>)}
                        {issue.warnings.map(w => <span key={w} className="text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded">⚠ {w}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" onClick={addProduct} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 text-sm font-medium">
            + Add product
          </button>

          <div className="flex justify-end pt-2">
            <button type="button" onClick={() => setStep(1)} disabled={products.length === 0} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Next: review →</button>
          </div>
        </section>
      )}

      {/* ── Step 2: review & import ── */}
      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Review &amp; import</h2>
            <p className="text-sm text-gray-500">{products.length} product{products.length !== 1 ? 's' : ''} · {totalVariations} variations · upsert by name (existing products are updated)</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Images</th>
                  <th className="px-3 py-2 text-left">Colors × Sizes</th>
                  <th className="px-3 py-2 text-left">Variations</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p, idx) => {
                  const issue = productIssues[idx]
                  const varCount = p.sizes.length * p.colors.length
                  const ok = issue.errors.length === 0
                  return (
                    <tr key={p.key} className={ok ? '' : 'bg-red-50'}>
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{p.name.trim() || <span className="text-red-500 italic">unnamed</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{p.main_image_ids.length}</td>
                      <td className="px-3 py-2 text-gray-600">{p.colors.length} × {p.sizes.length}</td>
                      <td className="px-3 py-2 text-gray-600">{varCount}</td>
                      <td className="px-3 py-2">
                        {issue.errors.length > 0
                          ? <span className="text-red-600 text-xs">✕ {issue.errors.join(', ')}</span>
                          : issue.warnings.length > 0
                            ? <span className="text-yellow-700 text-xs">⚠ {issue.warnings.join(', ')}</span>
                            : <span className="text-green-600 text-xs">✓ ready</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {hasBlocking && (
            <p className="text-sm text-red-600 flex items-center gap-1.5"><span>✕</span> Fix the errors above before importing.</p>
          )}

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(0)} className="px-5 py-2.5 border border-gray-300 rounded-lg font-medium text-sm text-gray-600 hover:bg-gray-50">← Back</button>
            <button type="button" onClick={runImport} disabled={hasBlocking || isImporting} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {products.length} product{products.length !== 1 ? 's' : ''}
            </button>
          </div>

          {/* Results */}
          {results && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Results</h3>
              <div className="space-y-2">
                {results.map((r, i) => {
                  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.error
                  return (
                    <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-3 ${cfg.bg}`}>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{r.product_name}</p>
                        {r.product_id && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            ID #{r.product_id}
                            {r.variations_count > 0 && ` · ${r.variations_count} variation${r.variations_count !== 1 ? 's' : ''}`}
                            {r.secret_tags_count > 0 && ` · ${r.secret_tags_count} secret tag${r.secret_tags_count !== 1 ? 's' : ''}`}
                          </p>
                        )}
                        {r.note && <p className="text-xs text-gray-400 italic mt-0.5">{r.note}</p>}
                        {r.reason && <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-4 ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
