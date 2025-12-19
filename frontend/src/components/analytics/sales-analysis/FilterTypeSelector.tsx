export type FilterType = 'tag' | 'collection'

export function FilterTypeSelector({
  filterType,
  onChange,
}: {
  filterType: FilterType
  onChange: (type: FilterType) => void
}): React.ReactElement {
  const getButtonClass = (type: FilterType): string =>
    `px-4 py-2 text-sm font-medium transition-colors ${
      filterType === type
        ? 'bg-brand text-white'
        : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
    }`

  return (
    <div className="mb-4 flex items-center gap-4">
      <span className="text-sm text-text-secondary">Filtrer par:</span>
      <div className="flex overflow-hidden rounded-lg border border-border-subtle">
        <button
          className={getButtonClass('collection')}
          type="button"
          onClick={() => {
            onChange('collection')
          }}
        >
          Collection
        </button>
        <button
          className={getButtonClass('tag')}
          type="button"
          onClick={() => {
            onChange('tag')
          }}
        >
          Tag
        </button>
      </div>
    </div>
  )
}
