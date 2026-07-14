import { useState, useRef, useEffect } from 'react'
import { fetchBlogSites, exportBlogPosts, importBlogPosts } from '../api/client'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  created: { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Created' },
  updated: { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'Updated' },
  skipped: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', label: 'Skipped' },
  error:   { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700',       label: 'Error'   },
}

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
        {sites.map(s => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function BlogMigrationPage() {
  const [sites, setSites]                   = useState([])
  const [source, setSource]                 = useState('cranky_gr')
  const [target, setTarget]                 = useState('cranky_cranky_gr')
  const [posts, setPosts]                   = useState(null)
  const [overwrite, setOverwrite]           = useState(false)
  const [exportLoading, setExportLoading]   = useState(false)
  const [importLoading, setImportLoading]   = useState(false)
  const [results, setResults]               = useState(null)
  const fileRef = useRef()

  const isWorking = exportLoading || importLoading

  useEffect(() => {
    fetchBlogSites()
      .then(setSites)
      .catch(() => {})
  }, [])

  function handleSourceChange(val) {
    setSource(val)
    if (val === target) setTarget(sites.find(s => s.id !== val)?.id ?? target)
    setPosts(null)
    setResults(null)
  }

  function handleTargetChange(val) {
    setTarget(val)
    if (val === source) setSource(sites.find(s => s.id !== val)?.id ?? source)
    setResults(null)
  }

  async function handleExport() {
    setExportLoading(true)
    setPosts(null)
    setResults(null)
    try {
      const data = await exportBlogPosts(source)
      setPosts(data.posts)
      toast.success(`Exported ${data.count} posts`)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  function handleDownload() {
    const blob = new Blob([JSON.stringify(posts, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'blog_export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        const list   = Array.isArray(parsed) ? parsed : parsed.posts
        setPosts(list)
        setResults(null)
        toast.success(`Loaded ${list?.length ?? 0} posts from file`)
      } catch {
        toast.error('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!posts?.length) return
    setImportLoading(true)
    setResults(null)
    try {
      const data = await importBlogPosts(target, posts, overwrite)
      setResults(data)
      const parts = []
      if (data.created) parts.push(`${data.created} created`)
      if (data.updated) parts.push(`${data.updated} updated`)
      if (data.skipped) parts.push(`${data.skipped} skipped`)
      if (data.errors)  parts.push(`${data.errors} failed`)
      if (data.errors === 0) toast.success(parts.join(', ') || 'Nothing to do')
      else toast.error(parts.join(', '))
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Import failed')
    } finally {
      setImportLoading(false)
    }
  }

  const sourceLabel = sites.find(s => s.id === source)?.label ?? source
  const targetLabel = sites.find(s => s.id === target)?.label ?? target

  return (
    <div className="max-w-4xl space-y-6">

      {/* Loading overlay */}
      {isWorking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 w-72">
            <svg className="animate-spin h-10 w-10 text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-900 font-semibold text-lg">
              {exportLoading ? 'Fetching posts…' : 'Importing posts…'}
            </p>
            <p className="text-gray-500 text-sm text-center">This may take a moment.</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Blog Migration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Export posts from one site and import them into another.
          Categories and tags are created automatically if they don't exist on the target.
        </p>
      </div>

      {/* Site selectors */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Sites</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <SiteSelect
            label="Export from"
            value={source}
            onChange={handleSourceChange}
            sites={sites}
            disabled={isWorking || sites.length === 0}
          />

          {/* Arrow */}
          <div className="pb-2 text-gray-400 text-lg select-none">→</div>

          <SiteSelect
            label="Import to"
            value={target}
            onChange={handleTargetChange}
            sites={sites}
            disabled={isWorking || sites.length === 0}
          />

          {source === target && (
            <p className="text-xs text-red-500 pb-2">Source and target must be different.</p>
          )}
        </div>
      </section>

      {/* Step 1 — Export */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 1 — Export</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Fetch all posts (including drafts) from <span className="font-medium text-gray-700">{sourceLabel}</span>
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current.click()}
              disabled={isWorking}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600 disabled:opacity-50"
            >
              Load JSON…
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleUpload} />
            <button
              type="button"
              onClick={handleExport}
              disabled={isWorking || source === target}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export posts
            </button>
          </div>
        </div>

        {posts && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-600 font-medium">{posts.length} post{posts.length !== 1 ? 's' : ''} ready</p>
              <button
                type="button"
                onClick={handleDownload}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
              >
                Download JSON
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {posts.map((p, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.title?.rendered || p.slug}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.slug}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.status === 'publish' ? 'bg-green-100 text-green-700' :
                    p.status === 'draft'   ? 'bg-gray-100 text-gray-600'   :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — Import */}
      <section className={`bg-white rounded-lg border border-gray-200 p-6 space-y-4 transition-opacity ${!posts ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Step 2 — Import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Push posts into <span className="font-medium text-gray-700">{targetLabel}</span>
              {overwrite ? ' — existing posts will be overwritten' : ' — existing slugs are skipped'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={e => setOverwrite(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
              />
              Overwrite existing
            </label>
            <button
              type="button"
              onClick={handleImport}
              disabled={!posts?.length || isWorking || source === target}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
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
            <div className="max-h-96 overflow-y-auto space-y-1.5">
              {results.results.map((r, i) => {
                const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.error
                return (
                  <div key={i} className={`flex items-start justify-between rounded-lg px-4 py-2.5 ${cfg.bg}`}>
                    <div>
                      <p className="font-mono text-xs text-gray-700">{r.slug}</p>
                      {r.id && <p className="text-xs text-gray-400">ID #{r.id}</p>}
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                      {r.warnings?.map((w, wi) => (
                        <p key={wi} className="text-xs text-yellow-700 mt-0.5">{w}</p>
                      ))}
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ml-4 ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
