const SKELETON_ROWS = 3

export function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="skeleton h-6 w-32" />
      <div className="skeleton h-4 w-48" />
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="skeleton h-10 w-full" />
      ))}
    </div>
  )
}
