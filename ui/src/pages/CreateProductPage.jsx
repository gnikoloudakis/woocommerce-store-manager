import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createProduct } from '../api/client'
import ProductForm from '../components/ProductForm'
import toast from 'react-hot-toast'

export default function CreateProductPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: (product) => {
      toast.success(`"${product.name}" created successfully`)
      qc.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
    onError: (err) => {
      const detail = err.response?.data?.detail ?? 'Creation failed'
      toast.error(detail)
    },
  })

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
        <p className="text-sm text-gray-500 mt-1">Create a new product in WooCommerce</p>
      </div>
      <ProductForm
        onSubmit={mutation.mutate}
        submitLabel="Create Product"
        isLoading={mutation.isPending}
      />
    </div>
  )
}
