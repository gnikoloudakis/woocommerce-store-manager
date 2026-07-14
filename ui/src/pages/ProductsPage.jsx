import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { fetchProducts, deleteProduct, updateProduct, relinkImages, imageAudit, setSecretTags, fetchCategories, fetchTags } from '../api/client'
import Lightbox from '../components/Lightbox'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  publish: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  private: 'bg-gray-100 text-gray-600',
  pending: 'bg-orange-100 text-orange-700',
}

// Tolerant match: any quote style, optional spaces in the style attribute, case-insensitive
const SECRET_TAG_RE = /<span\s+style=['"]\s*display\s*:\s*none\s*;?\s*['"]\s*>([^<]*)<\/span>/i

function parseSecretTags(description = '') {
  const match = SECRET_TAG_RE.exec(description)
  if (!match) return []
  return match[1].split(/\s+/).filter(Boolean)
}

function SecretTagsCell({ product }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const tags = parseSecretTags(product.description)

  const mutation = useMutation({
    mutationFn: (nextTags) => setSecretTags(product.id, nextTags),
    onSuccess: () => {
      toast.success('Secret tags saved')
      qc.invalidateQueries({ queryKey: ['products'] })
      setEditing(false)
    },
    onError: () => toast.error('Failed to save'),
  })

  function addTag() {
    const val = input.trim()
    if (!val) return
    mutation.mutate([...tags, val])
    setInput('')
  }

  function removeTag(tag) {
    mutation.mutate(tags.filter(t => t !== tag))
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {tags.length === 0
          ? <span className="text-gray-300 text-xs">—</span>
          : tags.map(t => (
              <span key={t} className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-1.5 py-0.5 rounded-full">
                {t}
              </span>
            ))
        }
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          title="Edit secret tags"
        >
          ✎
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 min-w-[180px]">
      <div className="flex flex-wrap gap-1">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-0.5 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-1.5 py-0.5 rounded-full">
            {t}
            <button
              onClick={() => removeTag(t)}
              disabled={mutation.isPending}
              className="text-yellow-400 hover:text-yellow-700 leading-none disabled:opacity-50"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
          placeholder="add tag…"
          className="border border-gray-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-yellow-400"
        />
        <button
          onClick={addTag}
          disabled={!input.trim() || mutation.isPending}
          className="text-xs px-2 py-0.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
        >
          Add
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function CategoriesModal({ product, allCategories, onClose }) {
  const qc = useQueryClient()
  const current = product.categories ?? []
  const [selected, setSelected] = useState(new Set(current.map(c => c.id)))

  const mutation = useMutation({
    mutationFn: (cats) => updateProduct(product.id, { categories: cats.map(c => ({ id: c.id })) }),
    onSuccess: (updatedProduct) => {
      qc.setQueriesData({ queryKey: ['products'] }, (old) => {
        if (!old?.products) return old
        return { ...old, products: old.products.map(p => p.id === product.id ? { ...p, categories: updatedProduct.categories } : p) }
      })
      toast.success('Categories saved')
      onClose()
    },
    onError: () => toast.error('Failed to save categories'),
  })

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    const cats = allCategories.filter(c => selected.has(c.id))
    mutation.mutate(cats)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900 text-sm">Edit categories — <span className="font-normal text-gray-500">{product.name}</span></h3>
        </div>
        <div className="px-5 py-3 max-h-72 overflow-y-auto space-y-1">
          {allCategories.length === 0 && <p className="text-sm text-gray-400">No categories found.</p>}
          {allCategories.map(c => (
            <label key={c.id} className="flex items-center gap-2.5 py-1 cursor-pointer hover:bg-gray-50 rounded px-1">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
              />
              <span className="text-sm text-gray-700">{c.name}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={mutation.isPending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancel</button>
          <button onClick={save} disabled={mutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CategoriesCell({ product, allCategories }) {
  const [open, setOpen] = useState(false)
  const current = product.categories ?? []

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {current.length === 0
          ? <span className="text-gray-300 text-xs">—</span>
          : current.map(c => (
              <span key={c.id} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full">
                {c.name}
              </span>
            ))
        }
        <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-gray-600 ml-1" title="Edit categories">
          ✎
        </button>
      </div>
      {open && (
        <CategoriesModal product={product} allCategories={allCategories} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function BulkCategoryModal({ products, allCategories, onClose, onComplete }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(new Set())
  const [mode, setMode] = useState('add') // 'add' | 'remove'
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function run() {
    if (selected.size === 0) { toast.error('Select at least one category'); return }
    setRunning(true)
    let succeeded = 0, skipped = 0, failed = 0

    for (const p of products) {
      const existing = (p.categories ?? []).map(c => c.id)
      let next

      if (mode === 'add') {
        const toAdd = [...selected].filter(id => !existing.includes(id))
        if (toAdd.length === 0) { skipped++; setProgress(succeeded + skipped + failed); continue }
        next = [...new Set([...existing, ...selected])]
      } else {
        const toRemove = [...selected].filter(id => existing.includes(id))
        if (toRemove.length === 0) { skipped++; setProgress(succeeded + skipped + failed); continue }
        next = existing.filter(id => !selected.has(id))
      }

      try {
        await updateProduct(p.id, { categories: next.map(id => ({ id })) })
        succeeded++
      } catch { failed++ }
      setProgress(succeeded + skipped + failed)
    }

    setRunning(false)
    qc.invalidateQueries({ queryKey: ['products'] })
    const parts = []
    if (succeeded > 0) parts.push(`${succeeded} updated`)
    if (skipped > 0)   parts.push(`${skipped} already done`)
    if (failed > 0)    parts.push(`${failed} failed`)
    if (failed === 0) toast.success(parts.join(', ') || 'Nothing to do')
    else toast.error(parts.join(', '))
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">
            Manage categories — {products.length} product{products.length !== 1 ? 's' : ''}
          </h3>
        </div>
        <div className="px-5 py-3 space-y-3">
          {/* Add / Remove toggle */}
          <div className="flex gap-2">
            {['add', 'remove'].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {m === 'add' ? 'Add to' : 'Remove from'}
              </button>
            ))}
            <span className="text-sm text-gray-400 self-center">selected products</span>
          </div>

          {/* Category list */}
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {allCategories.length === 0 && <p className="text-sm text-gray-400 p-3">No categories found.</p>}
            {allCategories.map(c => (
              <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  disabled={running}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                />
                <span className="text-sm text-gray-700">{c.name}</span>
              </label>
            ))}
          </div>

          {running && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Processing…</span><span>{progress} / {products.length}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-blue-600 h-full transition-all" style={{ width: `${(progress / products.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={running} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancel</button>
          <button
            onClick={run}
            disabled={running || selected.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? 'Working…' : `Apply to ${products.length} product${products.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkSecretTagsModal({ products, onClose, onComplete }) {
  const qc = useQueryClient()
  const [tagsInput, setTagsInput] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  async function run() {
    const newTags = tagsInput.split(/[\s,]+/).map(t => t.trim()).filter(Boolean)
    if (newTags.length === 0) {
      toast.error('Enter at least one tag')
      return
    }
    setRunning(true)
    let succeeded = 0
    let skipped = 0
    let failed = 0
    for (const p of products) {
      const existing = parseSecretTags(p.description)
      const merged = Array.from(new Set([...existing, ...newTags]))

      // Skip the API call if every new tag is already present
      if (newTags.every(t => existing.includes(t))) {
        skipped++
        setProgress(succeeded + skipped + failed)
        continue
      }

      try {
        await setSecretTags(p.id, merged)
        succeeded++
      } catch {
        failed++
      }
      setProgress(succeeded + skipped + failed)
    }
    setRunning(false)
    qc.invalidateQueries({ queryKey: ['products'] })

    const parts = []
    if (succeeded > 0) parts.push(`${succeeded} updated`)
    if (skipped > 0) parts.push(`${skipped} already had all tags`)
    if (failed > 0) parts.push(`${failed} failed`)
    const message = parts.join(', ')
    if (failed === 0) toast.success(message || 'Nothing to do')
    else toast.error(message)
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Add secret tags to {products.length} product{products.length !== 1 ? 's' : ''}</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <input
              autoFocus
              type="text"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3"
              disabled={running}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              Separate with spaces or commas. Tags will be appended to each product's existing secret tags. Products that already have all the listed tags are skipped.
            </p>
          </div>

          {running && (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Processing…</span>
                <span>{progress} / {products.length}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-yellow-500 h-full transition-all" style={{ width: `${(progress / products.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={running} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancel</button>
          <button onClick={run} disabled={running || !tagsInput.trim()} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
            {running ? 'Working…' : `Apply to ${products.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkRelinkModal({ products, onClose, onComplete }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState([])

  async function run() {
    setRunning(true)
    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      try {
        const res = await relinkImages(p.id)
        const fixed = res.fixed?.length ?? 0
        const skipped = res.skipped?.length ?? 0
        if (fixed > 0) setLog(l => [...l, `✓ ${p.name}: ${fixed} relinked${skipped ? `, ${skipped} skipped` : ''}`])
      } catch {
        setLog(l => [...l, `✗ ${p.name}: failed`])
      }
      setProgress(i + 1)
    }
    setRunning(false)
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Relink images for {products.length} product{products.length !== 1 ? 's' : ''}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Replaces external image URLs with local media IDs to stop WooCommerce from re-downloading them on every save.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {running && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Processing…</span><span>{progress} / {products.length}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-purple-600 h-full transition-all" style={{ width: `${(progress / products.length) * 100}%` }} />
              </div>
            </div>
          )}
          {log.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs space-y-0.5 font-mono bg-gray-50 rounded p-2">
              {log.map((l, i) => <div key={i} className={l.startsWith('✓') ? 'text-green-700' : 'text-red-600'}>{l}</div>)}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={running} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
            {running ? 'Running…' : 'Close'}
          </button>
          {!running && log.length === 0 && (
            <button onClick={run} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
              Run for {products.length} product{products.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const PER_PAGE_OPTIONS = [20, 50, 100, -1] // -1 = All

// Columns that WC API can sort server-side (orderby param values)
const SERVER_SORT = { id: 'id', name: 'title', price: 'price' }
// Columns sorted client-side (within the current page)
const CLIENT_SORT = { type: 'type', status: 'status', sku: 'sku' }

function SortableHeader({ label, field, sortBy, sortDir, onSort, className = '' }) {
  const active = sortBy === field
  return (
    <th
      className={`px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100 group ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] leading-none ${active ? 'text-blue-500' : 'text-gray-300 group-hover:text-gray-400'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // All pagination/filter/sort state lives in the URL so navigating back restores it
  const page    = Number(searchParams.get('page')     ?? 1)
  const perPage = Number(searchParams.get('per_page') ?? 20)
  const search  = searchParams.get('search')   ?? ''
  const sortBy  = searchParams.get('sort_by')  ?? ''
  const sortDir = searchParams.get('sort_dir') ?? 'desc'
  const filters = {
    status:       searchParams.get('status')       ?? '',
    type:         searchParams.get('type')         ?? '',
    category:     searchParams.get('category')     ?? '',
    tag:          searchParams.get('tag')           ?? '',
    stock_status: searchParams.get('stock_status') ?? '',
  }

  // searchInput is ephemeral (unsubmitted text in the search box)
  const [searchInput, setSearchInput] = useState(search)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null) // 'secret-tags' | 'delete' | 'relink' | null
  const [lightbox, setLightbox] = useState(null)     // {urls, startIndex} | null
  const [audit, setAudit] = useState(null)           // null | 'loading' | result

  function updateParams(updates, resetPage = false) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) next.set(k, String(v))
        else next.delete(k)
      })
      if (resetPage) next.delete('page')
      return next
    }, { replace: true })
  }

  function setPage(p)    { updateParams({ page: p }) }
  function setPerPage(n) { updateParams({ per_page: n }, true) }

  const qc = useQueryClient()

  const isServerSort = sortBy in SERVER_SORT
  const wcOrderby = isServerSort ? SERVER_SORT[sortBy] : 'date'
  const wcOrder = isServerSort ? sortDir : 'desc'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', page, perPage, search, filters, sortBy, sortDir],
    queryFn: () => fetchProducts({ page, per_page: perPage, search, orderby: wcOrderby, order: wcOrder, ...filters }),
  })

  function handleSort(field) {
    const newDir = sortBy === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    updateParams({ sort_by: field, sort_dir: newDir }, true)
  }

  const { data: allCategories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: fetchTags })

  function setFilter(key, value) {
    updateParams({ [key]: value }, true)
  }

  function clearFilters() {
    updateParams({ status: '', type: '', category: '', tag: '', stock_status: '' }, true)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: (_, id) => {
      toast.success(`Product #${id} deleted`)
      qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: () => toast.error('Delete failed'),
  })

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(productsOnPage) {
    setSelectedIds(prev => {
      const allSelected = productsOnPage.every(p => prev.has(p.id))
      if (allSelected) {
        const next = new Set(prev)
        productsOnPage.forEach(p => next.delete(p.id))
        return next
      } else {
        const next = new Set(prev)
        productsOnPage.forEach(p => next.add(p.id))
        return next
      }
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function bulkDelete(selectedProducts) {
    if (!window.confirm(`Delete ${selectedProducts.length} product${selectedProducts.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    let succeeded = 0
    let failed = 0
    for (const p of selectedProducts) {
      try {
        await deleteProduct(p.id)
        succeeded++
      } catch {
        failed++
      }
    }
    qc.invalidateQueries({ queryKey: ['products'] })
    clearSelection()
    if (failed === 0) toast.success(`Deleted ${succeeded} product${succeeded !== 1 ? 's' : ''}`)
    else toast.error(`${succeeded} deleted, ${failed} failed`)
  }

  function handleSearch(e) {
    e.preventDefault()
    updateParams({ search: searchInput }, true)
  }

  function confirmDelete(product) {
    if (window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(product.id)
    }
  }

  const rawProducts = data?.products ?? []
  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0

  // Client-side sort for fields WC doesn't sort server-side
  const products = (() => {
    const field = CLIENT_SORT[sortBy]
    if (!field) return rawProducts
    return [...rawProducts].sort((a, b) => {
      const av = (a[field] ?? '').toString().toLowerCase()
      const bv = (b[field] ?? '').toString().toLowerCase()
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  })()

  const selectedProducts = products.filter(p => selectedIds.has(p.id))
  const allOnPageSelected = products.length > 0 && products.every(p => selectedIds.has(p.id))
  const someOnPageSelected = products.some(p => selectedIds.has(p.id)) && !allOnPageSelected

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <NavLink to="/products" end className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Products</NavLink>
        <NavLink to="/categories"   className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Categories</NavLink>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} products total</p>}
        </div>
        <Link
          to="/create"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Product
        </Link>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search products…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); updateParams({ search: '' }, true) }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </form>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filters</span>

        <select
          value={filters.status}
          onChange={e => setFilter('status', e.target.value)}
          className="border border-gray-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Any status</option>
          <option value="publish">Published</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="private">Private</option>
        </select>

        <select
          value={filters.type}
          onChange={e => setFilter('type', e.target.value)}
          className="border border-gray-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Any type</option>
          <option value="simple">Simple</option>
          <option value="variable">Variable</option>
          <option value="grouped">Grouped</option>
          <option value="external">External</option>
        </select>

        <select
          value={filters.category}
          onChange={e => setFilter('category', e.target.value)}
          className="border border-gray-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[180px]"
        >
          <option value="">Any category</option>
          {allCategories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filters.tag}
          onChange={e => setFilter('tag', e.target.value)}
          className="border border-gray-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[180px]"
        >
          <option value="">Any tag</option>
          {allTags.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={filters.stock_status}
          onChange={e => setFilter('stock_status', e.target.value)}
          className="border border-gray-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Any stock</option>
          <option value="instock">In stock</option>
          <option value="outofstock">Out of stock</option>
          <option value="onbackorder">On backorder</option>
        </select>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Image audit */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={async () => { setAudit('loading'); setAudit(await imageAudit()) }}
          disabled={audit === 'loading'}
          className="px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {audit === 'loading' ? 'Scanning…' : 'Audit numeric images'}
        </button>
        {audit && audit !== 'loading' && (
          <span className={`text-xs ${audit.flagged_count > 0 ? 'text-red-600 font-medium' : 'text-green-600'}`}>
            {audit.flagged_count === 0
              ? `✓ No numeric-filename images found (${audit.total_scanned} scanned)`
              : `⚠ ${audit.flagged_count} product${audit.flagged_count !== 1 ? 's' : ''} have numeric images (${audit.total_scanned} scanned)`}
          </span>
        )}
        {audit && audit !== 'loading' && (
          <button onClick={() => setAudit(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        )}
      </div>
      {audit && audit !== 'loading' && audit.products?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs space-y-1 max-h-48 overflow-y-auto">
          {audit.products.map(p => (
            <div key={p.id} className="flex gap-2">
              <span className="text-gray-500 font-mono shrink-0">#{p.id}</span>
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="text-red-500 ml-auto shrink-0">{p.images.join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkAction('categories')}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              Categories
            </button>
            <button
              onClick={() => setBulkAction('secret-tags')}
              className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 transition-colors"
            >
              Add secret tags
            </button>
            <button
              onClick={() => setBulkAction('relink')}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors"
              title="Replace external image URLs with local media IDs to prevent WooCommerce from re-downloading them"
            >
              Relink images
            </button>
            <button
              onClick={() => bulkDelete(Array.from(selectedIds).map(id => products.find(p => p.id === id)).filter(Boolean))}
              className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {bulkAction === 'categories' && (
        <BulkCategoryModal
          products={selectedProducts}
          allCategories={allCategories}
          onClose={() => setBulkAction(null)}
          onComplete={() => { setBulkAction(null); clearSelection() }}
        />
      )}
      {bulkAction === 'secret-tags' && (
        <BulkSecretTagsModal
          products={selectedProducts}
          onClose={() => setBulkAction(null)}
          onComplete={() => { setBulkAction(null); clearSelection() }}
        />
      )}
      {bulkAction === 'relink' && (
        <BulkRelinkModal
          products={selectedProducts}
          onClose={() => setBulkAction(null)}
          onComplete={() => { toast.success('Relink complete'); setBulkAction(null); clearSelection() }}
        />
      )}

      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          startIndex={lightbox.startIndex}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading && (
          <div className="py-16 text-center text-gray-400">Loading products…</div>
        )}
        {isError && (
          <div className="py-16 text-center text-red-500">Failed to load products. Is the API running?</div>
        )}
        {!isLoading && !isError && products.length === 0 && (
          <div className="py-16 text-center text-gray-400">No products found.</div>
        )}
        {!isLoading && products.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th className="pl-4 pr-2 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={el => { if (el) el.indeterminate = someOnPageSelected }}
                    onChange={() => toggleSelectAll(products)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                  />
                </th>
                <SortableHeader label="ID"     field="id"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Name"   field="name"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type"   field="type"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Price"  field="price"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="SKU"    field="sku"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Categories</th>
                <th className="px-4 py-3 text-left">Secret Tags</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(p => (
                <tr
                  key={p.id}
                  className={`transition-colors ${selectedIds.has(p.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                >
                  <td className="pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono">#{p.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] && (
                        <button
                          type="button"
                          onClick={() => setLightbox({ urls: p.images.map(img => img.src), startIndex: 0 })}
                          className="relative shrink-0 group"
                          title={p.images.length > 1 ? `View all ${p.images.length} images` : 'View image'}
                        >
                          <img
                            src={p.images[0].src}
                            alt=""
                            className="w-10 h-10 rounded object-cover border border-gray-200 cursor-zoom-in transition-transform group-hover:scale-110"
                          />
                          {p.images.length > 1 && (
                            <span className="absolute -bottom-1 -right-1 bg-gray-700 text-white text-[10px] rounded-full px-1.5 leading-tight border border-white">
                              {p.images.length}
                            </span>
                          )}
                        </button>
                      )}
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{p.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{p.type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.price ? `€${p.price}` : p.price_html ? <span dangerouslySetInnerHTML={{ __html: p.price_html }} /> : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.sku
                      ? <span className="text-gray-500">{p.sku}</span>
                      : p.type === 'variable'
                        ? <span className="text-gray-300 italic not-italic font-sans text-[11px]">by variation</span>
                        : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <CategoriesCell product={p} allCategories={allCategories} />
                  </td>
                  <td className="px-4 py-3">
                    <SecretTagsCell product={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-700 text-xs"
                      >
                        View
                      </a>
                      <Link
                        to={`/edit/${p.id}`}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => confirmDelete(p)}
                        disabled={deleteMutation.isPending}
                        className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && products.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Showing{' '}
              {perPage === -1 ? (
                <>
                  <span className="font-medium text-gray-700">all {products.length}</span>
                  {products.length !== total && <> of <span className="font-medium text-gray-700">{total}</span></>}
                </>
              ) : (
                <>
                  <span className="font-medium text-gray-700">{(page - 1) * perPage + 1}</span>
                  {' – '}
                  <span className="font-medium text-gray-700">{(page - 1) * perPage + products.length}</span>
                  {' of '}
                  <span className="font-medium text-gray-700">{total}</span>
                </>
              )}
            </span>

            <label className="flex items-center gap-2 text-sm text-gray-500">
              Per page:
              <select
                value={perPage}
                onChange={e => setPerPage(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {PER_PAGE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n === -1 ? 'All' : n}</option>
                ))}
              </select>
            </label>
          </div>

          {perPage !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
