import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchTags, createTag, updateTag, deleteTag,
  fetchAttributes, createAttribute, updateAttribute, deleteAttribute,
  fetchAttributeTerms, createAttributeTerm, updateAttributeTerm, deleteAttributeTerm,
} from '../api/client'

// ── shared inline-edit row ──────────────────────────────────────────────────

function EditableRow({ item, fields, onSave, onDelete, saving, extraAction }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(f => [f.key, item[f.key] ?? ''])))

  function save() {
    onSave(item.id, form, () => setEditing(false))
  }

  if (!editing) {
    return (
      <tr className="hover:bg-gray-50 group">
        {fields.map(f => (
          <td key={f.key} className="px-4 py-2.5 text-sm text-gray-700">
            {f.render ? f.render(item[f.key], item) : (item[f.key] || <span className="text-gray-300">—</span>)}
          </td>
        ))}
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            {extraAction && <div className="opacity-0 group-hover:opacity-100 transition-opacity">{extraAction}</div>}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
              <button onClick={() => onDelete(item.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="bg-blue-50/40">
      {fields.map(f => (
        <td key={f.key} className="px-4 py-2">
          {f.type === 'select' ? (
            <select
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus={f.autoFocus}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}
        </td>
      ))}
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <button onClick={save} disabled={saving} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </td>
    </tr>
  )
}

function AddRow({ fields, onAdd, adding }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(f => [f.key, ''])))

  function submit(e) {
    e.preventDefault()
    const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
    if (!trimmed[fields[0].key]) return
    onAdd(trimmed, () => setForm(Object.fromEntries(fields.map(f => [f.key, '']))))
  }

  return (
    <tr className="bg-gray-50/60">
      {fields.map(f => (
        <td key={f.key} className="px-4 py-2">
          {f.type === 'select' ? (
            <select
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={form[f.key]}
              placeholder={f.placeholder || `New ${f.label}…`}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submit(e) }}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}
        </td>
      ))}
      <td className="px-4 py-2 text-right">
        <button
          onClick={submit}
          disabled={adding || !form[fields[0].key].trim()}
          className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </td>
    </tr>
  )
}

// ── Categories tab ──────────────────────────────────────────────────────────

