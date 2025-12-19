/**
 * ProductGrid Component - ISCIACUS Monitoring Dashboard
 * ======================================================
 */

import { useCallback } from 'react'

import { STOCK_LEVEL_COLORS } from '../constants'
import { useProducts } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'
import type { Product, StockLevel } from '../types/product'

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

function ProductCard({ product }: { product: Product }): React.ReactElement {
  const { setSelectedProductId } = useAppStore()

  const handleClick = useCallback((): void => {
    setSelectedProductId(product.product_id)
  }, [setSelectedProductId, product.product_id])

  return (
    <div
      className="cursor-pointer border border-border-default bg-bg-secondary rounded-lg transition-all hover:shadow-lg hover:border-brand/50"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick()
        }
      }}
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden bg-bg-tertiary rounded-t-lg">
        {product.image_url !== null ? (
          <img
            alt={product.titre}
            className="h-full w-full object-cover"
            loading="lazy"
            src={product.image_url}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-bg-tertiary text-text-muted">
            <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-text-primary" title={product.titre}>
          {product.titre}
        </h3>
        <p className="truncate text-xs text-text-tertiary">{product.variante}</p>

        <div className="mt-2 flex items-center justify-between">
          <span className="font-semibold text-lg text-brand">
            {formatCurrency(product.prix_ttc)}
          </span>
          <StockBadge level={product.stock_level} stock={product.stock} />
        </div>

        {product.marge_pct !== '' && (
          <div className="mt-1 text-xs text-text-tertiary">Marge: {product.marge_pct}</div>
        )}
      </div>
    </div>
  )
}

function SkeletonCard(): React.ReactElement {
  return (
    <div className="border border-border-default bg-bg-secondary rounded-lg">
      <div className="skeleton aspect-square rounded-t-lg" />
      <div className="p-3">
        <div className="skeleton mb-2 h-4 w-3/4 rounded" />
        <div className="skeleton mb-2 h-3 w-1/2 rounded" />
        <div className="flex items-center justify-between">
          <div className="skeleton h-6 w-20 rounded" />
          <div className="skeleton h-5 w-12 rounded" />
        </div>
      </div>
    </div>
  )
}

const SKELETON_CARD_COUNT = 10

export function ProductGrid(): React.ReactElement {
  const { products, isLoading } = useProducts()

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {isLoading
        ? Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
            <SkeletonCard key={`skeleton-${String(i)}`} />
          ))
        : products.map((product) => (
            <ProductCard key={`${product.product_id}-${product.variant_id}`} product={product} />
          ))}
    </div>
  )
}
