/**
 * AdaptiveGrid — the web equivalent of SwiftUI's LazyVGrid(.adaptive) /
 * Jetpack Compose's LazyVerticalGrid(GridCells.Adaptive).
 *
 * Items flow into as many columns as fit, each at least `min` wide, and stretch
 * to fill the row. No fixed column counts, no media-query juggling, no overflow —
 * it reflows fluidly from one column on a phone to many on a tablet/desktop.
 */
export default function AdaptiveGrid({
  children,
  min = 150,
  gap = 12,
  className = '',
}: {
  children:  React.ReactNode;
  /** Minimum item width in px before wrapping to a new column. */
  min?:      number;
  /** Gap between items in px. */
  gap?:      number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gap: `${gap}px`,
        // auto-fit + minmax = "as many columns of ≥min as fit, then stretch"
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
