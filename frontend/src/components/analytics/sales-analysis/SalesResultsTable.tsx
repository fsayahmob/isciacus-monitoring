import type { ProductSales } from '../../../types/analytics'

import { ProductRow } from './ProductRow'

export function SalesResultsTable({
  products,
  showViews,
}: {
  products: ProductSales[]
  showViews: boolean
}): React.ReactElement {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-default text-left">
          <th className="pb-3 text-center text-xs font-medium uppercase tracking-wider text-text-tertiary">
            #
          </th>
          <th className="pb-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Produit
          </th>
          <th className="pb-3 text-center text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Qté
          </th>
          <th className="pb-3 text-center text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Commandes
          </th>
          {showViews ? (
            <>
              <th className="pb-3 text-center text-xs font-medium uppercase tracking-wider text-info">
                Vues
              </th>
              <th className="pb-3 text-center text-xs font-medium uppercase tracking-wider text-success">
                CVR
              </th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {products.map((product, index) => (
          <ProductRow
            key={product.product_id}
            product={product}
            rank={index + 1}
            showViews={showViews}
          />
        ))}
      </tbody>
    </table>
  )
}
