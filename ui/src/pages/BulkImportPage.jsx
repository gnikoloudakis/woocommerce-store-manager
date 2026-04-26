import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { bulkCreateProducts } from '../api/client'
import toast from 'react-hot-toast'

const EXAMPLE = JSON.stringify([
  {
    product: {
      product_name: "My Organic T-Shirt",
      short_description: "A comfy organic cotton tee.",
      main_image_ids: ["my-tshirt-main"],
      categories: [{ id: "t-shirts" }, { id: "eco" }],
      tags: [{ id: "organic" }],
      colors: ["Black", "White"],
      sizes: ["S", "M", "L", "XL", "2XL"],
      base_price: "18.00",
      secret_tags: ["internal-keyword", "supplier-acme"],
      related_ids: [],
      meta_data: [],
    },
    variations: {
      variation_image_mapping: {
        "S-Black": "my-tshirt-black",
        "M-Black": "my-tshirt-black",
        "S-White": "my-tshirt-white",
      },
      price_overrides: {
        "2XL-Black": "20.00",
        "2XL-White": "20.00",
      },
      sale_prices: {},
      stock_quantities: {},
    },
  },
], null, 2)

const STATUS_CONFIG = {
  created: { bg: 'bg-green-50', badge: 'bg-green-100 text-green-700', label: 'Created' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped' },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'   },
}

export default function BulkImportPage() {
  const [json, setJson] = useState('')
  const [parseError, setParseError] = useState(null)
  const [results, setResults] = useState(null)
  const fileRef = useRef()

  const mutation = useMutation({
    mutationFn: bulkCreateProducts,
    onSuccess: (data) => {
      setResults(data)
      const created = data.filter(r => r.status === 'created').length
      const errors  = data.filter(r => r.status === 'error').length
      if (errors === 0) toast.success(`${created} product(s) created`)
      else toast.error(`${created} created, ${errors} failed`)
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? 'Import failed')
    },
  })

  function validate(text) {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('Root must be a JSON array')
      setParseError(null)
      return parsed
    } catch (e) {
      setParseError(e.message)
      return null
    }
  }

  function handleTextChange(e) {
    setJson(e.target.value)
    setParseError(null)
    setResults(null)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      setJson(text)
      validate(text)
      setResults(null)
    }
    reader.readAsText(file)
  }

  function handleImport() {
    const parsed = validate(json)
    if (!parsed) return
    mutation.mutate(parsed)
  }

  const parsed = json ? validate(json) : null
  const count = Array.isArray(parsed) ? parsed.length : 0

  const created = results?.filter(r => r.status === 'created').length ?? 0
  const skipped = results?.filter(r => r.status === 'skipped').length ?? 0
  const errors  = results?.filter(r => r.status === 'error').length ?? 0

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste or upload a JSON array of products — same format as <code className="bg-gray-100 px-1 rounded">ProductStore</code> but with slugs for categories/tags and filenames (no extension) for images.
        </p>
      </div>

      {/* Input area */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">JSON Input</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setJson(EXAMPLE); setParseError(null); setResults(null) }}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
            >
              Load example
            </button>
            <button
              type="button"
              onClick={() => fileRef.current.click()}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
            >
              Upload file…
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          </div>
        </div>

        <textarea
          value={json}
          onChange={handleTextChange}
          spellCheck={false}
          rows={20}
          placeholder="Paste your JSON array here…"
          className={`w-full font-mono text-xs border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 resize-y ${
            parseError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-400'
          }`}
        />

        {parseError && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <span>✕</span> {parseError}
          </p>
        )}

        {!parseError && count > 0 && (
          <p className="text-sm text-green-600 flex items-center gap-1.5">
            <span>✓</span> Valid JSON — {count} product{count !== 1 ? 's' : ''} ready to import
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleImport}
            disabled={!json || !!parseError || count === 0 || mutation.isPending}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? `Importing ${count} product${count !== 1 ? 's' : ''}…` : `Import ${count || ''} product${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </section>

      {/* Results */}
      {results && (
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Results</h2>
            <div className="flex gap-3 text-sm">
              <span className="text-green-600 font-medium">{created} created</span>
              {skipped > 0 && <span className="text-yellow-600 font-medium">{skipped} skipped</span>}
              {errors  > 0 && <span className="text-red-600 font-medium">{errors} failed</span>}
            </div>
          </div>

          <div className="space-y-2">
            {results.map((r, i) => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.error
              return (
                <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-3 ${cfg.bg}`}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{r.product_name}</p>
                    {r.product_id && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        ID #{r.product_id} · {r.variations_count} variation{r.variations_count !== 1 ? 's' : ''}
                        {r.secret_tags_count > 0 && ` · ${r.secret_tags_count} secret tag${r.secret_tags_count !== 1 ? 's' : ''}`}
                      </p>
                    )}
                    {r.reason && (
                      <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-4 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Format reference */}
      <details className="bg-gray-50 border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer select-none">
          JSON format reference
        </summary>
        <div className="px-4 pb-4 text-xs text-gray-600 space-y-2">
          <p className="mt-2">Root must be an array <code className="bg-white px-1 rounded border">[ … ]</code>. Each item:</p>
          <pre className="bg-white border border-gray-200 rounded p-3 overflow-x-auto text-xs">{`{
  "product": {
    "product_name":      string   (required)
    "short_description": string
    "main_image_ids":    string[] (WP media filenames without extension)
    "categories":        [{"id": "slug"}, …]
    "tags":              [{"id": "slug"}, …]
    "colors":            string[]
    "sizes":             string[]
    "base_price":        string   (default "18.00")
    "secret_tags":       string[] (hidden internal tags, see below)
    "related_ids":       number[]
    "meta_data":         [{key, value}, …]
  },
  "variations": {
    "variation_image_mapping": {"S-Black": "filename", …}
    "price_overrides":         {"S-Black": "19.00", …}
    "sale_prices":             {"S-Black": "15.00", …}
    "stock_quantities":        {"S-Black": 50, …}
  }
}`}</pre>
          <p><strong>Image filenames</strong> — use the filename in your WordPress media library without the <code>.jpg</code> extension. The backend resolves them to WP media IDs automatically.</p>
          <p><strong>Category/tag slugs</strong> — use the slug as it appears in WooCommerce (e.g. <code>t-shirts</code>, <code>eco</code>, <code>organic</code>).</p>
          <p><strong>Secret tags</strong> — internal-only keywords stored in a hidden span inside the product description. Customers don't see them, but they're searchable from the WooCommerce admin. Optional.</p>
        </div>
      </details>
    </div>
  )
}
