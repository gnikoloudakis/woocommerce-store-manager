import { useState, useMemo, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchCategories, createCategory, updateCategory, deleteCategory } from '../api/client'
import toast from 'react-hot-toast'

const INDENT = 28 // px per depth level

// ── tree helpers ─────────────────────────────────────────────────────────────

function flattenTree(cats, parentId = 0, depth = 0) {
  return cats
    .filter(c => c.parent === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(c => [{ ...c, depth }, ...flattenTree(cats, c.id, depth + 1)])
}

function getProjection(flat, activeId, overId, deltaX) {
  const overIdx   = flat.findIndex(i => i.id === overId)
  const activeIdx = flat.findIndex(i => i.id === activeId)
  if (overIdx === -1 || activeIdx === -1) return null

  const before  = flat[overIdx - 1]
  const after   = flat[overIdx + 1]

  const depthDelta  = Math.round(deltaX / INDENT)
  const rawDepth    = flat[activeIdx].depth + depthDelta
  const maxDepth    = before ? before.depth + 1 : 0
  const minDepth    = after  ? after.depth      : 0
  const depth       = Math.max(minDepth, Math.min(maxDepth, rawDepth))

  // Walk backwards from overIdx to find the parent at (depth - 1)
  let parent = 0
  if (depth > 0) {
    for (let i = overIdx - 1; i >= 0; i--) {
      if (flat[i].id === activeId) continue
      if (flat[i].depth === depth - 1) { parent = flat[i].id; break }
      if (flat[i].depth < depth - 1)   break
    }
  }

  return { depth, parent }
}

function isAncestor(flat, nodeId, potentialAncestorId) {
  let current = flat.find(i => i.id === nodeId)
  while (current && current.parent !== 0) {
    if (current.parent === potentialAncestorId) return true
    current = flat.find(i => i.id === current.parent)
  }
  return false
}

// ── row component ─────────────────────────────────────────────────────────────

function CategoryRow({ item, dragDepth, onSave, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(item.name)

  const depth = dragDepth !== undefined ? dragDepth : item.depth

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white group"
    >
      {/* indentation */}
      <span style={{ width: depth * INDENT }} className="shrink-0" />

      {/* drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing text-lg leading-none select-none"
        tabIndex={-1}
      >
        ⠿
      </button>

      {/* folder icon */}
      <span className="shrink-0 text-gray-400 text-sm">{item.depth === 0 ? '📁' : '📂'}</span>

      {/* name */}
      {editing ? (
        <form
          className="flex-1 flex items-center gap-2"
          onSubmit={e => { e.preventDefault(); onSave(item.id, { name: draft }, () => setEditing(false)) }}
        >
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setDraft(item.name); setEditing(false) } }}
            className="flex-1 border border-blue-400 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button type="submit" className="text-xs text-blue-600 hover:underline font-medium">Save</button>
          <button type="button" onClick={() => { setDraft(item.name); setEditing(false) }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        </form>
      ) : (
        <span
          className="flex-1 text-sm text-gray-800 cursor-text"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to rename"
        >
          {item.name}
        </span>
      )}

      {/* meta */}
      <span className="shrink-0 text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full hidden sm:block">
        {item.count ?? 0} products
      </span>
      <span className="shrink-0 text-[11px] text-gray-400 font-mono hidden md:block w-36 truncate">{item.slug}</span>

      {/* actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ── drag overlay clone ────────────────────────────────────────────────────────

function DragClone({ item, depth }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 bg-white border-2 border-blue-400 rounded-lg shadow-xl opacity-95"
      style={{ paddingLeft: depth * INDENT + 12 }}
    >
      <span className="text-gray-300 text-lg leading-none">⠿</span>
      <span className="text-sm">{item.depth === 0 ? '📁' : '📂'}</span>
      <span className="text-sm font-medium text-gray-800">{item.name}</span>
    </div>
  )
}

// ── add form ──────────────────────────────────────────────────────────────────

function AddCategoryForm({ flat, onCreate, onCancel }) {
  const [name,   setName]   = useState('')
  const [parent, setParent] = useState(0)

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate({ name: name.trim(), parent })
    setName('')
    setParent(0)
  }

  return (
    <form onSubmit={submit} className="bg-white border border-blue-200 rounded-lg p-4 flex flex-wrap gap-3 items-end shadow-sm">
      <div className="flex-1 min-w-40">
        <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New category name"
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Parent</label>
        <select
          value={parent}
          onChange={e => setParent(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value={0}>— None (top level)</option>
          {flat.map(c => (
            <option key={c.id} value={c.id}>
              {'  '.repeat(c.depth)}{c.depth > 0 ? '↳ ' : ''}{c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Create
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const qc = useQueryClient()
  const deltaXRef = useRef(0)

  const [activeId,   setActiveId]   = useState(null)
  const [overId,     setOverId]     = useState(null)
  const [projected,  setProjected]  = useState(null)
  const [showAdd,    setShowAdd]    = useState(false)

  const { data: rawCats = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const flat = useMemo(() => flattenTree(rawCats), [rawCats])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => updateCategory(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Saved') },
    onError:   () => toast.error('Save failed'),
  })

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category created'); setShowAdd(false) },
    onError:   () => toast.error('Create failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Deleted') },
    onError:   () => toast.error('Delete failed'),
  })

  function handleDragStart({ active }) {
    setActiveId(active.id)
    deltaXRef.current = 0
  }

  function handleDragMove({ delta, over }) {
    deltaXRef.current = delta.x
    const oid = over?.id ?? overId
    if (activeId && oid) setProjected(getProjection(flat, activeId, oid, delta.x))
  }

  function handleDragOver({ over }) {
    setOverId(over?.id ?? null)
    if (activeId && over?.id) setProjected(getProjection(flat, activeId, over.id, deltaXRef.current))
  }

  function handleDragEnd({ active, over }) {
    if (over && active.id !== over.id && projected) {
      const activeItem = flat.find(i => i.id === active.id)
      // Prevent dropping into own subtree
      if (activeItem && !isAncestor(flat, projected.parent, active.id) && projected.parent !== active.id) {
        if (activeItem.parent !== projected.parent) {
          saveMutation.mutate({ id: active.id, data: { parent: projected.parent } })
        }
      }
    }
    setActiveId(null)
    setOverId(null)
    setProjected(null)
    deltaXRef.current = 0
  }

  function handleDragCancel() {
    setActiveId(null)
    setOverId(null)
    setProjected(null)
  }

  function handleDelete(item) {
    const childCount = rawCats.filter(c => c.parent === item.id).length
    const msg = childCount > 0
      ? `"${item.name}" has ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'}. Deleting it will move them to the top level. Continue?`
      : `Delete "${item.name}"?`
    if (window.confirm(msg)) deleteMutation.mutate(item.id)
  }

  const activeItem = activeId ? flat.find(i => i.id === activeId) : null
  const projectedDepth = projected?.depth ?? activeItem?.depth ?? 0

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <NavLink to="/products" end className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Products</NavLink>
        <NavLink to="/categories"   className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Categories</NavLink>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          {!isLoading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {rawCats.length} categories · {rawCats.filter(c => c.parent === 0).length} top-level
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Category
        </button>
      </div>

      {showAdd && (
        <AddCategoryForm
          flat={flat}
          onCreate={data => createMutation.mutate(data)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Tree */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* column headers */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <span className="flex-1 pl-14">Name</span>
          <span className="hidden sm:block w-24 text-right pr-2">Products</span>
          <span className="hidden md:block w-36">Slug</span>
          <span className="w-28" />
        </div>

        {isLoading && <div className="py-16 text-center text-gray-400">Loading…</div>}
        {!isLoading && flat.length === 0 && (
          <div className="py-16 text-center text-gray-400">No categories yet.</div>
        )}

        {!isLoading && flat.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={flat.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {flat.map(item => (
                <CategoryRow
                  key={item.id}
                  item={item}
                  dragDepth={activeId === item.id ? projectedDepth : undefined}
                  onSave={(id, data, done) => saveMutation.mutate({ id, data }, { onSuccess: done })}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeItem && <DragClone item={activeItem} depth={projectedDepth} />}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Drag ⠿ to move · slide <strong>left/right while dragging</strong> to change parent · double-click or hover to rename
      </p>
    </div>
  )
}
