import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import DashboardPage    from './pages/DashboardPage'
import ProductsPage     from './pages/ProductsPage'
import CreateProductPage from './pages/CreateProductPage'
import EditProductPage  from './pages/EditProductPage'
import BulkImportPage   from './pages/BulkImportPage'
import OrdersPage       from './pages/OrdersPage'
import OrderDetailPage  from './pages/OrderDetailPage'
import CouponsPage      from './pages/CouponsPage'
import ImportsExportsPage from './pages/ImportsExportsPage'
import TaxonomyPage      from './pages/TaxonomyPage'
import CategoriesPage    from './pages/CategoriesPage'
import { SiteProvider, useSite } from './context/SiteContext'

function SiteSelector() {
  const { activeSite, sites, setSite } = useSite()
  if (sites.length <= 1) return null
  return (
    <select
      value={activeSite || ''}
      onChange={e => setSite(e.target.value)}
      className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      {sites.map(s => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  )
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-gray-900 text-lg shrink-0">WooCommerce Manager</span>
        <NavLink to="/" end
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Dashboard
        </NavLink>
        <NavLink to="/products"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Products
        </NavLink>
        <NavLink to="/orders"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Orders
        </NavLink>
        <NavLink to="/coupons"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Coupons
        </NavLink>
        <NavLink to="/create"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          + New Product
        </NavLink>
        <NavLink to="/bulk"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Bulk Import
        </NavLink>
        <NavLink to="/taxonomy"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Taxonomy
        </NavLink>
        <NavLink to="/imports-exports"
          className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
          Migration
        </NavLink>
        <SiteSelector />
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

function AppRoutes() {
  const { activeSite } = useSite()
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.clear()
  }, [activeSite])

  return (
    <Routes key={activeSite}>
      <Route path="/"               element={<DashboardPage />} />
      <Route path="/products"       element={<ProductsPage />} />
      <Route path="/create"         element={<CreateProductPage />} />
      <Route path="/edit/:id"       element={<EditProductPage />} />
      <Route path="/bulk"           element={<BulkImportPage />} />
      <Route path="/orders"         element={<OrdersPage />} />
      <Route path="/orders/:id"     element={<OrderDetailPage />} />
      <Route path="/coupons"        element={<CouponsPage />} />
      <Route path="/categories"        element={<CategoriesPage />} />
      <Route path="/taxonomy"         element={<TaxonomyPage />} />
      <Route path="/imports-exports" element={<ImportsExportsPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </SiteProvider>
    </BrowserRouter>
  )
}
