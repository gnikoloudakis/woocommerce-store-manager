import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Active site — updated by SiteContext when the user changes site
let _siteId = localStorage.getItem('activeSite') || null

export function setSiteId(id) { _siteId = id }

// ?site=<id> added to every request so the backend knows which WC instance to use.
// If null the backend falls back to the first site in sites.json.
const sp  = ()      => _siteId ? { site: _siteId } : {}
const cfg = (extra) => ({ params: sp(), ...extra })

// Sites
export const fetchSites = () => api.get('/sites').then(r => r.data)

// Products
export const fetchProducts  = (params) => api.get('/products', { params: { ...params, ...sp() } }).then(r => r.data)
export const fetchProduct   = (id)     => api.get(`/products/${id}`, cfg()).then(r => r.data)
export const createProduct  = (data)   => api.post('/products', data, cfg()).then(r => r.data)
export const updateProduct  = (id, data) => api.put(`/products/${id}`, data, cfg()).then(r => r.data)
export const deleteProduct  = (id)     => api.delete(`/products/${id}`, cfg()).then(r => r.data)
export const relinkImages   = (id)     => api.post(`/products/${id}/relink-images`, {}, cfg()).then(r => r.data)
export const imageAudit     = ()       => api.get('/products/image-audit', cfg()).then(r => r.data)

// Variations
export const fetchVariations  = (productId)          => api.get(`/products/${productId}/variations`, cfg()).then(r => r.data)
export const createVariation  = (productId, data)    => api.post(`/products/${productId}/variations`, data, cfg()).then(r => r.data)
export const updateVariation  = (productId, varId, data) => api.put(`/products/${productId}/variations/${varId}`, data, cfg()).then(r => r.data)
export const deleteVariation  = (productId, varId)   => api.delete(`/products/${productId}/variations/${varId}`, cfg()).then(r => r.data)

// Meta
export const fetchCategories  = ()              => api.get('/products/categories', cfg()).then(r => r.data)
export const createCategory   = (data)          => api.post('/products/categories', data, cfg()).then(r => r.data)
export const updateCategory   = (id, data)      => api.put(`/products/categories/${id}`, data, cfg()).then(r => r.data)
export const deleteCategory   = (id)            => api.delete(`/products/categories/${id}`, cfg()).then(r => r.data)

export const fetchTags        = ()              => api.get('/products/tags', cfg()).then(r => r.data)
export const createTag        = (data)          => api.post('/products/tags', data, cfg()).then(r => r.data)
export const updateTag        = (id, data)      => api.put(`/products/tags/${id}`, data, cfg()).then(r => r.data)
export const deleteTag        = (id)            => api.delete(`/products/tags/${id}`, cfg()).then(r => r.data)

export const fetchAttributes       = ()                    => api.get('/products/attributes', cfg()).then(r => r.data)
export const createAttribute       = (data)                => api.post('/products/attributes', data, cfg()).then(r => r.data)
export const updateAttribute       = (id, data)            => api.put(`/products/attributes/${id}`, data, cfg()).then(r => r.data)
export const deleteAttribute       = (id)                  => api.delete(`/products/attributes/${id}`, cfg()).then(r => r.data)
export const fetchAttributeTerms   = (attrId)              => api.get(`/products/attributes/${attrId}/terms`, cfg()).then(r => r.data)
export const createAttributeTerm   = (attrId, data)        => api.post(`/products/attributes/${attrId}/terms`, data, cfg()).then(r => r.data)
export const updateAttributeTerm   = (attrId, termId, data) => api.put(`/products/attributes/${attrId}/terms/${termId}`, data, cfg()).then(r => r.data)
export const deleteAttributeTerm   = (attrId, termId)      => api.delete(`/products/attributes/${attrId}/terms/${termId}`, cfg()).then(r => r.data)

// Orders
export const fetchOrders       = (params) => api.get('/orders', { params: { ...params, ...sp() } }).then(r => r.data)
export const fetchOrder        = (id)     => api.get(`/orders/${id}`, cfg()).then(r => r.data)
export const updateOrderStatus = (id, status) => api.put(`/orders/${id}/status`, { status }, cfg()).then(r => r.data)
export const fetchOrderNotes   = (id)     => api.get(`/orders/${id}/notes`, cfg()).then(r => r.data)
export const addOrderNote      = (id, note, customer_note = false) => api.post(`/orders/${id}/notes`, { note, customer_note }, cfg()).then(r => r.data)

