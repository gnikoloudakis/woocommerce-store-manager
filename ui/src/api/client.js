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

// Orders
export const fetchOrders          = (params) => api.get('/orders', { params }).then(r => r.data)
export const fetchOrder           = (id) => api.get(`/orders/${id}`).then(r => r.data)
export const updateOrderStatus    = (id, status) => api.put(`/orders/${id}/status`, { status }).then(r => r.data)
export const fetchOrderNotes      = (id) => api.get(`/orders/${id}/notes`).then(r => r.data)
export const addOrderNote         = (id, note, customer_note = false) => api.post(`/orders/${id}/notes`, { note, customer_note }).then(r => r.data)

// Coupons
export const fetchCoupons       = (params) => api.get('/coupons', { params }).then(r => r.data)
export const fetchCoupon        = (id) => api.get(`/coupons/${id}`).then(r => r.data)
export const createCoupon       = (data) => api.post('/coupons', data).then(r => r.data)
export const updateCoupon       = (id, data) => api.put(`/coupons/${id}`, data).then(r => r.data)
export const deleteCoupon       = (id) => api.delete(`/coupons/${id}`).then(r => r.data)

// BOX NOW
export const fetchBoxNowVoucher   = (orderId) => api.get(`/orders/${orderId}/boxnow`).then(r => r.data)
export const createBoxNowVoucher  = (orderId) => api.post(`/orders/${orderId}/boxnow`).then(r => r.data)
export const cancelBoxNowVoucher  = (orderId) => api.delete(`/orders/${orderId}/boxnow`).then(r => r.data)
export const trackBoxNowParcel    = (orderId) => api.get(`/orders/${orderId}/boxnow/track`).then(r => r.data)

// Dashboard
export const fetchDashboardOverview   = () => api.get('/dashboard/overview').then(r => r.data)
export const fetchTopSellers          = (limit = 10) => api.get('/dashboard/top-sellers', { params: { limit } }).then(r => r.data)
export const fetchByCategory          = () => api.get('/dashboard/by-category').then(r => r.data)
export const fetchByTag               = () => api.get('/dashboard/by-tag').then(r => r.data)
export const fetchBySecretTag         = () => api.get('/dashboard/by-secret-tag').then(r => r.data)
export const fetchOutOfStock          = () => api.get('/dashboard/out-of-stock').then(r => r.data)
export const fetchOrdersOverview      = (period = 'month') => api.get('/dashboard/orders/overview', { params: { period } }).then(r => r.data)
export const fetchRecentOrders        = (limit = 10) => api.get('/dashboard/orders/recent', { params: { limit } }).then(r => r.data)
export const fetchSalesTrend          = (period = 'month') => api.get('/dashboard/orders/sales-trend', { params: { period } }).then(r => r.data)
export const fetchMonthlyTrend        = (months = 12) => api.get('/dashboard/orders/monthly-trend', { params: { months } }).then(r => r.data)

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