function CategoriesTab() {
  const qc = useQueryClient()
  const { data: cats = [], isLoading } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const addMut = useMutation({
    mutationFn: (data) => createCategory(data),
    onSuccess: (newCat) => {
      qc.setQueryData(['categories'], (old = []) => [...old, newCat])
      toast.success('Category created')
    },
    onError: () => toast.error('Failed to create category'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, data }) => updateCategory(id, data),
    onSuccess: (updated) => {
      qc.setQueryData(['categories'], (old = []) => old.map(c => c.id === updated.id ? updated : c))
      toast.success('Category updated')
    },
    onError: () => toast.error('Failed to update category'),
  })

  const delMut = useMutation({
    mutationFn: (id) => deleteCategory(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['categories'], (old = []) => old.filter(c => c.id !== id))
      toast.success('Category deleted')
    },
    onError: () => toast.error('Failed to delete category'),
  })

  const parentOptions = [{ value: '0', label: '(none)' }, ...cats.map(c => ({ value: String(c.id), label: c.name }))]

  const fields = [
    { key: 'name', label: 'Name', autoFocus: true, placeholder: 'Category name…' },
    { key: 'slug', label: 'Slug', placeholder: 'slug (auto)' },
    {
      key: 'parent', label: 'Parent', type: 'select',
      options: parentOptions,
      render: (val) => {
        if (!val || val === 0) return <span className="text-gray-300 text-xs">—</span>
        const parent = cats.find(c => c.id === val)
        return parent ? <span className="text-xs text-gray-500">{parent.name}</span> : val
      },
    },
  ]

  function confirmDelete(id) {
    const cat = cats.find(c => c.id === id)
    if (window.confirm(`Delete category "${cat?.name}"? This cannot be undone.`))
      delMut.mutate(id)
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">{cats.length} categories</p>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left w-1/3">Name</th>
              <th className="px-4 py-3 text-left w-1/3">Slug</th>
              <th className="px-4 py-3 text-left">Parent</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <AddRow
              fields={fields}
              adding={addMut.isPending}
              onAdd={(form, reset) => addMut.mutate({ name: form.name, slug: form.slug || undefined, parent: Number(form.parent) || 0 }, { onSuccess: reset })}
            />
            {isLoading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            )}
            {cats.map(c => (
              <EditableRow
                key={c.id}
                item={{ ...c, parent: c.parent }}
                fields={fields}
                saving={editMut.isPending}
                onSave={(id, form, done) => editMut.mutate({ id, data: { name: form.name, slug: form.slug || undefined, parent: Number(form.parent) || 0 } }, { onSuccess: done })}
                onDelete={confirmDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tags tab ────────────────────────────────────────────────────────────────

function TagsTab() {
  const qc = useQueryClient()
  const { data: tags = [], isLoading } = useQuery({ queryKey: ['tags'], queryFn: fetchTags })

  const addMut = useMutation({
    mutationFn: (data) => createTag(data),
    onSuccess: (newTag) => {
      qc.setQueryData(['tags'], (old = []) => [...old, newTag])
      toast.success('Tag created')
    },
    onError: () => toast.error('Failed to create tag'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, data }) => updateTag(id, data),
    onSuccess: (updated) => {
      qc.setQueryData(['tags'], (old = []) => old.map(t => t.id === updated.id ? updated : t))
      toast.success('Tag updated')
    },
    onError: () => toast.error('Failed to update tag'),
  })

  const delMut = useMutation({
    mutationFn: (id) => deleteTag(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['tags'], (old = []) => old.filter(t => t.id !== id))
      toast.success('Tag deleted')
    },
    onError: () => toast.error('Failed to delete tag'),
  })

  const fields = [
    { key: 'name', label: 'Name', autoFocus: true, placeholder: 'Tag name…' },
    { key: 'slug', label: 'Slug', placeholder: 'slug (auto)' },
    { key: 'description', label: 'Description', placeholder: 'optional' },
  ]

  function confirmDelete(id) {
    const tag = tags.find(t => t.id === id)
    if (window.confirm(`Delete tag "${tag?.name}"? This cannot be undone.`))
      delMut.mutate(id)
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">{tags.length} tags</p>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left w-1/3">Name</th>
              <th className="px-4 py-3 text-left w-1/4">Slug</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <AddRow
              fields={fields}
              adding={addMut.isPending}
              onAdd={(form, reset) => addMut.mutate({ name: form.name, slug: form.slug || undefined, description: form.description || undefined }, { onSuccess: reset })}
            />
            {isLoading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            )}
            {tags.map(t => (
              <EditableRow
                key={t.id}
                item={t}
                fields={fields}
                saving={editMut.isPending}
                onSave={(id, form, done) => editMut.mutate({ id, data: { name: form.name, slug: form.slug || undefined, description: form.description || undefined } }, { onSuccess: done })}
                onDelete={confirmDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Attribute terms panel ───────────────────────────────────────────────────

function AttributeTermsPanel({ attr }) {
  const qc = useQueryClient()
  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['attribute-terms', attr.id],
    queryFn: () => fetchAttributeTerms(attr.id),
  })

  const addMut = useMutation({
    mutationFn: (data) => createAttributeTerm(attr.id, data),
    onSuccess: (newTerm) => {
      qc.setQueryData(['attribute-terms', attr.id], (old = []) => [...old, newTerm])
      toast.success('Term created')
    },
    onError: () => toast.error('Failed to create term'),
  })

  const editMut = useMutation({
    mutationFn: ({ termId, data }) => updateAttributeTerm(attr.id, termId, data),
    onSuccess: (updated) => {
      qc.setQueryData(['attribute-terms', attr.id], (old = []) => old.map(t => t.id === updated.id ? updated : t))
      toast.success('Term updated')
    },
    onError: () => toast.error('Failed to update term'),
  })

  const delMut = useMutation({
    mutationFn: (termId) => deleteAttributeTerm(attr.id, termId),
    onSuccess: (_, termId) => {
      qc.setQueryData(['attribute-terms', attr.id], (old = []) => old.filter(t => t.id !== termId))
      toast.success('Term deleted')
    },
    onError: () => toast.error('Failed to delete term'),
  })

  const fields = [
    { key: 'name', label: 'Term', autoFocus: true, placeholder: 'e.g. Red, XL…' },
    { key: 'slug', label: 'Slug', placeholder: 'slug (auto)' },
  ]

  function confirmDelete(termId) {
    const t = terms.find(x => x.id === termId)
    if (window.confirm(`Delete term "${t?.name}"?`)) delMut.mutate(termId)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Terms for "{attr.name}"</span>
        <span className="text-xs text-gray-400">{terms.length} terms</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50/50 border-b border-gray-100 text-xs text-gray-400 uppercase">
          <tr>
            <th className="px-4 py-2 text-left w-1/2">Name</th>
            <th className="px-4 py-2 text-left">Slug</th>
            <th className="px-4 py-2 w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <AddRow
            fields={fields}
            adding={addMut.isPending}
            onAdd={(form, reset) => addMut.mutate({ name: form.name, slug: form.slug || undefined }, { onSuccess: reset })}
          />
          {isLoading && (
            <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400 text-xs">Loading…</td></tr>
          )}
          {terms.map(t => (
            <EditableRow
              key={t.id}
              item={t}
              fields={fields}
              saving={editMut.isPending}
              onSave={(id, form, done) => editMut.mutate({ termId: id, data: { name: form.name, slug: form.slug || undefined } }, { onSuccess: done })}
              onDelete={confirmDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Attributes tab ──────────────────────────────────────────────────────────

function AttributesTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(null)
  const { data: attrs = [], isLoading } = useQuery({ queryKey: ['attributes'], queryFn: fetchAttributes })

  const addMut = useMutation({
    mutationFn: (data) => createAttribute(data),
    onSuccess: (newAttr) => {
      qc.setQueryData(['attributes'], (old = []) => [...old, newAttr])
      toast.success('Attribute created')
    },
    onError: () => toast.error('Failed to create attribute'),
  })

  const editMut = useMutation({
    mutationFn: ({ id, data }) => updateAttribute(id, data),
    onSuccess: (updated) => {
      qc.setQueryData(['attributes'], (old = []) => old.map(a => a.id === updated.id ? updated : a))
      toast.success('Attribute updated')
    },
    onError: () => toast.error('Failed to update attribute'),
  })

  const delMut = useMutation({
    mutationFn: (id) => deleteAttribute(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['attributes'], (old = []) => old.filter(a => a.id !== id))
      setExpanded(null)
      toast.success('Attribute deleted')
    },
    onError: () => toast.error('Failed to delete attribute'),
  })

  const typeOptions = [
    { value: 'select', label: 'Select' },
    { value: 'text', label: 'Text' },
    { value: 'color', label: 'Color' },
    { value: 'button', label: 'Button' },
    { value: 'radio', label: 'Radio' },
  ]

  const fields = [
    { key: 'name', label: 'Name', autoFocus: true, placeholder: 'e.g. Color, Size…' },
    { key: 'slug', label: 'Slug', placeholder: 'slug (auto)' },
    { key: 'type', label: 'Type', type: 'select', options: typeOptions, render: (v) => <span className="text-xs text-gray-500 capitalize">{v || 'select'}</span> },
  ]

  function confirmDelete(id) {
    const a = attrs.find(x => x.id === id)
    if (window.confirm(`Delete attribute "${a?.name}" and all its terms? This cannot be undone.`))
      delMut.mutate(id)
  }

  function toggleExpand(id) {
    setExpanded(prev => prev === id ? null : id)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{attrs.length} attributes</p>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left w-1/3">Name</th>
              <th className="px-4 py-3 text-left w-1/4">Slug</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 w-36" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <AddRow
              fields={fields}
              adding={addMut.isPending}
              onAdd={(form, reset) => addMut.mutate({ name: form.name, slug: form.slug || undefined, type: form.type || 'select' }, { onSuccess: reset })}
            />
            {isLoading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            )}
            {attrs.map(a => (
              <>
                <EditableRow
                  key={a.id}
                  item={{ ...a, type: a.type || 'select' }}
                  fields={fields}
                  saving={editMut.isPending}
                  onSave={(id, form, done) => editMut.mutate({ id, data: { name: form.name, slug: form.slug || undefined, type: form.type } }, { onSuccess: done })}
                  onDelete={confirmDelete}
                  extraAction={
                    <button
                      onClick={() => toggleExpand(a.id)}
                      className="text-xs text-gray-500 hover:text-gray-800 font-medium"
                    >
                      {expanded === a.id ? 'Hide terms' : 'Terms'}
                    </button>
                  }
                />
                {expanded === a.id && (
                  <tr key={`terms-${a.id}`}>
                    <td colSpan={4} className="px-4 py-3 bg-gray-50/40">
                      <AttributeTermsPanel attr={a} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

const TABS = ['Categories', 'Tags', 'Attributes']

export default function TaxonomyPage() {
  const [tab, setTab] = useState('Categories')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Taxonomy</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage product categories, tags, and attributes.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Categories' && <CategoriesTab />}
      {tab === 'Tags' && <TagsTab />}
      {tab === 'Attributes' && <AttributesTab />}
    </div>
  )
}
