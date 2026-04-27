import { useState, useEffect } from 'react'

// urls: string[] (one or many). startIndex: which image to show first.
export default function Lightbox({ urls, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const total = urls.length
  const url = urls[index]

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && total > 1) setIndex(i => (i + 1) % total)
      if (e.key === 'ArrowLeft'  && total > 1) setIndex(i => (i - 1 + total) % total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, total])

  if (!url) return null

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

      {total > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setIndex(i => (i - 1 + total) % total) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl"
          >
            ‹
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIndex(i => (i + 1) % total) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
            {index + 1} / {total}
          </div>
        </>
      )}

      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
      >
        ×
      </button>
    </div>
  )
}
