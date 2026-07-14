import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchMedia, uploadMedia } from '../api/client'
import Lightbox from './Lightbox'
import toast from 'react-hot-toast'

// preloadedImages: [{id, url}] — used for thumbnails before the media library loads
export default function MediaPicker({ value, onChange, multiple = false, label = 'Image', preloadedImages = [] }) {
  const [open, setOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [hoverItem, setHoverItem] = useState(null)
  const qc = useQueryClient()

  const { data: media = [], isLoading } = useQuery({
    queryKey: ['media', reloadKey],
    queryFn: fetchMedia,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const uploadMutation = useMutation({
    mutationFn: uploadMedia,
    onSuccess: () => {
      setReloadKey(k => k + 1)
      toast.success('Image uploaded')
    },
    onError: () => toast.error('Upload failed'),
  })

  const selectedIds = multiple ? (value || []) : (value ? [value] : [])

  function toggle(id) {
    if (multiple) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter(i => i !== id)
        : [...selectedIds, id]
      onChange(next)
    } else {
      onChange(id === value ? null : id)
      setOpen(false)
    }
  }

  const q = search.toLowerCase()
  const filtered = media.filter(m =>
    !q ||
    m.filename?.toLowerCase().includes(q) ||
    m.title?.toLowerCase().includes(q) ||
    m.alt_text?.toLowerCase().includes(q)
  )

  // Build preview items: prefer media library data, fall back to preloaded URLs
  const previewItems = selectedIds.map(id => {
    const fromMedia = media.find(m => m.id === id)
    if (fromMedia) return fromMedia
    const fromPreloaded = preloadedImages.find(p => p.id === id)
    if (fromPreloaded) return fromPreloaded
    return null
  }).filter(Boolean)

  // The item shown in the detail panel: hovered item, or first selected item
  const detailItem = hoverItem ?? (selectedIds.length > 0 ? media.find(m => m.id === selectedIds[0]) : null)

  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => toast.success('URL copied'))
  }

  return (
    <div>
      {lightboxUrl && <Lightbox urls={[lightboxUrl]} onClose={() => setLightboxUrl(null)} />}

      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}

      {/* Selected previews */}
      <div className="flex flex-wrap gap-2 mb-2">
        {previewItems.map(m => (
          <div key={m.id} className="relative group">
            <img
              src={m.url}
              alt=""
              className="w-20 h-20 object-cover rounded-lg border border-gray-200 shadow-sm cursor-zoom-in"
              onClick={() => setLightboxUrl(m.url)}
            />
            <button
              type="button"
              onClick={() => toggle(m.id)}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center shadow"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors gap-1"
        >
          <span className="text-2xl leading-none">+</span>
          <span className="text-xs">Add</span>
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <h3 className="font-semibold text-gray-900">Media Library</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReloadKey(k => k + 1)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  <span className="text-base leading-none">↻</span> Reload
                </button>
                <label className="cursor-pointer text-sm text-blue-600 hover:underline">
                  Upload new
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => { if (e.target.files[0]) uploadMutation.mutate(e.target.files[0]) }}
                  />
                </label>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b shrink-0">
              <input
                type="text"
                placeholder="Search by filename, title or alt text…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Body: grid + detail panel */}
            <div className="flex flex-1 min-h-0">

              {/* Grid */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoading && <p className="text-center text-gray-400 py-8">Loading…</p>}
                {!isLoading && filtered.length === 0 && <p className="text-center text-gray-400 py-8">No results.</p>}
                <div className="grid grid-cols-4 gap-3">
                  {filtered.map(m => {
                    const name = m.title || m.filename?.split('/').pop() || ''
                    const isSelected = selectedIds.includes(m.id)
                    return (
                      <div
                        key={m.id}
                        className="relative group flex flex-col gap-1"
                        onMouseEnter={() => setHoverItem(m)}
                        onMouseLeave={() => setHoverItem(null)}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(m.id)}
                          className={`w-full relative rounded overflow-hidden border-2 transition-all ${
                            isSelected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent hover:border-gray-300'
                          }`}
                        >
                          <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">✓</span>
                            </div>
                          )}
                        </button>
                        <p className="text-[10px] text-gray-400 leading-tight truncate text-center px-0.5" title={name}>{name}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Detail panel */}
              <div className="w-80 shrink-0 border-l border-gray-200 flex flex-col bg-gray-50">
                {detailItem ? (
                  <>
                    <div className="p-3 flex items-center justify-center bg-gray-100 border-b border-gray-200" style={{ minHeight: 280 }}>
                      <img
                        src={detailItem.url}
                        alt=""
                        className="max-w-full max-h-64 object-contain rounded shadow cursor-zoom-in"
                        onClick={() => setLightboxUrl(detailItem.url)}
                        title="Click to enlarge"
                      />
                    </div>
                    <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1 text-sm">
                      {detailItem.title && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Title</p>
                          <p className="text-gray-800 font-medium break-words">{detailItem.title}</p>
                        </div>
                      )}
                      {detailItem.filename && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">File</p>
                          <p className="text-gray-600 font-mono text-xs break-all">{detailItem.filename.split('/').pop()}</p>
                        </div>
                      )}
                      {detailItem.alt_text && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Alt text</p>
                          <p className="text-gray-600 text-xs break-words">{detailItem.alt_text}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">URL</p>
                        <div className="flex items-start gap-1.5">
                          <p className="text-gray-500 font-mono text-[10px] break-all flex-1 leading-relaxed">{detailItem.url}</p>
                          <button
                            type="button"
                            onClick={() => copyUrl(detailItem.url)}
                            className="shrink-0 text-xs px-1.5 py-0.5 border border-gray-300 rounded text-gray-500 hover:bg-white"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">ID</p>
                        <p className="text-gray-500 font-mono text-xs">#{detailItem.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(detailItem.id)}
                        className={`mt-auto w-full py-2 rounded text-sm font-medium transition-colors ${
                          selectedIds.includes(detailItem.id)
                            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {selectedIds.includes(detailItem.id) ? 'Deselect' : 'Select'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-300 text-sm text-center px-6">
                    Hover over an image to preview it
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