// Coupons
export const fetchCoupons  = (params) => api.get('/coupons', { params: { ...params, ...sp() } }).then(r => r.data)
export const fetchCoupon   = (id)     => api.get(`/coupons/${id}`, cfg()).then(r => r.data)
export const createCoupon  = (data)   => api.post('/coupons', data, cfg()).then(r => r.data)
export const updateCoupon  = (id, data) => api.put(`/coupons/${id}`, data, cfg()).then(r => r.data)
export const deleteCoupon  = (id)     => api.delete(`/coupons/${id}`, cfg()).then(r => r.data)

// BOX NOW
export const fetchBoxNowVoucher  = (orderId) => api.get(`/orders/${orderId}/boxnow`, cfg()).then(r => r.data)
export const createBoxNowVoucher = (orderId) => api.post(`/orders/${orderId}/boxnow`, {}, cfg()).then(r => r.data)
export const cancelBoxNowVoucher = (orderId) => api.delete(`/orders/${orderId}/boxnow`, cfg()).then(r => r.data)
export const trackBoxNowParcel   = (orderId) => api.get(`/orders/${orderId}/boxnow/track`, cfg()).then(r => r.data)

// Dashboard
export const fetchDashboardOverview = ()                         => api.get('/dashboard/overview', cfg()).then(r => r.data)
export const fetchTopSellers        = (limit = 10)               => api.get('/dashboard/top-sellers', { params: { limit, ...sp() } }).then(r => r.data)
export const fetchByCategory        = ()                         => api.get('/dashboard/by-category', cfg()).then(r => r.data)
export const fetchByTag             = ()                         => api.get('/dashboard/by-tag', cfg()).then(r => r.data)
export const fetchBySecretTag       = ()                         => api.get('/dashboard/by-secret-tag', cfg()).then(r => r.data)
export const fetchOutOfStock        = ()                         => api.get('/dashboard/out-of-stock', cfg()).then(r => r.data)
export const fetchOrdersOverview    = (period = 'month', compare = true) => api.get('/dashboard/orders/overview', { params: { period, compare, ...sp() } }).then(r => r.data)
export const fetchNeedsAttention    = ()                         => api.get('/dashboard/needs-attention', cfg()).then(r => r.data)
export const fetchOrdersHeatmap     = (days = 90)                => api.get('/dashboard/orders/heatmap', { params: { days, ...sp() } }).then(r => r.data)
export const fetchTopCustomers      = (period = 'month', limit = 10) => api.get('/dashboard/customers/top', { params: { period, limit, ...sp() } }).then(r => r.data)
export const fetchOrdersSparkline   = (days = 30)                => api.get('/dashboard/orders/sparkline', { params: { days, ...sp() } }).then(r => r.data)
export const fetchInventoryStats    = ()                         => api.get('/dashboard/inventory/stats', cfg()).then(r => r.data)
export const fetchRecentOrders      = (limit = 10)               => api.get('/dashboard/orders/recent', { params: { limit, ...sp() } }).then(r => r.data)
export const fetchSalesTrend        = (period = 'month')         => api.get('/dashboard/orders/sales-trend', { params: { period, ...sp() } }).then(r => r.data)
export const fetchMonthlyTrend      = (months = 12)              => api.get('/dashboard/orders/monthly-trend', { params: { months, ...sp() } }).then(r => r.data)

// Bulk import
export const bulkCreateProducts = (items) => api.post('/products/bulk', items, cfg()).then(r => r.data)

// Imports / Exports (blog, media — these use their own source/target params, not the global site)
export const fetchBlogSites   = () => api.get('/blog/sites').then(r => r.data)
export const exportBlogPosts  = (source) => api.post('/blog/export', { source }).then(r => r.data)
export const importBlogPosts  = (target, posts, overwrite = false, source = '') => api.post('/blog/import', { target, posts, overwrite, source }).then(r => r.data)
export const exportMedia      = (source) => api.post('/media/export', { source }).then(r => r.data)
export const importMediaItem  = (target, item, overwrite = false) =>
  api.post('/media/import', { target, items: [item], overwrite }, { timeout: 120_000 }).then(r => r.data)

