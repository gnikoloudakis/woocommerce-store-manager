import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchProducts, deleteProduct, setSecretTags } from '../api/client'
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

export default function ProductsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null) // 'secret-tags' | 'delete' | null
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => fetchProducts({ page, per_page: 20, search }),
  })

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
    setSearch(searchInput)
    setPage(1)
  }

  function confirmDelete(product) {
    if (window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(product.id)
    }
  }

  const products = data?.products ?? []
  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0
  const selectedProducts = products.filter(p => selectedIds.has(p.id))
  const allOnPageSelected = products.length > 0 && products.every(p => selectedIds.has(p.id))
  const someOnPageSelected = products.some(p => selectedIds.has(p.id)) && !allOnPageSelected

  return (
    <div className="space-y-6">
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
            onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </form>

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
              onClick={() => setBulkAction('secret-tags')}
              className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 transition-colors"
            >
              Add secret tags
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

      {bulkAction === 'secret-tags' && (
        <BulkSecretTagsModal
          products={selectedProducts}
          onClose={() => setBulkAction(null)}
          onComplete={() => { setBulkAction(null); clearSelection() }}
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
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-left">SKU</th>
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
                        <img src={p.images[0].src} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{p.name}</p>
                        {p.categories?.length > 0 && (
                          <p className="text-xs text-gray-400">{p.categories.map(c => c.name).join(', ')}</p>
                        )}
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
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.sku || '—'}</td>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
