import { useState, useRef, useEffect } from 'react'
import {
  fetchBlogSites,
  exportBlogPosts, importBlogPosts,
  exportMedia,    importMediaItem,
  syncWCTaxonomy, exportWCProducts, exportWCVariations, fetchWCSkuMap, importWCProductOne,
  exportWCCoupons, fetchWCCouponCodeMap, importWCCoupon,
  exportWCOrders, fetchWCOrderIdMap, importWCOrder,
  exportWCCustomers, fetchWCCustomerEmailMap, importWCCustomer,
  exportWCEmailSettings, importWCEmailSettings,
  exportWCTaxes, importWCTaxes,
  exportWCShipping, importWCShipping,
  exportWCStoreSettings, importWCStoreSettings,
} from '../api/client'
import toast from 'react-hot-toast'

// ── Shared config ─────────────────────────────────────────────────────────────

const POST_STATUS = {
  created: { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Created' },
  updated: { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'Updated' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped' },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'   },
}

const MEDIA_STATUS = {
  created: { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Uploaded' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped'  },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'    },
}

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function SiteSelect({ label, value, onChange, sites, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
      >
        {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-10 w-10 text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ProgressOverlay({ title, subtitle, current, total, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 w-[380px]">
        <Spinner />
        <div className="w-full text-center">
          <p className="text-gray-900 font-semibold text-lg">{title}</p>
          {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
        </div>
        {total > 0 && (
          <>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(current / total) * 100}%` }}
              />
            </div>
            <p className="text-gray-500 text-sm">{current} of {total}</p>
          </>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-red-600 underline underline-offset-2"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function SelectAllCheckbox({ ids, selected, onSelectAll, onSelectNone }) {
  const ref = useRef()
  const allSelected  = ids.length > 0 && ids.every(id => selected.has(id))
  const someSelected = !allSelected && ids.some(id => selected.has(id))
  useEffect(() => { if (ref.current) ref.current.indeterminate = someSelected }, [someSelected])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={e => e.target.checked ? onSelectAll() : onSelectNone()}
      className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
    />
  )
}

function OverwriteToggle({ checked, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
      />
      Overwrite existing
    </label>
  )
}

// ── Posts tab ─────────────────────────────────────────────────────────────────

function PostsTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [posts, setPosts]               = useState(null)
  const [overwrite, setOverwrite]       = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [results, setResults]           = useState(null)
  const fileRef = useRef()

  const isWorking = exportLoading || importLoading

  async function handleExport() {
    setExportLoading(true); setPosts(null); setResults(null)
    try {
      const data = await exportBlogPosts(source)
      setPosts(data.posts)
      toast.success(`Exported ${data.count} posts`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Export failed')
    } finally { setExportLoading(false) }
  }

  function handleDownload() {
    const blob = new Blob([JSON.stringify(posts, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'blog_export.json' })
    a.click(); URL.revokeObjectURL(a.href)
  }

  function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        const list = Array.isArray(parsed) ? parsed : parsed.posts
        setPosts(list); setResults(null)
        toast.success(`Loaded ${list?.length ?? 0} posts`)
      } catch { toast.error('Invalid JSON') }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!posts?.length) return
    setImportLoading(true); setResults(null)
    try {
      const data = await importBlogPosts(target, posts, overwrite, source)
      setResults(data)
      const parts = []
      if (data.created) parts.push(`${data.created} created`)
      if (data.updated) parts.push(`${data.updated} updated`)
      if (data.skipped) parts.push(`${data.skipped} skipped`)
      if (data.errors)  parts.push(`${data.errors} failed`)
      data.errors === 0 ? toast.success(parts.join(', ') || 'Nothing to do') : toast.error(parts.join(', '))
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Import failed')
    } finally { setImportLoading(false) }
  }

  return (
    <>
      {isWorking && (
        <ProgressOverlay
          title={exportLoading ? 'Fetching posts…' : 'Importing posts…'}
          subtitle="This may take a moment."
          current={0} total={0}
        />
      )}

      {/* Export */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Export</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch all published posts from <span className="font-medium text-gray-700">{sourceLabel}</span></p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => fileRef.current.click()} disabled={isWorking}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600 disabled:opacity-50">
              Load JSON…
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleUpload} />
            <button type="button" onClick={handleExport} disabled={isWorking || disabled}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Export posts
            </button>
          </div>
        </div>

        {posts && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-600 font-medium">{posts.length} post{posts.length !== 1 ? 's' : ''} ready</p>
              <button type="button" onClick={handleDownload}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                Download JSON
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {posts.map((p, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  {p._featured_image_url
                    ? <img src={p._featured_image_url} alt="" className="w-10 h-10 object-cover rounded shrink-0 bg-gray-100" />
                    : <div className="w-10 h-10 bg-gray-100 rounded shrink-0 flex items-center justify-center text-[10px] text-gray-400">IMG</div>
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.title?.rendered || p.slug}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{p.slug}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.status === 'publish' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Import */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!posts ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Push to <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing posts overwritten' : ' — existing slugs skipped'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button type="button" onClick={handleImport} disabled={!posts?.length || isWorking || disabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {posts?.length ? `${posts.length} post${posts.length !== 1 ? 's' : ''}` : 'posts'}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm font-medium">
              {results.created > 0 && <span className="text-green-600">{results.created} created</span>}
              {results.updated > 0 && <span className="text-blue-600">{results.updated} updated</span>}
              {results.skipped > 0 && <span className="text-yellow-600">{results.skipped} skipped</span>}
              {results.errors  > 0 && <span className="text-red-600">{results.errors} failed</span>}
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {results.results.map((r, i) => {
                const cfg = POST_STATUS[r.status] ?? POST_STATUS.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2.5 ${cfg.bg}`}>
                    <div>
                      <p className="font-mono text-xs text-gray-700">{r.slug}</p>
                      {r.id && <p className="text-xs text-gray-400">ID #{r.id}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                      {r.warnings?.map((w, wi) => <p key={wi} className="text-xs text-yellow-700 mt-0.5">{w}</p>)}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// ── Media tab ─────────────────────────────────────────────────────────────────

function MediaTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [items, setItems]           = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [overwrite, setOverwrite]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(null)
  const [results, setResults]       = useState(null)
  const lastClickedRef              = useRef(null)
  const cancelledRef                = useRef(false)

  const isWorking = loading || !!progress

  async function handleLoad() {
    setLoading(true); setItems(null); setSelected(new Set()); setResults(null)
    try {
      const data = await exportMedia(source)
      setItems(data.items)
      setSelected(new Set(data.items.map(i => i.id)))
      toast.success(`Loaded ${data.count} media items`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load media')
    } finally { setLoading(false) }
  }

  function toggle(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const selectAll  = () => setSelected(new Set(items.map(i => i.id)))
  const selectNone = () => setSelected(new Set())

  function handleRowClick(e, id) {
    e.preventDefault()
    if (e.shiftKey && lastClickedRef.current != null) {
      const ids    = items.map(i => i.id)
      const a      = ids.indexOf(lastClickedRef.current)
      const b      = ids.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(prev => {
        const s = new Set(prev)
        ids.slice(lo, hi + 1).forEach(rid => s.add(rid))
        return s
      })
    } else if (e.ctrlKey || e.metaKey) {
      toggle(id)
      lastClickedRef.current = id
    } else {
      if (selected.has(id)) {
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
      } else {
        setSelected(new Set([id]))
      }
      lastClickedRef.current = id
    }
  }

  async function handleImport() {
    const toUpload = (items || []).filter(i => selected.has(i.id))
    if (!toUpload.length) return

    cancelledRef.current = false
    setResults(null)
    const allResults = []
    for (let i = 0; i < toUpload.length; i++) {
      if (cancelledRef.current) break
      const item = toUpload[i]
      setProgress({ current: i + 1, total: toUpload.length, filename: item.filename })
      let entry
      try {
        const data = await importMediaItem(target, item, overwrite)
        entry = data.results[0]
      } catch (err) {
        entry = { filename: item.filename, status: 'error', error: err.response?.data?.detail ?? 'Failed' }
      }
      allResults.push(entry)
      setResults([...allResults])
    }

    setProgress(null)
    const created = allResults.filter(r => r.status === 'created').length
    const skipped = allResults.filter(r => r.status === 'skipped').length
    const errors  = allResults.filter(r => r.status === 'error').length
    const parts = []
    if (created) parts.push(`${created} uploaded`)
    if (skipped) parts.push(`${skipped} skipped`)
    if (errors)  parts.push(`${errors} failed`)
    errors === 0 ? toast.success(parts.join(', ') || 'Nothing to do') : toast.error(parts.join(', '))
  }

  return (
    <>
      {progress && (
        <ProgressOverlay
          title="Uploading media…"
          subtitle={progress.filename}
          current={progress.current}
          total={progress.total}
          onCancel={() => { cancelledRef.current = true }}
        />
      )}

      {/* Load */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load media</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch media library from <span className="font-medium text-gray-700">{sourceLabel}</span></p>
          </div>
          <button type="button" onClick={handleLoad} disabled={isWorking || disabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Loading…' : 'Load media'}
          </button>
        </div>

        {items && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{items.length} items · <span className="font-medium text-gray-700">{selected.size} selected</span></span>
              <div className="flex gap-3">
                <button type="button" onClick={selectAll}  className="text-xs text-blue-600 hover:text-blue-800">Select all</button>
                <button type="button" onClick={selectNone} className="text-xs text-blue-600 hover:text-blue-800">None</button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 select-none">
              {items.map(item => {
                const isSelected = selected.has(item.id)
                return (
                  <div
                    key={item.id}
                    onClick={e => handleRowClick(e, item.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="rounded border-gray-300 text-blue-600 shrink-0 pointer-events-none"
                    />
                    {item.thumbnail
                      ? <img src={item.thumbnail} alt="" className="w-10 h-10 object-cover rounded shrink-0 bg-gray-100" />
                      : <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0 text-[10px] text-gray-400 font-mono">
                          {item.mime_type?.split('/')[1]?.toUpperCase().slice(0, 4) ?? 'FILE'}
                        </div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{item.filename}</p>
                      <p className="text-xs text-gray-400">
                        {item.width && item.height ? `${item.width}×${item.height}` : item.mime_type}
                        {item.filesize ? ` · ${formatBytes(item.filesize)}` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Upload */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!items ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Upload</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload to <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing files overwritten' : ' — existing filenames skipped'}
              . Original names and dimensions are preserved.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button type="button" onClick={handleImport} disabled={selected.size === 0 || isWorking || disabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Upload {selected.size > 0 ? `${selected.size} file${selected.size !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm font-medium">
              {results.filter(r => r.status === 'created').length > 0 && <span className="text-green-600">{results.filter(r => r.status === 'created').length} uploaded</span>}
              {results.filter(r => r.status === 'skipped').length > 0 && <span className="text-yellow-600">{results.filter(r => r.status === 'skipped').length} skipped</span>}
              {results.filter(r => r.status === 'error').length > 0  && <span className="text-red-600">{results.filter(r => r.status === 'error').length} failed</span>}
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {results.map((r, i) => {
                const cfg = MEDIA_STATUS[r.status] ?? MEDIA_STATUS.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2 ${cfg.bg}`}>
                    <div>
                      <p className="font-mono text-xs text-gray-700">{r.filename}</p>
                      {r.id && <p className="text-xs text-gray-400">ID #{r.id}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// ── Products tab ──────────────────────────────────────────────────────────────

const FIELD_GROUPS = [
  { key: 'pricing',    label: 'Pricing',     desc: 'Regular/sale price, sale dates' },
  { key: 'inventory',  label: 'Inventory',   desc: 'Stock qty, status, backorders, low-stock threshold' },
  { key: 'images',     label: 'Images',      desc: 'Product images (matched by filename)' },
  { key: 'categories', label: 'Categories',  desc: 'Auto-created on target if missing' },
  { key: 'tags',       label: 'Tags',        desc: 'Auto-created on target if missing' },
  { key: 'attributes', label: 'Attributes',  desc: 'Size, color, and other attributes' },
  { key: 'shipping',   label: 'Shipping',    desc: 'Weight, dimensions, shipping class' },
  { key: 'tax',        label: 'Tax',         desc: 'Tax status and class' },
  { key: 'dates',      label: 'Dates',       desc: 'Created and modified timestamps' },
  { key: 'downloads',  label: 'Downloads',   desc: 'Downloadable files, limit and expiry' },
  { key: 'meta',       label: 'Meta data',   desc: 'Custom fields and plugin data' },
  { key: 'visibility', label: 'Visibility',  desc: 'Featured, catalog visibility, reviews' },
]

const PRODUCT_STATUS = {
  created: { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Created' },
  updated: { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'Updated' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped' },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'   },
}

function ProductsTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [taxoLoading, setTaxoLoading] = useState(false)
  const [taxoResult, setTaxoResult]   = useState(null)
  const [products, setProducts]       = useState(null)
  const [filter, setFilter]           = useState({ search: '', type: '', status: '' })
  const [selected, setSelected]       = useState(new Set())
  const [overwrite, setOverwrite]     = useState(false)
  const [includeFields, setIncludeFields] = useState(new Set(FIELD_GROUPS.map(g => g.key)))
  const [loading, setLoading]         = useState(false)
  const [progress, setProgress]       = useState(null)
  const [results, setResults]         = useState(null)
  const lastClickedRef                = useRef(null)
  const cancelledRef                  = useRef(false)

  function toggleField(key) {
    setIncludeFields(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  async function handleSyncTaxonomy() {
    setTaxoLoading(true); setTaxoResult(null)
    try {
      const data = await syncWCTaxonomy(source, target)
      setTaxoResult(data)
      const created = [
        ...(data.attributes || []),
        ...(data.shipping_classes || []),
        ...(data.categories || []),
        ...(data.tags || []),
      ].filter(r => r.status === 'created').length
      toast.success(`Taxonomy synced — ${created} item${created !== 1 ? 's' : ''} created`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Taxonomy sync failed')
    } finally { setTaxoLoading(false) }
  }

  const isWorking = loading || !!progress || taxoLoading

  async function handleLoad() {
    setLoading(true); setProducts(null); setSelected(new Set()); setResults(null)
    setProgress({ current: 0, total: 0, name: 'Starting…' })
    const all = []
    try {
      // Phase 1 — load all product pages (fast, no variations yet)
      let page = 1, totalPages = 1, total = 0
      do {
        const data = await exportWCProducts(source, page)
        all.push(...data.products)
        total      = data.total
        totalPages = data.total_pages
        setProgress({ current: all.length, total, name: 'Loading products…' })
        page++
      } while (page <= totalPages)

      // Phase 2 — fetch variations in parallel batches of 5
      const variableProducts = all.filter(p => p.type === 'variable')
      const BATCH = 5
      let done = 0
      for (let i = 0; i < variableProducts.length; i += BATCH) {
        const batch = variableProducts.slice(i, i + BATCH)
        await Promise.all(batch.map(async p => {
          try {
            const data = await exportWCVariations(source, p.id)
            p._variations = data.variations
          } catch { p._variations = [] }
        }))
        done += batch.length
        setProgress({ current: done, total: variableProducts.length, name: 'Loading variations…' })
      }

      setProducts([...all])
      setSelected(new Set(all.map(p => p.id)))
      toast.success(`Loaded ${all.length} products`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load products')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const filteredProducts = (products || []).filter(p => {
    if (filter.type   && p.type   !== filter.type)   return false
    if (filter.status && p.status !== filter.status) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  function toggle(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const selectAll      = () => setSelected(new Set(products.map(p => p.id)))
  const selectNone     = () => setSelected(new Set())
  const selectFiltered = () => setSelected(prev => {
    const s = new Set(prev)
    filteredProducts.forEach(p => s.add(p.id))
    return s
  })
  const deselectFiltered = () => setSelected(prev => {
    const s = new Set(prev)
    filteredProducts.forEach(p => s.delete(p.id))
    return s
  })

  function handleRowClick(e, id) {
    e.preventDefault()
    if (e.shiftKey && lastClickedRef.current != null) {
      const ids = filteredProducts.map(p => p.id)
      const a = ids.indexOf(lastClickedRef.current)
      const b = ids.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(prev => {
        const s = new Set(prev)
        ids.slice(lo, hi + 1).forEach(rid => s.add(rid))
        return s
      })
    } else if (e.ctrlKey || e.metaKey) {
      toggle(id)
      lastClickedRef.current = id
    } else {
      if (selected.has(id)) {
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
      } else {
        setSelected(new Set([id]))
      }
      lastClickedRef.current = id
    }
  }

  async function handleImport() {
    const toUpload = (products || []).filter(p => selected.has(p.id))
    if (!toUpload.length) return

    cancelledRef.current = false
    setResults(null)

    // Pre-fetch target's complete SKU→id and name→id maps so dedup is reliable
    let skuMap = {}, nameMap = {}
    setProgress({ current: 0, total: 0, name: 'Fetching target product list…' })
    try {
      const mapData = await fetchWCSkuMap(target)
      skuMap  = mapData.sku_map  || {}
      nameMap = mapData.name_map || {}
    } catch { /* proceed — backend will fall back to per-product search */ }

    // Build filename→id map from target site's existing media
    let media_map = {}
    let mediaMapFailed = false
    setProgress({ current: 0, total: 0, name: 'Fetching target media…' })
    try {
      const mediaResp = await fetch('/api/media/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: target }),
      })
      if (mediaResp.ok) {
        const mediaData = await mediaResp.json()
        media_map = Object.fromEntries(
          (mediaData.items || []).map(item => [item.filename, item.id])
        )
      } else {
        mediaMapFailed = true
      }
    } catch { mediaMapFailed = true }
    if (mediaMapFailed) {
      toast.error('Could not fetch target media library — images will be skipped to prevent duplicates', { duration: 8000 })
    }

    const CONCURRENCY = 5
    const allResults = new Array(toUpload.length)
    let completed = 0
    const queue = toUpload.map((product, idx) => ({ product, idx }))
    let qi = 0

    async function worker() {
      while (true) {
        if (cancelledRef.current) break
        const item = queue[qi++]
        if (!item) break
        const { product, idx } = item
        const existingId = (product.sku && skuMap[product.sku]) || nameMap[product.name] || null
        try {
          allResults[idx] = await importWCProductOne(target, product, overwrite, media_map, [...includeFields], existingId)
        } catch (err) {
          allResults[idx] = { name: product.name, sku: product.sku, status: 'error', error: err.response?.data?.detail ?? 'Failed' }
        }
        completed++
        setProgress({ current: completed, total: toUpload.length, name: product.name })
        setResults(allResults.filter(Boolean))
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    setProgress(null)
    const created = allResults.filter(r => r.status === 'created').length
    const updated = allResults.filter(r => r.status === 'updated').length
    const skipped = allResults.filter(r => r.status === 'skipped').length
    const errors  = allResults.filter(r => r.status === 'error').length
    const parts = []
    if (created) parts.push(`${created} created`)
    if (updated) parts.push(`${updated} updated`)
    if (skipped) parts.push(`${skipped} skipped`)
    if (errors)  parts.push(`${errors} failed`)
    errors === 0 ? toast.success(parts.join(', ') || 'Nothing to do') : toast.error(parts.join(', '))
  }

  return (
    <>
      {progress && (
        <ProgressOverlay
          title={loading ? 'Loading products…' : 'Importing products…'}
          subtitle={progress.name}
          current={progress.current}
          total={progress.total}
          onCancel={loading ? undefined : () => { cancelledRef.current = true }}
        />
      )}

      {/* Step 0 — Taxonomy */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 0 — Sync taxonomy</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Copy global attributes, attribute terms, shipping classes, categories and tags from{' '}
              <span className="font-medium text-gray-700">{sourceLabel}</span> to{' '}
              <span className="font-medium text-gray-700">{targetLabel}</span> before importing products.
            </p>
          </div>
          <button type="button" onClick={handleSyncTaxonomy} disabled={isWorking || taxoLoading || disabled}
            className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {taxoLoading ? 'Syncing…' : 'Sync taxonomy'}
          </button>
        </div>

        {taxoResult && (() => {
          const sections = [
            { key: 'attributes',      label: 'Attributes' },
            { key: 'shipping_classes', label: 'Shipping classes' },
            { key: 'categories',      label: 'Categories' },
            { key: 'tags',            label: 'Tags' },
          ]
          return (
            <div className="grid grid-cols-2 gap-3">
              {sections.map(({ key, label }) => {
                const items = taxoResult[key] || []
                const created = items.filter(i => i.status === 'created').length
                const errors  = items.filter(i => i.status?.startsWith('error')).length
                return (
                  <div key={key} className="border border-gray-100 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-medium text-gray-700">{label} — {items.length} total</p>
                    <div className="flex gap-3 text-xs">
                      {created > 0 && <span className="text-green-600">{created} created</span>}
                      {(items.length - created - errors) > 0 && <span className="text-gray-400">{items.length - created - errors} already existed</span>}
                      {errors > 0   && <span className="text-red-600">{errors} failed</span>}
                      {items.length === 0 && <span className="text-gray-400">none found</span>}
                    </div>
                    {errors > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {items.filter(i => i.status?.startsWith('error')).map((i, idx) => (
                          <p key={idx} className="text-xs text-red-600 font-mono truncate">{i.name}: {i.status}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </section>

      {/* Step 1 — Load */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load products</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch all products from <span className="font-medium text-gray-700">{sourceLabel}</span></p>
          </div>
          <button type="button" onClick={handleLoad} disabled={isWorking || disabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Loading…' : 'Load products'}
          </button>
        </div>

        {products && (
          <div className="space-y-2">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search name or SKU…"
                value={filter.search}
                onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">All types</option>
                <option value="simple">Simple</option>
                <option value="variable">Variable</option>
                <option value="grouped">Grouped</option>
                <option value="external">External</option>
              </select>
              <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">All statuses</option>
                <option value="publish">Published</option>
                <option value="draft">Draft</option>
                <option value="private">Private</option>
              </select>
            </div>

            {/* Count + bulk actions */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {filteredProducts.length < products.length
                  ? <>{filteredProducts.length} shown · </>
                  : <>{products.length} products · </>}
                <span className="font-medium text-gray-700">{selected.size} selected</span>
              </span>
              <div className="flex gap-3">
                <button type="button" onClick={selectAll}          className="text-xs text-blue-600 hover:text-blue-800">All</button>
                <button type="button" onClick={selectNone}         className="text-xs text-blue-600 hover:text-blue-800">None</button>
                {filteredProducts.length < products.length && <>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={selectFiltered}   className="text-xs text-blue-600 hover:text-blue-800">+ Filtered</button>
                  <button type="button" onClick={deselectFiltered} className="text-xs text-blue-600 hover:text-blue-800">− Filtered</button>
                </>}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 select-none">
              {filteredProducts.map(product => {
                const isSelected = selected.has(product.id)
                const thumb = product.images?.[0]?.src
                return (
                  <div
                    key={product.id}
                    onClick={e => handleRowClick(e, product.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input type="checkbox" checked={isSelected} readOnly
                      className="rounded border-gray-300 text-blue-600 shrink-0 pointer-events-none" />
                    {thumb
                      ? <img src={thumb} alt="" className="w-10 h-10 object-cover rounded shrink-0 bg-gray-100" />
                      : <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0 text-[10px] text-gray-400">IMG</div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{product.name}</p>
                      <p className="text-xs text-gray-400">
                        {product.sku && <span className="font-mono">{product.sku} · </span>}
                        {product.type}
                        {product.type === 'variable' && product._variations?.length ? ` (${product._variations.length} vars)` : ''}
                        {product.regular_price ? ` · €${product.regular_price}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      product.status === 'publish' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>{product.status}</span>
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No products match the filter.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Import */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!products ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Push to <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing products overwritten' : ' — existing SKUs/names skipped'}
              . Images matched from uploaded media.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button type="button" onClick={handleImport} disabled={selected.size === 0 || isWorking || disabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {selected.size > 0 ? `${selected.size} product${selected.size !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>

        {/* Field toggles */}
        <div className="border border-gray-100 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fields to import</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIncludeFields(new Set(FIELD_GROUPS.map(g => g.key)))}
                className="text-xs text-blue-600 hover:text-blue-800">All</button>
              <button type="button" onClick={() => setIncludeFields(new Set())}
                className="text-xs text-blue-600 hover:text-blue-800">None</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FIELD_GROUPS.map(({ key, label, desc }) => (
              <label key={key} title={desc}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none hover:text-gray-900">
                <input
                  type="checkbox"
                  checked={includeFields.has(key)}
                  onChange={() => toggleField(key)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm font-medium">
              {results.filter(r => r.status === 'created').length > 0 && <span className="text-green-600">{results.filter(r => r.status === 'created').length} created</span>}
              {results.filter(r => r.status === 'updated').length > 0 && <span className="text-blue-600">{results.filter(r => r.status === 'updated').length} updated</span>}
              {results.filter(r => r.status === 'skipped').length > 0 && <span className="text-yellow-600">{results.filter(r => r.status === 'skipped').length} skipped</span>}
              {results.filter(r => r.status === 'error').length  > 0 && <span className="text-red-600">{results.filter(r => r.status === 'error').length} failed</span>}
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {results.map((r, i) => {
                const cfg = PRODUCT_STATUS[r.status] ?? PRODUCT_STATUS.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2.5 ${cfg.bg}`}>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{r.name}</p>
                      {r.sku && <p className="text-xs text-gray-400 font-mono">{r.sku}{r.id ? ` · ID #${r.id}` : ''}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                      {r.warnings?.map((w, wi) => <p key={wi} className="text-xs text-yellow-700 mt-0.5">{w}</p>)}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// ── Coupons tab ───────────────────────────────────────────────────────────────

function CouponsTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [coupons, setCoupons]       = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [overwrite, setOverwrite]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(null)
  const [results, setResults]       = useState(null)
  const [search, setSearch]         = useState('')
  const lastClickedRef              = useRef(null)
  const cancelledRef                = useRef(false)

  const isWorking = loading || !!progress

  async function handleLoad() {
    setLoading(true)
    setCoupons(null); setSelected(new Set()); setResults(null)
    try {
      const data = await exportWCCoupons(source, search)
      setCoupons(data.coupons)
      setSelected(new Set(data.coupons.map(c => c.id)))
      toast.success(`Loaded ${data.coupons.length} coupons`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load coupons')
    } finally { setLoading(false) }
  }

  function toggle(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const selectAll  = () => setSelected(new Set((coupons || []).map(c => c.id)))
  const selectNone = () => setSelected(new Set())

  function handleRowClick(e, id) {
    e.preventDefault()
    if (e.shiftKey && lastClickedRef.current != null) {
      const ids = (coupons || []).map(c => c.id)
      const a = ids.indexOf(lastClickedRef.current), b = ids.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(prev => { const s = new Set(prev); ids.slice(lo, hi + 1).forEach(id => s.add(id)); return s })
    } else if (e.ctrlKey || e.metaKey) {
      toggle(id); lastClickedRef.current = id
    } else {
      setSelected(prev => { const s = new Set(prev); selected.has(id) ? s.delete(id) : s.clear() || s.add(id); return s })
      lastClickedRef.current = id
    }
  }

  async function handleImport() {
    const toImport = (coupons || []).filter(c => selected.has(c.id))
    if (!toImport.length) return
    cancelledRef.current = false; setResults(null)

    setProgress({ current: 0, total: 0, name: 'Fetching target coupon list…' })
    let codeMap = {}
    try {
      const mapData = await fetchWCCouponCodeMap(target)
      codeMap = mapData.map || {}
    } catch { /* proceed without map */ }

    const allResults = []
    for (let i = 0; i < toImport.length; i++) {
      if (cancelledRef.current) break
      const coupon = toImport[i]
      setProgress({ current: i + 1, total: toImport.length, name: coupon.code })
      const existingId = codeMap[coupon.code] || null
      if (existingId && !overwrite) {
        allResults.push({ code: coupon.code, status: 'skipped', id: existingId })
        setResults([...allResults]); continue
      }
      let entry
      try { entry = await importWCCoupon(target, coupon, overwrite, existingId) }
      catch (err) { entry = { code: coupon.code, status: 'error', error: err.response?.data?.detail ?? 'Failed' } }
      allResults.push(entry); setResults([...allResults])
    }

    setProgress(null)
    const created = allResults.filter(r => r.status === 'created').length
    const updated = allResults.filter(r => r.status === 'updated').length
    const skipped = allResults.filter(r => r.status === 'skipped').length
    const errors  = allResults.filter(r => r.status === 'error').length
    const parts = []
    if (created) parts.push(`${created} created`)
    if (updated) parts.push(`${updated} updated`)
    if (skipped) parts.push(`${skipped} skipped`)
    if (errors)  parts.push(`${errors} failed`)
    errors === 0 ? toast.success(parts.join(', ') || 'Nothing to do') : toast.error(parts.join(', '))
  }

  const DISCOUNT_LABELS = { percent: '%', fixed_cart: 'fixed', fixed_product: 'prod' }

  return (
    <>
      {progress && (
        <ProgressOverlay
          title={loading ? 'Loading coupons…' : 'Importing coupons…'}
          subtitle={progress.name}
          current={progress.current}
          total={progress.total}
          onCancel={loading ? undefined : () => { cancelledRef.current = true }}
        />
      )}

      {/* Step 1 — Load */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load coupons</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch coupons from <span className="font-medium text-gray-700">{sourceLabel}</span></p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Search</label>
              <input type="text" placeholder="Code or description…" value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoad()}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-48" />
            </div>
            <button type="button" onClick={handleLoad} disabled={isWorking || disabled}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>

        {coupons && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <SelectAllCheckbox
                ids={(coupons || []).map(c => c.id)}
                selected={selected}
                onSelectAll={selectAll}
                onSelectNone={selectNone}
              />
              {coupons.length} coupons ·{' '}
              <span className="font-medium text-gray-700">{selected.size} selected</span>
            </label>
            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 select-none">
              {coupons.map(c => {
                const isSelected = selected.has(c.id)
                const expires = c.date_expires ? new Date(c.date_expires).toLocaleDateString() : '∞'
                const typeLabel = DISCOUNT_LABELS[c.discount_type] ?? c.discount_type
                return (
                  <div key={c.id} onClick={e => handleRowClick(e, c.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={isSelected} readOnly
                      className="rounded border-gray-300 text-blue-600 shrink-0 pointer-events-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-medium text-gray-900">{c.code}</p>
                      <p className="text-xs text-gray-400">{c.description || '—'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-gray-700">
                      {c.amount}{typeLabel === '%' ? '%' : ` €`}
                    </span>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{typeLabel}</span>
                    <span className="shrink-0 text-xs text-gray-400">{expires}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — Import */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!coupons ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Push to <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing codes overwritten' : ' — existing codes skipped'}.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button type="button" onClick={handleImport} disabled={selected.size === 0 || isWorking || disabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {selected.size > 0 ? `${selected.size} coupon${selected.size !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm font-medium">
              {results.filter(r => r.status === 'created').length > 0 && <span className="text-green-600">{results.filter(r => r.status === 'created').length} created</span>}
              {results.filter(r => r.status === 'updated').length > 0 && <span className="text-blue-600">{results.filter(r => r.status === 'updated').length} updated</span>}
              {results.filter(r => r.status === 'skipped').length > 0 && <span className="text-yellow-600">{results.filter(r => r.status === 'skipped').length} skipped</span>}
              {results.filter(r => r.status === 'error').length  > 0 && <span className="text-red-600">{results.filter(r => r.status === 'error').length} failed</span>}
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {results.map((r, i) => {
                const cfg = IMPORT_STATUS[r.status] ?? IMPORT_STATUS.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2 ${cfg.bg}`}>
                    <div>
                      <p className="text-sm font-mono text-gray-800">{r.code}</p>
                      {r.id && <p className="text-xs text-gray-400">ID #{r.id}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// ── Orders tab ────────────────────────────────────────────────────────────────

const ORDER_STATUS_COLORS = {
  pending:    'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  on_hold:    'bg-orange-100 text-orange-700',
  completed:  'bg-green-100 text-green-700',
  cancelled:  'bg-gray-100 text-gray-600',
  refunded:   'bg-purple-100 text-purple-700',
  failed:     'bg-red-100 text-red-700',
}

const IMPORT_STATUS = {
  created: { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Created' },
  updated: { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'Updated' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped' },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'   },
}

function OrdersTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [orders, setOrders]         = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [overwrite, setOverwrite]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(null)
  const [results, setResults]       = useState(null)
  const [filter, setFilter]         = useState({ status: 'any', after: '', before: '' })
  const lastClickedRef              = useRef(null)
  const cancelledRef                = useRef(false)

  const isWorking = loading || !!progress

  async function handleLoad() {
    setLoading(true)
    setOrders(null); setSelected(new Set()); setResults(null)
    const all = []
    try {
      let page = 1, totalPages = 1
      do {
        setProgress({ current: all.length, total: 0, name: 'Loading orders…' })
        const data = await exportWCOrders(source, page, 100, filter.status, filter.after, filter.before)
        all.push(...data.orders)
        totalPages = data.total_pages
        page++
      } while (page <= totalPages)
      setOrders(all)
      setSelected(new Set(all.map(o => o.id)))
      toast.success(`Loaded ${all.length} orders`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load orders')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  function toggle(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const selectAll  = () => setSelected(new Set((orders || []).map(o => o.id)))
  const selectNone = () => setSelected(new Set())

  function handleRowClick(e, id) {
    e.preventDefault()
    if (e.shiftKey && lastClickedRef.current != null) {
      const ids = (orders || []).map(o => o.id)
      const a = ids.indexOf(lastClickedRef.current)
      const b = ids.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(prev => {
        const s = new Set(prev)
        ids.slice(lo, hi + 1).forEach(rid => s.add(rid))
        return s
      })
    } else if (e.ctrlKey || e.metaKey) {
      toggle(id); lastClickedRef.current = id
    } else {
      if (selected.has(id)) {
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
      } else {
        setSelected(new Set([id]))
      }
      lastClickedRef.current = id
    }
  }

  async function handleImport() {
    const toImport = (orders || []).filter(o => selected.has(o.id))
    if (!toImport.length) return

    cancelledRef.current = false
    setResults(null)

    setProgress({ current: 0, total: 0, name: 'Fetching target order list…' })
    let idMap = {}, skuMap = {}, nameMap = {}
    try {
      const [orderMapData, skuMapData] = await Promise.all([
        fetchWCOrderIdMap(target),
        fetchWCSkuMap(target),
      ])
      idMap   = orderMapData.map  || {}
      skuMap  = skuMapData.sku_map  || {}
      nameMap = skuMapData.name_map || {}
    } catch { /* proceed without maps */ }

    const allResults = []
    for (let i = 0; i < toImport.length; i++) {
      if (cancelledRef.current) break
      const order = toImport[i]
      const srcId = String(order.id)
      setProgress({ current: i + 1, total: toImport.length, name: `Order #${order.number}` })

      // If already exists on target and overwrite=false, skip without API call
      const existingId = idMap[srcId] || null

      if (existingId && !overwrite) {
        allResults.push({ order_number: order.number, status: 'skipped', id: existingId })
        setResults([...allResults])
        continue
      }

      let entry
      try {
        entry = await importWCOrder(target, order, overwrite, existingId, skuMap, nameMap)
      } catch (err) {
        entry = { order_number: order.number, status: 'error', error: err.response?.data?.detail ?? 'Failed' }
      }
      allResults.push(entry)
      setResults([...allResults])
    }

    setProgress(null)
    const created = allResults.filter(r => r.status === 'created').length
    const updated = allResults.filter(r => r.status === 'updated').length
    const skipped = allResults.filter(r => r.status === 'skipped').length
    const errors  = allResults.filter(r => r.status === 'error').length
    const parts = []
    if (created) parts.push(`${created} created`)
    if (updated) parts.push(`${updated} updated`)
    if (skipped) parts.push(`${skipped} skipped`)
    if (errors)  parts.push(`${errors} failed`)
    errors === 0 ? toast.success(parts.join(', ') || 'Nothing to do') : toast.error(parts.join(', '))
  }

  return (
    <>
      {progress && (
        <ProgressOverlay
          title={loading ? 'Loading orders…' : 'Importing orders…'}
          subtitle={progress.name}
          current={progress.current}
          total={progress.total}
          onCancel={loading ? undefined : () => { cancelledRef.current = true }}
        />
      )}

      {/* Step 1 — Load */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load orders</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch orders from <span className="font-medium text-gray-700">{sourceLabel}</span></p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Status</label>
              <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="any">Any</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">After</label>
              <input type="date" value={filter.after} onChange={e => setFilter(f => ({ ...f, after: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Before</label>
              <input type="date" value={filter.before} onChange={e => setFilter(f => ({ ...f, before: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <button type="button" onClick={handleLoad} disabled={isWorking || disabled}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>

        {orders && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <SelectAllCheckbox
                ids={(orders || []).map(o => o.id)}
                selected={selected}
                onSelectAll={selectAll}
                onSelectNone={selectNone}
              />
              {orders.length} orders ·{' '}
              <span className="font-medium text-gray-700">{selected.size} selected</span>
            </label>

            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 select-none">
              {orders.map(order => {
                const isSelected = selected.has(order.id)
                const billing = order.billing || {}
                const name = [billing.first_name, billing.last_name].filter(Boolean).join(' ') || billing.email || '—'
                const statusColor = ORDER_STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'
                const dateStr = order.date_created ? new Date(order.date_created).toLocaleDateString() : ''
                return (
                  <div
                    key={order.id}
                    onClick={e => handleRowClick(e, order.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input type="checkbox" checked={isSelected} readOnly
                      className="rounded border-gray-300 text-blue-600 shrink-0 pointer-events-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">#{order.number}</span>
                        <span className="text-gray-400 text-xs ml-2">{dateStr}</span>
                      </p>
                      <p className="text-xs text-gray-500 truncate">{name}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-700 shrink-0">{order.currency_symbol || '€'}{order.total}</p>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{order.status}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — Import */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!orders ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Push to <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing orders overwritten' : ' — already-imported orders skipped'}.
              Line items are preserved; product links are by name.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button type="button" onClick={handleImport} disabled={selected.size === 0 || isWorking || disabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {selected.size > 0 ? `${selected.size} order${selected.size !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm font-medium">
              {results.filter(r => r.status === 'created').length > 0 && <span className="text-green-600">{results.filter(r => r.status === 'created').length} created</span>}
              {results.filter(r => r.status === 'updated').length > 0 && <span className="text-blue-600">{results.filter(r => r.status === 'updated').length} updated</span>}
              {results.filter(r => r.status === 'skipped').length > 0 && <span className="text-yellow-600">{results.filter(r => r.status === 'skipped').length} skipped</span>}
              {results.filter(r => r.status === 'error').length  > 0 && <span className="text-red-600">{results.filter(r => r.status === 'error').length} failed</span>}
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {results.map((r, i) => {
                const cfg = IMPORT_STATUS[r.status] ?? IMPORT_STATUS.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2 ${cfg.bg}`}>
                    <div>
                      <p className="text-sm text-gray-800">Order #{r.order_number}</p>
                      {r.id && <p className="text-xs text-gray-400">Target ID #{r.id}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// ── Users/Customers tab ────────────────────────────────────────────────────────

function UsersTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [customers, setCustomers]   = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [overwrite, setOverwrite]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(null)
  const [results, setResults]       = useState(null)
  const [filter, setFilter]         = useState({ search: '', role: 'all' })
  const lastClickedRef              = useRef(null)
  const cancelledRef                = useRef(false)

  const isWorking = loading || !!progress

  async function handleLoad() {
    setLoading(true)
    setCustomers(null); setSelected(new Set()); setResults(null)
    const all = []
    try {
      if (filter.role === 'all') {
        // Backend handles all roles in one shot
        setProgress({ current: 0, total: 0, name: 'Loading all users…' })
        const data = await exportWCCustomers(source, 1, 100, filter.search, 'all')
        all.push(...data.customers)
      } else {
        let page = 1, totalPages = 1
        do {
          setProgress({ current: all.length, total: 0, name: 'Loading users…' })
          const data = await exportWCCustomers(source, page, 100, filter.search, filter.role)
          all.push(...data.customers)
          totalPages = data.total_pages
          page++
        } while (page <= totalPages)
      }
      setCustomers(all)
      setSelected(new Set(all.map(c => c.id)))
      toast.success(`Loaded ${all.length} customers`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load customers')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  function toggle(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const selectAll  = () => setSelected(new Set((customers || []).map(c => c.id)))
  const selectNone = () => setSelected(new Set())

  function handleRowClick(e, id) {
    e.preventDefault()
    if (e.shiftKey && lastClickedRef.current != null) {
      const ids = (customers || []).map(c => c.id)
      const a = ids.indexOf(lastClickedRef.current)
      const b = ids.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(prev => {
        const s = new Set(prev)
        ids.slice(lo, hi + 1).forEach(rid => s.add(rid))
        return s
      })
    } else if (e.ctrlKey || e.metaKey) {
      toggle(id); lastClickedRef.current = id
    } else {
      if (selected.has(id)) {
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
      } else {
        setSelected(new Set([id]))
      }
      lastClickedRef.current = id
    }
  }

  async function handleImport() {
    const toImport = (customers || []).filter(c => selected.has(c.id))
    if (!toImport.length) return

    cancelledRef.current = false
    setResults(null)

    setProgress({ current: 0, total: 0, name: 'Fetching target user list…' })
    let emailMap = {}
    try {
      const mapData = await fetchWCCustomerEmailMap(target)
      emailMap = mapData.map || {}
    } catch { /* proceed without map */ }

    const allResults = []
    for (let i = 0; i < toImport.length; i++) {
      if (cancelledRef.current) break
      const customer = toImport[i]
      const email = customer.email || ''
      setProgress({ current: i + 1, total: toImport.length, name: email })

      if (emailMap[email] && !overwrite) {
        allResults.push({ email, status: 'skipped', id: emailMap[email] })
        setResults([...allResults])
        continue
      }

      let entry
      try {
        entry = await importWCCustomer(target, customer, overwrite)
      } catch (err) {
        entry = { email, status: 'error', error: err.response?.data?.detail ?? 'Failed' }
      }
      allResults.push(entry)
      setResults([...allResults])
    }

    setProgress(null)
    const created = allResults.filter(r => r.status === 'created').length
    const updated = allResults.filter(r => r.status === 'updated').length
    const skipped = allResults.filter(r => r.status === 'skipped').length
    const errors  = allResults.filter(r => r.status === 'error').length
    const parts = []
    if (created) parts.push(`${created} created`)
    if (updated) parts.push(`${updated} updated`)
    if (skipped) parts.push(`${skipped} skipped`)
    if (errors)  parts.push(`${errors} failed`)
    if (created) parts.push('(new customers need password reset)')
    errors === 0 ? toast.success(parts.join(' · ') || 'Nothing to do') : toast.error(parts.join(' · '))
  }

  return (
    <>
      {progress && (
        <ProgressOverlay
          title={loading ? 'Loading users…' : 'Importing users…'}
          subtitle={progress.name}
          current={progress.current}
          total={progress.total}
          onCancel={loading ? undefined : () => { cancelledRef.current = true }}
        />
      )}

      {/* Step 1 — Load */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load customers</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch customers from <span className="font-medium text-gray-700">{sourceLabel}</span></p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Role</label>
              <select value={filter.role} onChange={e => setFilter(f => ({ ...f, role: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="all">All roles</option>
                <option value="customer">Customer</option>
                <option value="subscriber">Subscriber</option>
                <option value="administrator">Administrator</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Search</label>
              <input type="text" placeholder="Name or email…" value={filter.search}
                onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-44" />
            </div>
            <button type="button" onClick={handleLoad} disabled={isWorking || disabled}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>

        {customers && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <SelectAllCheckbox
                ids={(customers || []).map(c => c.id)}
                selected={selected}
                onSelectAll={selectAll}
                onSelectNone={selectNone}
              />
              {customers.length} customers ·{' '}
              <span className="font-medium text-gray-700">{selected.size} selected</span>
            </label>

            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 select-none">
              {customers.map(c => {
                const isSelected = selected.has(c.id)
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || '—'
                return (
                  <div
                    key={c.id}
                    onClick={e => handleRowClick(e, c.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input type="checkbox" checked={isSelected} readOnly
                      className="rounded border-gray-300 text-blue-600 shrink-0 pointer-events-none" />
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-xs font-medium text-gray-500">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">{c.role}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — Import */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!customers ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Push to <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing accounts updated' : ' — existing emails skipped'}.
              New accounts get a random password — send them a reset link.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button type="button" onClick={handleImport} disabled={selected.size === 0 || isWorking || disabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {selected.size > 0 ? `${selected.size} customer${selected.size !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm font-medium">
              {results.filter(r => r.status === 'created').length > 0 && <span className="text-green-600">{results.filter(r => r.status === 'created').length} created</span>}
              {results.filter(r => r.status === 'updated').length > 0 && <span className="text-blue-600">{results.filter(r => r.status === 'updated').length} updated</span>}
              {results.filter(r => r.status === 'skipped').length > 0 && <span className="text-yellow-600">{results.filter(r => r.status === 'skipped').length} skipped</span>}
              {results.filter(r => r.status === 'error').length  > 0 && <span className="text-red-600">{results.filter(r => r.status === 'error').length} failed</span>}
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {results.map((r, i) => {
                const cfg = IMPORT_STATUS[r.status] ?? IMPORT_STATUS.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2 ${cfg.bg}`}>
                    <div>
                      <p className="text-sm text-gray-800">{r.email}</p>
                      {r.id && <p className="text-xs text-gray-400">ID #{r.id}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// ── Tax tab ────────────────────────────────────────────────────────────────────

function TaxTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [selClasses, setSelCls]   = useState(new Set())
  const [selRates, setSelRates]   = useState(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const [progress, setProgress]   = useState(null)
  const [results, setResults]     = useState(null)
  const cancelledRef              = useRef(false)
  const isWorking = loading || !!progress

  async function handleLoad() {
    setLoading(true); setData(null); setResults(null)
    try {
      const d = await exportWCTaxes(source)
      setData(d)
      setSelCls(new Set(d.classes.map(c => c.slug)))
      setSelRates(new Set(d.rates.map((_, i) => i)))
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load tax data')
    } finally { setLoading(false) }
  }

  async function handleImport() {
    if (!data) return
    cancelledRef.current = false
    setResults(null)

    const classesToImport = data.classes.filter(c => selClasses.has(c.slug))
    const ratesToImport   = data.rates.filter((_, i) => selRates.has(i))
    const total           = (classesToImport.length ? 1 : 0) + ratesToImport.length

    let done = 0
    const allClasses = [], allRates = []

    // classes in one call
    if (classesToImport.length && !cancelledRef.current) {
      setProgress({ current: ++done, total, name: 'Tax classes' })
      try {
        const r = await importWCTaxes(target, classesToImport, [], overwrite)
        allClasses.push(...(r.classes || []))
      } catch (err) {
        toast.error('Classes import failed')
      }
    }

    // rates one-by-one for progress
    for (let i = 0; i < ratesToImport.length; i++) {
      if (cancelledRef.current) break
      const rate = ratesToImport[i]
      setProgress({ current: ++done, total, name: rate.name || `Rate ${i + 1}` })
      try {
        const r = await importWCTaxes(target, [], [rate], overwrite)
        allRates.push(...(r.rates || []))
      } catch { allRates.push({ name: rate.name, status: 'error', error: 'Failed' }) }
    }

    setProgress(null)
    setResults({ classes: allClasses, rates: allRates })
    const errors = [...allClasses, ...allRates].filter(r => r.status === 'error').length
    if (errors) toast.error(`Done with ${errors} error(s)`)
    else toast.success('Tax data imported')
  }

  const IMPORT_STATUS_CFG = {
    created: 'bg-green-100 text-green-700',
    updated: 'bg-blue-100 text-blue-700',
    skipped: 'bg-yellow-100 text-yellow-700',
    error:   'bg-red-100 text-red-700',
  }

  return (
    <>
      {progress && (
        <ProgressOverlay title={`Importing to ${targetLabel}…`}
          subtitle={progress.name} current={progress.current} total={progress.total}
          onCancel={() => { cancelledRef.current = true }} />
      )}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load tax data</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch tax classes and rates from <span className="font-medium text-gray-700">{sourceLabel}</span>.</p>
          </div>
          <button onClick={handleLoad} disabled={disabled || isWorking}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {data && (
          <div className="space-y-4">
            {/* Classes */}
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700">Tax Classes</span>
                <span>({data.classes.length})</span>
                <button onClick={() => setSelCls(new Set(data.classes.map(c => c.slug)))} className="text-blue-600 hover:underline">All</button>
                <button onClick={() => setSelCls(new Set())} className="text-blue-600 hover:underline">None</button>
              </div>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                {data.classes.map(c => (
                  <div key={c.slug} onClick={() => setSelCls(s => { const n = new Set(s); n.has(c.slug) ? n.delete(c.slug) : n.add(c.slug); return n })}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm transition-colors ${selClasses.has(c.slug) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" readOnly checked={selClasses.has(c.slug)} className="pointer-events-none accent-blue-600" />
                    <span className="font-medium text-gray-800">{c.name}</span>
                    <span className="text-gray-400 font-mono text-xs ml-auto">{c.slug}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Rates */}
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700">Tax Rates</span>
                <span>({data.rates.length})</span>
                <button onClick={() => setSelRates(new Set(data.rates.map((_, i) => i)))} className="text-blue-600 hover:underline">All</button>
                <button onClick={() => setSelRates(new Set())} className="text-blue-600 hover:underline">None</button>
              </div>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {data.rates.map((r, i) => (
                  <div key={i} onClick={() => setSelRates(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-sm transition-colors ${selRates.has(i) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" readOnly checked={selRates.has(i)} className="pointer-events-none accent-blue-600" />
                    <span className="flex-1 text-gray-800">{r.name || '—'}</span>
                    <span className="text-gray-500 font-mono text-xs">{r.rate}%</span>
                    <span className="text-gray-400 text-xs">{[r.country, r.state].filter(Boolean).join('-') || 'All'}</span>
                    <span className="text-gray-400 text-xs">{r.class || 'standard'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!data ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">Push to <span className="font-medium text-gray-700">{targetLabel}</span>.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button onClick={handleImport} disabled={disabled || isWorking || !data || (!selClasses.size && !selRates.size)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {selClasses.size + selRates.size} item{selClasses.size + selRates.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
        {results && (
          <div className="space-y-3">
            {[...results.classes.map(r => ({...r, label: r.slug})), ...results.rates.map(r => ({...r, label: r.name}))].map((r, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg px-4 py-2 ${IMPORT_STATUS[r.status]?.bg ?? 'bg-gray-50'}`}>
                <p className="text-sm text-gray-800">{r.label}</p>
                <div className="flex items-center gap-2">
                  {r.error && <p className="text-xs text-red-600">{r.error}</p>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${IMPORT_STATUS_CFG[r.status] ?? ''}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// ── Shipping tab ───────────────────────────────────────────────────────────────

function ShippingTab({ source, target, sourceLabel, targetLabel, disabled }) {
  const [zones, setZones]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const [selected, setSelected]   = useState(new Set())
  const [expanded, setExpanded]   = useState({})
  const [overwrite, setOverwrite] = useState(false)
  const [progress, setProgress]   = useState(null)
  const [results, setResults]     = useState(null)
  const cancelledRef              = useRef(false)
  const isWorking = loading || !!progress

  async function handleLoad() {
    setLoading(true); setZones(null); setResults(null)
    try {
      const d = await exportWCShipping(source)
      setZones(d.zones)
      setSelected(new Set(d.zones.map(z => z.id)))
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load shipping data')
    } finally { setLoading(false) }
  }

  async function handleImport() {
    const toImport = (zones || []).filter(z => selected.has(z.id))
    if (!toImport.length) return
    cancelledRef.current = false
    setResults(null)
    const allResults = []
    for (let i = 0; i < toImport.length; i++) {
      if (cancelledRef.current) break
      const zone = toImport[i]
      setProgress({ current: i + 1, total: toImport.length, name: zone.name })
      try {
        const d = await importWCShipping(target, [zone], overwrite)
        allResults.push(...(d.results || []))
      } catch (err) {
        allResults.push({ name: zone.name, status: 'error', error: err.response?.data?.detail ?? 'Failed' })
      }
    }
    setProgress(null)
    setResults(allResults)
    const errors = allResults.filter(r => r.status === 'error').length
    if (errors) toast.error(`Done with ${errors} error(s)`)
    else toast.success('Shipping imported')
  }

  return (
    <>
      {progress && (
        <ProgressOverlay title={`Importing to ${targetLabel}…`}
          subtitle={progress.name} current={progress.current} total={progress.total}
          onCancel={() => { cancelledRef.current = true }} />
      )}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load shipping zones</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch zones, methods and rates from <span className="font-medium text-gray-700">{sourceLabel}</span>.</p>
          </div>
          <button onClick={handleLoad} disabled={disabled || isWorking}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {zones && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{zones.length} zones · <span className="font-medium text-gray-700">{selected.size} selected</span></span>
              <button onClick={() => setSelected(new Set(zones.map(z => z.id)))} className="text-blue-600 hover:underline">All</button>
              <button onClick={() => setSelected(new Set())} className="text-blue-600 hover:underline">None</button>
            </div>
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {zones.map(z => (
                <div key={z.id}>
                  <div onClick={() => setSelected(s => { const n = new Set(s); n.has(z.id) ? n.delete(z.id) : n.add(z.id); return n })}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selected.has(z.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" readOnly checked={selected.has(z.id)} className="pointer-events-none accent-blue-600" />
                    <span className="text-sm font-medium text-gray-800 flex-1">{z.name || 'Rest of World'}</span>
                    <span className="text-xs text-gray-400">{z.methods.length} method{z.methods.length !== 1 ? 's' : ''}</span>
                    {z.locations.length > 0 && <span className="text-xs text-gray-400">{z.locations.length} location{z.locations.length !== 1 ? 's' : ''}</span>}
                    <button onClick={e => { e.stopPropagation(); setExpanded(ex => ({ ...ex, [z.id]: !ex[z.id] })) }}
                      className="text-gray-400 hover:text-gray-600 text-xs ml-1">
                      {expanded[z.id] ? '▲' : '▼'}
                    </button>
                  </div>
                  {expanded[z.id] && (
                    <div className="bg-gray-50 border-t border-gray-100 px-6 py-3 space-y-2">
                      {z.methods.map((m, mi) => (
                        <div key={mi} className="text-xs text-gray-600 flex gap-3">
                          <span className="font-mono bg-gray-200 rounded px-1.5 py-0.5">{m.method_id}</span>
                          <span>{m.title}</span>
                          {m.settings?.cost !== undefined && <span className="text-gray-400">cost: {m.settings.cost}</span>}
                          {!m.enabled && <span className="text-yellow-600">disabled</span>}
                        </div>
                      ))}
                      {z.locations.length > 0 && (
                        <p className="text-xs text-gray-400">{z.locations.map(l => l.code).join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!zones ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">Push {selected.size} zone{selected.size !== 1 ? 's' : ''} to <span className="font-medium text-gray-700">{targetLabel}</span>.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <OverwriteToggle checked={overwrite} onChange={setOverwrite} />
            <button onClick={handleImport} disabled={disabled || isWorking || !zones || !selected.size}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Import {selected.size > 0 ? `${selected.size} zone${selected.size !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
        {results && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {results.map((r, i) => {
              const cfg = IMPORT_STATUS[r.status] ?? IMPORT_STATUS.error
              return (
                <div key={i} className={`rounded-lg px-4 py-2.5 ${cfg.bg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">{r.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                  {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                  {r.methods?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.methods.map((m, mi) => (
                        <span key={mi} className={`text-xs px-1.5 py-0.5 rounded font-mono ${m.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                          {m.method_id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}

// ── Settings-groups tab (shared by Email + Store Settings) ─────────────────────

function SettingsGroupsTab({ source, target, sourceLabel, targetLabel, disabled, exportFn, importFn, title }) {
  const [groups, setGroups]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState({})
  const [expanded, setExpanded] = useState({})
  const [progress, setProgress] = useState(null)
  const [results, setResults]   = useState(null)
  const cancelledRef            = useRef(false)
  const isWorking = loading || !!progress

  async function loadSettings() {
    setLoading(true); setGroups(null); setResults(null)
    try {
      const data = await exportFn(source)
      setGroups(data.groups)
      const sel = {}
      data.groups.forEach(g => { sel[g.id] = true })
      setSelected(sel)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to load settings')
    } finally { setLoading(false) }
  }

  async function runImport() {
    const toImport = (groups || []).filter(g => selected[g.id])
    if (!toImport.length) { toast.error('No groups selected'); return }
    cancelledRef.current = false
    setResults(null)
    const allResults = []
    for (let i = 0; i < toImport.length; i++) {
      if (cancelledRef.current) break
      const group = toImport[i]
      setProgress({ current: i + 1, total: toImport.length, name: group.label })
      try {
        const data = await importFn(target, [group])
        allResults.push(...data.results)
      } catch (err) {
        allResults.push({ id: group.id, label: group.label, updated: 0, errors: [err.response?.data?.detail ?? 'Failed'] })
      }
    }
    setProgress(null)
    setResults(allResults)
    const errors = allResults.reduce((n, r) => n + r.errors.length, 0)
    if (errors) toast.error(`Done with ${errors} error(s)`)
    else toast.success(`Imported ${allResults.length} group(s)`)
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <>
      {progress && (
        <ProgressOverlay title={`Importing to ${targetLabel}…`}
          subtitle={progress.name} current={progress.current} total={progress.total}
          onCancel={() => { cancelledRef.current = true }} />
      )}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Load {title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fetch from <span className="font-medium text-gray-700">{sourceLabel}</span>.</p>
          </div>
          <button onClick={loadSettings} disabled={disabled || isWorking}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {groups && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{groups.length} groups · <span className="font-medium text-gray-700">{selectedCount} selected</span></span>
              <button onClick={() => { const s = {}; groups.forEach(g => { s[g.id] = true }); setSelected(s) }} className="text-blue-600 hover:underline">All</button>
              <button onClick={() => { const s = {}; groups.forEach(g => { s[g.id] = false }); setSelected(s) }} className="text-blue-600 hover:underline">None</button>
            </div>
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto select-none">
              {groups.map(g => (
                <div key={g.id}>
                  <div onClick={() => setSelected(s => ({ ...s, [g.id]: !s[g.id] }))}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selected[g.id] ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" readOnly checked={!!selected[g.id]} className="w-4 h-4 accent-blue-600 pointer-events-none" />
                    <span className="text-sm font-medium text-gray-800 flex-1">{g.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">{g.settings.length} settings</span>
                    <button onClick={e => { e.stopPropagation(); setExpanded(ex => ({ ...ex, [g.id]: !ex[g.id] })) }}
                      className="text-gray-400 hover:text-gray-600 text-xs ml-1">
                      {expanded[g.id] ? '▲' : '▼'}
                    </button>
                  </div>
                  {expanded[g.id] && (
                    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-2">
                      {g.settings.map(s => (
                        <div key={s.id} className="flex gap-3 text-xs">
                          <span className="text-gray-500 w-48 shrink-0 truncate" title={s.label || s.id}>{s.label || s.id}</span>
                          <span className="text-gray-800 font-mono break-all">{String(s.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!groups ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">Push {selectedCount} group{selectedCount !== 1 ? 's' : ''} to <span className="font-medium text-gray-700">{targetLabel}</span> — existing settings overwritten.</p>
          </div>
          <button onClick={runImport} disabled={disabled || isWorking || !groups || !selectedCount}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Import {selectedCount > 0 ? `${selectedCount} group${selectedCount !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
        {results && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            <div className="flex gap-4 text-sm font-medium">
              {results.filter(r => !r.errors.length).length > 0 && <span className="text-green-600">{results.filter(r => !r.errors.length).length} updated</span>}
              {results.filter(r => r.errors.length).length  > 0 && <span className="text-red-600">{results.filter(r => r.errors.length).length} failed</span>}
              {results.filter(r => !r.errors.length && r.skipped > 0).length > 0 && <span className="text-gray-500">{results.filter(r => !r.errors.length && r.skipped > 0).length} partially skipped</span>}
            </div>
            {results.map(r => (
              <div key={r.id} className={`rounded-lg px-4 py-2.5 text-sm ${r.errors.length ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{r.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.errors.length ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {r.errors.length ? `${r.errors.length} error(s)` : `${r.updated} updated`}
                  </span>
                  {r.skipped > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{r.skipped} skipped</span>
                  )}
                </div>
                {r.errors.length > 0 && (
                  <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                    {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// ── Email settings tab ────────────────────────────────────────────────────────

function EmailTab(props) {
  return <SettingsGroupsTab {...props} title="email settings" exportFn={exportWCEmailSettings} importFn={importWCEmailSettings} />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportsExportsPage() {
  const [sites, setSites] = useState([])
  const [source, setSource] = useState('cranky_gr')
  const [target, setTarget] = useState('cranky_cranky_gr')
  const [tab, setTab] = useState('products')

  useEffect(() => { fetchBlogSites().then(setSites).catch(() => {}) }, [])

  function changeSource(val) {
    setSource(val)
    if (val === target) setTarget(sites.find(s => s.id !== val)?.id ?? target)
  }
  function changeTarget(val) {
    setTarget(val)
    if (val === source) setSource(sites.find(s => s.id !== val)?.id ?? source)
  }

  const sourceLabel = sites.find(s => s.id === source)?.label ?? source
  const targetLabel = sites.find(s => s.id === target)?.label ?? target
  const sameSite    = source === target

  const tabCls = active =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Migration</h1>
        <p className="text-sm text-gray-500 mt-1">Migrate products, orders, customers, posts and media between sites.</p>
      </div>

      {/* Site selectors */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Sites</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <SiteSelect label="Export from" value={source} onChange={changeSource} sites={sites} disabled={sites.length === 0} />
          <div className="pb-2 text-gray-400 text-lg select-none">→</div>
          <SiteSelect label="Import to"   value={target} onChange={changeTarget} sites={sites} disabled={sites.length === 0} />
          {sameSite && <p className="text-xs text-red-500 pb-2">Source and target must be different.</p>}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 -mb-2">
        <button onClick={() => setTab('products')} className={tabCls(tab === 'products')}>Products</button>
        <button onClick={() => setTab('orders')}   className={tabCls(tab === 'orders')}>Orders</button>
        <button onClick={() => setTab('coupons')}  className={tabCls(tab === 'coupons')}>Coupons</button>
        <button onClick={() => setTab('users')}    className={tabCls(tab === 'users')}>Users</button>
        <button onClick={() => setTab('posts')}    className={tabCls(tab === 'posts')}>Blog Posts</button>
        <button onClick={() => setTab('media')}    className={tabCls(tab === 'media')}>Media</button>
        <button onClick={() => setTab('email')}    className={tabCls(tab === 'email')}>Email Settings</button>
        <button onClick={() => setTab('tax')}      className={tabCls(tab === 'tax')}>Tax</button>
        <button onClick={() => setTab('shipping')} className={tabCls(tab === 'shipping')}>Shipping</button>
        <button onClick={() => setTab('store')}    className={tabCls(tab === 'store')}>Store Settings</button>
      </div>

      {tab === 'products' && (
        <ProductsTab
          source={source} target={target}
          sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite}
        />
      )}
      {tab === 'coupons' && (
        <CouponsTab
          source={source} target={target}
          sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite}
        />
      )}
      {tab === 'orders' && (
        <OrdersTab
          source={source} target={target}
          sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite}
        />
      )}
      {tab === 'users' && (
        <UsersTab
          source={source} target={target}
          sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite}
        />
      )}
      {tab === 'posts' && (
        <PostsTab
          source={source} target={target}
          sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite}
        />
      )}
      {tab === 'media' && (
        <MediaTab
          source={source} target={target}
          sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite}
        />
      )}
      {tab === 'email' && (
        <EmailTab source={source} target={target} sourceLabel={sourceLabel} targetLabel={targetLabel} disabled={sameSite} />
      )}
      {tab === 'tax' && (
        <TaxTab source={source} target={target} sourceLabel={sourceLabel} targetLabel={targetLabel} disabled={sameSite} />
      )}
      {tab === 'shipping' && (
        <ShippingTab source={source} target={target} sourceLabel={sourceLabel} targetLabel={targetLabel} disabled={sameSite} />
      )}
      {tab === 'store' && (
        <SettingsGroupsTab source={source} target={target} sourceLabel={sourceLabel} targetLabel={targetLabel}
          disabled={sameSite} title="store settings"
          exportFn={exportWCStoreSettings} importFn={importWCStoreSettings} />
      )}
    </div>
  )
}
