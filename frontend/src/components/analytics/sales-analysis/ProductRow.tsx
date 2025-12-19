import type { ProductSales } from '../../../types/analytics'

interface ProductRowProps {
  product: ProductSales
  rank: number
  showViews: boolean
}

export function ProductRow({ product, rank, showViews }: ProductRowProps): React.ReactElement {
  const hasViews = product.views !== undefined && product.views > 0
  const hasCVR = product.cvr !== undefined && product.cvr > 0

  return (
    <tr className="border-b border-border-subtle">
      <td className="py-3 text-center text-text-muted">{rank}</td>
      <td className="py-3">
        <a
          className="text-brand hover:text-brand-light hover:underline"
          href={`https://www.isciacusstore.com/products/${product.product_handle}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {product.product_title}
        </a>
      </td>
      <td className="py-3 text-center font-mono text-text-primary">{product.quantity_sold}</td>
      <td className="py-3 text-center text-text-secondary">{product.order_count}</td>
      {showViews ? (
        <>
          <td className="py-3 text-center font-mono text-text-secondary">
            {hasViews ? product.views : '-'}
          </td>
          <td className="py-3 text-center font-mono">
            {hasCVR ? <span className="badge badge-success">{product.cvr?.toFixed(1)}%</span> : '-'}
          </td>
        </>
      ) : null}
    </tr>
  )
}
