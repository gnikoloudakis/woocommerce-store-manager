import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCategories, fetchTags } from '../api/client'
import MediaPicker from './MediaPicker'
import VariationBuilder from './VariationBuilder'

function MultiSelect({ label, options, value, onChange, labelKey = 'name', valueKey = 'slug' }) {
  function toggle(v) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const v = opt[valueKey]
          const selected = value.includes(v)
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                selected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
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

export default function ProductForm({ initialValues = {}, onSubmit, submitLabel = 'Save', isLoading = false, showImages = true }) {
  const [name, setName] = useState(initialValues.name ?? '')
  const [shortDesc, setShortDesc] = useState(initialValues.short_description ?? '')
  const [type, setType] = useState(initialValues.type ?? 'variable')
  const [status, setStatus] = useState(initialValues.status ?? 'publish')
  const [categories, setCategories] = useState(initialValues.categories ?? [])
  const [tags, setTags] = useState(initialValues.tags ?? [])
  const [mainImageIds, setMainImageIds] = useState(initialValues.main_image_ids ?? [])
  const [regularPrice, setRegularPrice] = useState(initialValues.regular_price ?? '')
  const [salePrice, setSalePrice] = useState(initialValues.sale_price ?? '')

  // Variable product fields
  const [sizes, setSizes] = useState(initialValues.sizes ?? ['S', 'M', 'L', 'XL', '2XL'])
  const [colors, setColors] = useState(initialValues.colors ?? ['Black', 'White'])
  const [basePrice, setBasePrice] = useState(initialValues.base_price ?? '18.00')
  const [priceOverrides, setPriceOverrides] = useState(initialValues.price_overrides ?? {})
  const [salePrices, setSalePrices] = useState(initialValues.sale_prices ?? {})
  const [variationImageMapping, setVariationImageMapping] = useState(initialValues.variation_image_mapping ?? {})

  const { data: allCategories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: fetchTags })

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      name,
      short_description: shortDesc,
      type,
      status,
      categories,
      tags,
      // Only send main_image_ids if this form owns the images section.
      // When showImages=false (edit page), ImagesSection handles them independently —
      // sending an empty array here would wipe the product's images on the backend.
      ...(showImages ? { main_image_ids: mainImageIds } : {}),
      regular_price: regularPrice || undefined,
      sale_price: salePrice || undefined,
      ...(type === 'variable' ? {
        sizes,
        colors,
        base_price: basePrice,
        price_overrides: priceOverrides,
        sale_prices: salePrices,
        variation_image_mapping: variationImageMapping,
      } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Info */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">Basic Info</h2>

        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Product name *</label>
            <input
              required
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Organic Cotton T-Shirt"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Short description</label>
            <textarea
              rows={3}
              value={shortDesc}
              onChange={e => setShortDesc(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="A brief summary shown in product listings"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="variable">Variable (sizes / colors)</option>
              <option value="simple">Simple</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>

        {type === 'simple' && (
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regular price (€)</label>
              <input
                type="text"
                value={regularPrice}
                onChange={e => setRegularPrice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="18.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sale price (€)</label>
              <input
                type="text"
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="—"
              />
            </div>
          </div>
        )}
      </section>

      {/* Categories & Tags */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">Categories & Tags</h2>
        <MultiSelect
          label="Categories"
          options={allCategories}
          value={categories}
          onChange={setCategories}
          valueKey="slug"
        />
        <MultiSelect
          label="Tags"
          options={allTags}
          value={tags}
          onChange={setTags}
          valueKey="slug"
        />
      </section>

      {/* Main Images — hidden on edit page where ImagesSection owns this */}
      {showImages && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Main Images</h2>
          <MediaPicker
            value={mainImageIds}
            onChange={setMainImageIds}
            multiple
            label="Select product images"
          />
        </section>
      )}

      {/* Variations */}
      {type === 'variable' && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Variations</h2>
          <VariationBuilder
            sizes={sizes} setSizes={setSizes}
            colors={colors} setColors={setColors}
            basePrice={basePrice} setBasePrice={setBasePrice}
            priceOverrides={priceOverrides} setPriceOverrides={setPriceOverrides}
            salePrices={salePrices} setSalePrices={setSalePrices}
            variationImageMapping={variationImageMapping} setVariationImageMapping={setVariationImageMapping}
          />
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
