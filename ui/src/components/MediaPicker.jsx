import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchMedia, uploadMedia } from '../api/client'
import toast from 'react-hot-toast'

function Lightbox({ url, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <img
        src={url}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
      >
        ×
      </button>
    </div>
  )
}

// preloadedImages: [{id, url}] — used for thumbnails before the media library loads
export default function MediaPicker({ value, onChange, multiple = false, label = 'Image', preloadedImages = [] }) {
  const [open, setOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: media = [], isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: fetchMedia,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const uploadMutation = useMutation({
    mutationFn: uploadMedia,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] })
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

  const filtered = media.filter(m =>
    !search || m.filename?.toLowerCase().includes(search.toLowerCase())
  )

  // Build preview items: prefer media library data, fall back to preloaded URLs
  const previewItems = selectedIds.map(id => {
    const fromMedia = media.find(m => m.id === id)
    if (fromMedia) return fromMedia
    const fromPreloaded = preloadedImages.find(p => p.id === id)
    if (fromPreloaded) return fromPreloaded
    return null
  }).filter(Boolean)

  return (
    <div>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-900">Media Library</h3>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer text-sm text-blue-600 hover:underline">
                  Upload new
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files[0]) uploadMutation.mutate(e.target.files[0])
                    }}
                  />
                </label>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
              </div>
            </div>
            <div className="px-4 py-2 border-b">
              <input
                type="text"
                placeholder="Search by filename…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-5 gap-3 flex-1">
              {isLoading && <p className="col-span-5 text-center text-gray-400 py-8">Loading…</p>}
              {filtered.map(m => (
                <div key={m.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`w-full relative rounded overflow-hidden border-2 transition-all ${
                      selectedIds.includes(m.id) ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                    {selectedIds.includes(m.id) && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                        <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">✓</span>
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(m.url)}
                    className="absolute bottom-1 right-1 bg-black/50 text-white rounded px-1 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ⤢
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t flex justify-end">
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
