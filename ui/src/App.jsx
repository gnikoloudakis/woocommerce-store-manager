import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import ProductsPage from './pages/ProductsPage'
import CreateProductPage from './pages/CreateProductPage'
import EditProductPage from './pages/EditProductPage'
import BulkImportPage from './pages/BulkImportPage'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-gray-900 text-lg">WooCommerce Manager</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`
          }
        >
          Products
        </NavLink>
        <NavLink
          to="/create"
          className={({ isActive }) =>
            `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`
          }
        >
          + New Product
        </NavLink>
        <NavLink
          to="/bulk"
          className={({ isActive }) =>
            `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'}`
          }
        >
          Bulk Import
        </NavLink>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ProductsPage />} />
          <Route path="/create" element={<CreateProductPage />} />
          <Route path="/edit/:id" element={<EditProductPage />} />
          <Route path="/bulk" element={<BulkImportPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