// WooCommerce product migration
export const syncWCTaxonomy    = (source, target) => api.post('/wc/sync-taxonomy', { source, target }, { timeout: 120_000 }).then(r => r.data)
export const exportWCProducts  = (source, page = 1) => api.post('/wc/export', { source, page }, { timeout: 120_000 }).then(r => r.data)
export const exportWCVariations = (source, product_id) => api.post('/wc/export-variations', { source, product_id }, { timeout: 120_000 }).then(r => r.data)
export const fetchWCSkuMap     = (source) => api.post('/wc/sku-map', { source }, { timeout: 120_000 }).then(r => r.data)
export const importWCProductOne = (target, product, overwrite = false, media_map = {}, include_fields = [], existing_id = null) =>
  api.post('/wc/import-one', { target, product, overwrite, media_map, include_fields, existing_id }, { timeout: 120_000 }).then(r => r.data)

// WooCommerce coupons migration
export const exportWCCoupons       = (source, search = '') =>
  api.post('/wc/export-coupons', { source, search }, { timeout: 60_000 }).then(r => r.data)
export const fetchWCCouponCodeMap  = (target) => api.post('/wc/coupon-code-map', { target }, { timeout: 60_000 }).then(r => r.data)
export const importWCCoupon        = (target, coupon, overwrite = false, existing_id = null) =>
  api.post('/wc/import-coupon', { target, coupon, overwrite, existing_id }, { timeout: 30_000 }).then(r => r.data)

// WooCommerce orders migration
export const exportWCOrders      = (source, page = 1, per_page = 50, status = 'any', after = '', before = '') =>
  api.post('/wc/export-orders', { source, page, per_page, status, after, before }, { timeout: 60_000 }).then(r => r.data)
export const fetchWCOrderIdMap   = (target) => api.post('/wc/order-id-map', { target }, { timeout: 120_000 }).then(r => r.data)
export const importWCOrder       = (target, order, overwrite = false, existing_id = null, sku_map = {}, name_map = {}) =>
  api.post('/wc/import-order', { target, order, overwrite, existing_id, sku_map, name_map }, { timeout: 60_000 }).then(r => r.data)

// WooCommerce tax migration
export const exportWCTaxes  = (source) =>
  api.post('/wc/export-taxes', { source }, { timeout: 60_000 }).then(r => r.data)
export const importWCTaxes  = (target, classes, rates, overwrite = false) =>
  api.post('/wc/import-taxes', { target, classes, rates, overwrite }, { timeout: 60_000 }).then(r => r.data)

// WooCommerce shipping migration
export const exportWCShipping  = (source) =>
  api.post('/wc/export-shipping', { source }, { timeout: 60_000 }).then(r => r.data)
export const importWCShipping  = (target, zones, overwrite = false) =>
  api.post('/wc/import-shipping', { target, zones, overwrite }, { timeout: 60_000 }).then(r => r.data)

// WooCommerce store settings migration
export const exportWCStoreSettings = (source) =>
  api.post('/wc/export-store-settings', { source }, { timeout: 60_000 }).then(r => r.data)
export const importWCStoreSettings  = (target, groups) =>
  api.post('/wc/import-store-settings', { target, groups }, { timeout: 60_000 }).then(r => r.data)

// WooCommerce email settings migration
export const exportWCEmailSettings = (source) =>
  api.post('/wc/export-email-settings', { source }, { timeout: 60_000 }).then(r => r.data)
export const importWCEmailSettings  = (target, groups) =>
  api.post('/wc/import-email-settings', { target, groups }, { timeout: 60_000 }).then(r => r.data)

// WooCommerce customers migration
export const exportWCCustomers      = (source, page = 1, per_page = 50, search = '', role = 'customer') =>
  api.post('/wc/export-customers', { source, page, per_page, search, role }, { timeout: 60_000 }).then(r => r.data)
export const fetchWCCustomerEmailMap = (target) => api.post('/wc/customer-email-map', { target }, { timeout: 120_000 }).then(r => r.data)
export const importWCCustomer       = (target, customer, overwrite = false) =>
  api.post('/wc/import-customer', { target, customer, overwrite }, { timeout: 60_000 }).then(r => r.data)

// Secret tags
export const fetchSecretTags = (productId) => api.get(`/products/${productId}/secret-tags`, cfg()).then(r => r.data.tags)
export const setSecretTags   = (productId, tags) => api.post(`/products/${productId}/secret-tags`, { tags }, cfg()).then(r => r.data)

// Media
export const fetchMedia  = () => api.get('/media', cfg()).then(r => r.data)
export const uploadMedia = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/media', form, { params: sp(), headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}
