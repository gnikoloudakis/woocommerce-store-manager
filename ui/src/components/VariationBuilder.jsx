import { useMemo } from 'react'
import MediaPicker from './MediaPicker'

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', '2XL']
const DEFAULT_COLORS = ['Black', 'White', 'Navy', 'Red', 'Green', 'Gray']

function TagInput({ values, onChange, suggestions, placeholder }) {
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
      </div>
      <div className="flex flex-wrap gap-1">
        {suggestions.filter(s => !values.includes(s)).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="text-xs px-2 py-0.5 border border-gray-300 rounded-full hover:bg-gray-100 text-gray-600"
          >
            + {s}
          </button>
        ))}
        <input
          type="text"
          placeholder={placeholder}
          className="text-xs border border-gray-300 rounded px-2 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(e.target.value)
              e.target.value = ''
            }
          }}
        />
      </div>
    </div>
  )
}

export default function VariationBuilder({ sizes, setSizes, colors, setColors, basePrice, setBasePrice, priceOverrides, setPriceOverrides, salePrices, setSalePrices, variationImageMapping, setVariationImageMapping }) {
  const combinations = useMemo(() => {
    const result = []
    for (const size of sizes) {
      for (const color of colors) {
        result.push(`${size}-${color}`)
      }
    }
    return result
  }, [sizes, colors])

  function setOverride(key, field, value) {
    if (field === 'price') setPriceOverrides(prev => ({ ...prev, [key]: value }))
    if (field === 'sale') setSalePrices(prev => ({ ...prev, [key]: value }))
    if (field === 'image') setVariationImageMapping(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sizes</label>
          <TagInput values={sizes} onChange={setSizes} suggestions={DEFAULT_SIZES} placeholder="custom…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Colors</label>
          <TagInput values={colors} onChange={setColors} suggestions={DEFAULT_COLORS} placeholder="custom…" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Base price (€)</label>
        <input
          type="text"
          value={basePrice}
          onChange={e => setBasePrice(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="18.00"
        />
        <p className="text-xs text-gray-400 mt-1">Applied to all variations unless overridden below</p>
      </div>

      {combinations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Variation overrides ({combinations.length} combinations)</h4>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Variation</th>
                  <th className="px-3 py-2 text-left">Regular Price (€)</th>
                  <th className="px-3 py-2 text-left">Sale Price (€)</th>
                  <th className="px-3 py-2 text-left">Image</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {combinations.map(key => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-700">{key}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={priceOverrides[key] ?? ''}
                        onChange={e => setOverride(key, 'price', e.target.value)}
                        placeholder={basePrice || '18.00'}
                        className="border border-gray-300 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={salePrices[key] ?? ''}
                        onChange={e => setOverride(key, 'sale', e.target.value)}
                        placeholder="—"
                        className="border border-gray-300 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MediaPicker
                        value={variationImageMapping[key] ?? null}
                        onChange={id => setOverride(key, 'image', id)}
                        label=""
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
