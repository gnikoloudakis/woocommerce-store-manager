import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchProduct, fetchVariations, updateProduct, updateVariation, deleteVariation, fetchSecretTags, setSecretTags } from '../api/client'
import ProductForm from '../components/ProductForm'
import MediaPicker from '../components/MediaPicker'
import toast from 'react-hot-toast'

function VariationsTable({ productId }) {
  const qc = useQueryClient()
  const { data: variations = [], isLoading } = useQuery({
    queryKey: ['variations', productId],
    queryFn: () => fetchVariations(productId),
  })

  const updateMutation = useMutation({
    mutationFn: ({ varId, data }) => updateVariation(productId, varId, data),
    onSuccess: () => {
      toast.success('Variation updated')
      qc.invalidateQueries({ queryKey: ['variations', productId] })
    },
    onError: () => toast.error('Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (varId) => deleteVariation(productId, varId),
    onSuccess: () => {
      toast.success('Variation deleted')
      qc.invalidateQueries({ queryKey: ['variations', productId] })
    },
    onError: () => toast.error('Delete failed'),
  })

  if (isLoading) return <p className="text-gray-400 text-sm">Loading variations…</p>
  if (variations.length === 0) return <p className="text-gray-400 text-sm">No variations.</p>

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 text-left">ID</th>
            <th className="px-3 py-2 text-left">Attributes</th>
            <th className="px-3 py-2 text-left">SKU</th>
            <th className="px-3 py-2 text-left">Price</th>
            <th className="px-3 py-2 text-left">Sale Price</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {variations.map(v => (
            <VariationRow
              key={v.id}
              variation={v}
              onUpdate={(data) => updateMutation.mutate({ varId: v.id, data })}
              onDelete={() => {
                if (window.confirm(`Delete variation #${v.id}?`)) deleteMutation.mutate(v.id)
              }}
              isSaving={updateMutation.isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VariationRow({ variation, onUpdate, onDelete, isSaving }) {
  const attrs = variation.attributes?.map(a => `${a.name}: ${a.option}`).join(', ') ?? '—'
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 text-gray-400 font-mono">#{variation.id}</td>
      <td className="px-3 py-2 text-gray-700">{attrs}</td>
      <td className="px-3 py-2 text-gray-400 font-mono text-xs">{variation.sku || '—'}</td>
      <td className="px-3 py-2">
        <InlineEdit
          value={variation.regular_price}
          onSave={(v) => onUpdate({ regular_price: v })}
          isSaving={isSaving}
          prefix="€"
        />
      </td>
      <td className="px-3 py-2">
        <InlineEdit
          value={variation.sale_price ?? ''}
          onSave={(v) => onUpdate({ sale_price: v })}
          isSaving={isSaving}
          prefix="€"
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2">
        <select
          defaultValue={variation.status}
          onChange={e => onUpdate({ status: e.target.value })}
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none"
        >
          <option value="publish">Active</option>
          <option value="private">Hidden</option>
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 text-xs font-medium"
        >
          Delete
        </button>
      </td>
    </tr>
  )
}

function InlineEdit({ value, onSave, isSaving, prefix = '', placeholder = '' }) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onSave(e.target.elements.val.value)
      }}
      className="flex items-center gap-1"
    >
      <span className="text-gray-400 text-xs">{prefix}</span>
      <input
        name="val"
        defaultValue={value}
        placeholder={placeholder}
        className="border border-gray-300 rounded px-1.5 py-0.5 w-20 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button
        type="submit"
        disabled={isSaving}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
      >
        Save
      </button>
    </form>
  )
}

function ImagesSection({ productId, wcImages }) {
  const qc = useQueryClient()
  // wcImages: [{id, src, alt}] from WooCommerce — used for immediate previews
  const preloaded = wcImages.map(img => ({ id: img.id, url: img.src }))
  const [imageIds, setImageIds] = useState(wcImages.map(img => img.id))
  const [dirty, setDirty] = useState(false)

  function handleChange(ids) {
    setImageIds(ids)
    setDirty(true)
  }

  const mutation = useMutation({
    mutationFn: () => updateProduct(productId, { main_image_ids: imageIds }),
    onSuccess: () => {
      toast.success('Images saved')
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['product', String(productId)] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: () => toast.error('Failed to save images'),
  })

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Images</h2>
        {dirty && (
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Save images'}
          </button>
        )}
      </div>
      <MediaPicker
        value={imageIds}
        onChange={handleChange}
        multiple
        label=""
        preloadedImages={preloaded}
      />
      <p className="text-xs text-gray-400 mt-3">
        First image is the featured image. Reorder by removing and re-adding.
      </p>
    </section>
  )
}

function SecretTagsSection({ productId }) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['secret-tags', productId],
    queryFn: () => fetchSecretTags(productId),
  })

  const mutation = useMutation({
    mutationFn: (nextTags) => setSecretTags(productId, nextTags),
    onSuccess: (data) => {
      qc.setQueryData(['secret-tags', productId], data.tags)
      toast.success('Secret tags saved')
    },
    onError: () => toast.error('Failed to save secret tags'),
  })

  function addTag() {
    const val = input.trim()
    if (!val || tags.includes(val)) { setInput(''); return }
    mutation.mutate([...tags, val])
    setInput('')
  }

  function removeTag(tag) {
    mutation.mutate(tags.filter(t => t !== tag))
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-semibold text-gray-900">Secret Tags</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">hidden from customers</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Stored as a hidden <code className="bg-gray-100 px-1 rounded">display:none</code> span inside the product description. Useful for internal search or tagging workflows.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
            {tags.length === 0 && <span className="text-sm text-gray-400">No secret tags yet.</span>}
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-2.5 py-0.5 rounded-full">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={mutation.isPending}
                  className="text-yellow-500 hover:text-yellow-800 leading-none disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Type a tag and press Enter…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!input.trim() || mutation.isPending}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default function EditProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
  })

  const mutation = useMutation({
    mutationFn: (data) => updateProduct(id, data),
    onSuccess: (updated) => {
      toast.success(`"${updated.name}" updated`)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', id] })
    },
    onError: (err) => {
      const detail = err.response?.data?.detail ?? 'Update failed'
      toast.error(detail)
    },
  })

  if (isLoading) return <div className="py-16 text-center text-gray-400">Loading product…</div>
  if (isError) return <div className="py-16 text-center text-red-500">Failed to load product.</div>

  // Map WC product fields to form's initial values
  // main_image_ids intentionally omitted — handled by ImagesSection below
  const initialValues = {
    name: product.name,
    short_description: product.short_description?.replace(/<[^>]*>/g, '') ?? '',
    type: product.type,
    status: product.status,
    categories: product.categories?.map(c => c.slug) ?? [],
    tags: product.tags?.map(t => t.slug) ?? [],
    regular_price: product.regular_price ?? '',
    sale_price: product.sale_price ?? '',
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 text-sm">← Products</button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        <span className="text-sm text-gray-400 font-mono">#{product.id}</span>
      </div>

      <ProductForm
        initialValues={initialValues}
        onSubmit={mutation.mutate}
        submitLabel="Update Product"
        isLoading={mutation.isPending}
        showImages={false}
      />

      <ImagesSection productId={Number(id)} wcImages={product.images ?? []} />

      {product.type === 'variable' && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Variations</h2>
          <VariationsTable productId={Number(id)} />
        </section>
      )}

      <SecretTagsSection productId={Number(id)} />
    </div>
  )
}
