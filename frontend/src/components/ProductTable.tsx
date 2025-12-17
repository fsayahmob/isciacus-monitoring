/**
 * ProductTable Component - ISCIACUS Monitoring Dashboard
 * =======================================================
 */

import { useCallback } from 'react'

import { STOCK_LEVEL_COLORS, MARGIN_THRESHOLDS } from '../constants'
import { useProducts } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'
import type { Product, SortField, StockLevel } from '../types/product'

const CURRENCY_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-'
  }
  return CURRENCY_FORMATTER.format(value)
}

function getMarginClass(marginValue: number): string {
  if (isNaN(marginValue)) {
    return ''
  }
  if (marginValue >= MARGIN_THRESHOLDS.HIGH) {
    return 'text-green-600'
  }
  if (marginValue < MARGIN_THRESHOLDS.LOW) {
    return 'text-red-600'
  }
  return ''
}

function getSortIcon(isActive: boolean, sortDirection: 'asc' | 'desc'): string {
  if (!isActive) {
    return '↕'
  }
  return sortDirection === 'asc' ? '↑' : '↓'
}

function StockBadge({ stock, level }: { stock: number; level: StockLevel }): React.ReactElement {
  const colors = STOCK_LEVEL_COLORS[level]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${colors.bg} ${colors.text}`}
    >
      {colors.icon} {stock}
    </span>
  )
}

interface SortableHeaderProps {
  field: SortField
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
}

function SortableHeader({
  field,
  children,
  align = 'left',
}: SortableHeaderProps): React.ReactElement {
  const { sortField, sortDirection, setSorting } = useAppStore()
  const isActive = sortField === field

  const alignClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  }[align]

  const handleClick = useCallback((): void => {
    setSorting(field)
  }, [setSorting, field])

  return (
    <th
      className={`sortable cursor-pointer p-2 text-${align} select-none hover:bg-burgundy-dark ${isActive ? 'active' : ''}`}
      onClick={handleClick}
    >
      <span className={`flex items-center gap-1 ${alignClass}`}>
        {children}
        <span className={`sort-icon ${isActive ? 'opacity-100' : 'opacity-50'}`}>
          {getSortIcon(isActive, sortDirection)}
        </span>
      </span>
    </th>
  )
}

function ProductRow({ product }: { product: Product }): React.ReactElement {
  const { setSelectedProductId } = useAppStore()

  const marginValue = parseFloat(product.marge_pct)
  const marginClass = getMarginClass(marginValue)

  const handleClick = useCallback((): void => {
    setSelectedProductId(product.product_id)
  }, [setSelectedProductId, product.product_id])

  return (
    <tr
      className="product-row cursor-pointer border-b border-gray-200 odd:bg-white even:bg-gray-50 hover:bg-cream-dark"
      onClick={handleClick}
    >
      <td className="p-2">
        {product.image_url !== null ? (
          <img
            alt={product.titre}
            className="h-10 w-10 rounded object-cover"
            loading="lazy"
            src={product.image_url}
          />
        ) : (
          <div className="h-10 w-10 rounded bg-gray-200" />
        )}
      </td>
      <td className="max-w-[200px] truncate p-2" title={product.titre}>
        {product.titre}
      </td>
      <td className="p-2 text-xs">{product.variante}</td>
      <td className="p-2 font-mono text-xs">{product.sku}</td>
      <td className="p-2 text-center">
        <StockBadge level={product.stock_level} stock={product.stock} />
      </td>
      <td className="p-2 text-right">{formatCurrency(product.prix_ttc)}</td>
      <td className={`p-2 text-right font-medium ${marginClass}`}>
        {product.marge_pct !== '' ? product.marge_pct : '-'}
      </td>
      <td className="p-2 text-center">
        {product.publie ? (
          <span className="text-green-600">✓</span>
        ) : (
          <span className="text-red-500">✗</span>
        )}
      </td>
      <td className="max-w-[120px] truncate p-2 text-xs" title={product.channels.join(', ')}>
        {product.channels.slice(0, 2).join(', ')}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          {product.shopify_tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded bg-gray-100 px-1 text-xs">
              {tag}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

function SkeletonRow(): React.ReactElement {
  return (
    <tr className="border-b border-gray-200">
      <td className="p-2">
        <div className="skeleton h-10 w-10 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton h-4 w-32 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton h-4 w-20 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton h-4 w-24 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton mx-auto h-4 w-12 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton ml-auto h-4 w-16 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton ml-auto h-4 w-12 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton mx-auto h-4 w-6 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton h-4 w-20 rounded" />
      </td>
      <td className="p-2">
        <div className="skeleton h-4 w-16 rounded" />
      </td>
    </tr>
  )
}

const SKELETON_ROW_COUNT = 5

export function ProductTable(): React.ReactElement {
  const { products, isLoading } = useProducts()

  return (
    <div className="overflow-x-auto border border-burgundy bg-white">
      <table className="w-full text-sm">
        <thead className="bg-burgundy text-white">
          <tr>
            <th className="w-12 p-2 text-left">Img</th>
            <SortableHeader field="titre">Produit</SortableHeader>
            <th className="p-2 text-left">Variante</th>
            <SortableHeader field="sku">SKU</SortableHeader>
            <SortableHeader align="center" field="stock">
              Stock
            </SortableHeader>
            <SortableHeader align="right" field="prix_ttc">
              Prix TTC
            </SortableHeader>
            <SortableHeader align="right" field="marge_brute">
              Marge
            </SortableHeader>
            <th className="p-2 text-center">Publié</th>
            <th className="p-2 text-left">Canaux</th>
            <th className="p-2 text-left">Tags</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                <SkeletonRow key={`skeleton-${String(i)}`} />
              ))
            : products.map((product) => (
                <ProductRow key={`${product.product_id}-${product.variant_id}`} product={product} />
              ))}
        </tbody>
      </table>
    </div>
  )
}
