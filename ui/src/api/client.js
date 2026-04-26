import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Products
export const fetchProducts = (params) => api.get('/products', { params }).then(r => r.data)
export const fetchProduct = (id) => api.get(`/products/${id}`).then(r => r.data)
export const createProduct = (data) => api.post('/products', data).then(r => r.data)
export const updateProduct = (id, data) => api.put(`/products/${id}`, data).then(r => r.data)
export const deleteProduct = (id) => api.delete(`/products/${id}`).then(r => r.data)

// Variations
export const fetchVariations = (productId) => api.get(`/products/${productId}/variations`).then(r => r.data)
export const createVariation = (productId, data) => api.post(`/products/${productId}/variations`, data).then(r => r.data)
export const updateVariation = (productId, varId, data) => api.put(`/products/${productId}/variations/${varId}`, data).then(r => r.data)
export const deleteVariation = (productId, varId) => api.delete(`/products/${productId}/variations/${varId}`).then(r => r.data)

// Meta
export const fetchCategories = () => api.get('/products/categories').then(r => r.data)
export const fetchTags = () => api.get('/products/tags').then(r => r.data)

// Bulk import
export const bulkCreateProducts = (items) => api.post('/products/bulk', items).then(r => r.data)

// Secret tags
export const fetchSecretTags = (productId) => api.get(`/products/${productId}/secret-tags`).then(r => r.data.tags)
export const setSecretTags = (productId, tags) => api.post(`/products/${productId}/secret-tags`, { tags }).then(r => r.data)

// Media
export const fetchMedia = () => api.get('/media').then(r => r.data)
export const uploadMedia = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/media', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}
