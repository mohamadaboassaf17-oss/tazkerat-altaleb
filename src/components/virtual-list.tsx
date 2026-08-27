import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

export interface VirtualListProps<T> {
  items: readonly T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  overscan?: number;
  getItemHeight?: (index: number) => number;
  /** When items.length <= this, render a plain list (no virtualizer). */
  threshold?: number;
  className?: string;
  role?: string;
  ariaLabel?: string;
}

/**
 * Lightweight windowing list. No external dependency.
 * For short lists (<= threshold, default 30) renders a plain <ul> to keep DOM simple and a11y intact.
 * For long lists, renders a scroll container with absolutely positioned window — fixed estimateSize per row.
 * RTL-safe (logical properties for positioning).
 */
export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  keyExtractor,
  overscan = 5,
  threshold = 30,
  className,
  role,
  ariaLabel,
}: VirtualListProps<T>): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const isVirtual = items.length > threshold;

  useEffect(() => {
    if (!isVirtual) return;
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    setViewportH(el.clientHeight);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [isVirtual]);

  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Home') {
        containerRef.current?.scrollTo({ top: 0 });
        e.preventDefault();
      } else if (e.key === 'End') {
        containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
        e.preventDefault();
      }
    },
    [],
  );

  if (!isVirtual) {
    return (
      <ul className={className} role={role} aria-label={ariaLabel}>
        {items.map((item, i) => (
          <li key={keyExtractor(item, i)}>{renderItem(item, i)}</li>
        ))}
      </ul>
    );
  }

  const totalHeight = items.length * estimateSize;
  const startIndex = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + viewportH) / estimateSize) + overscan,
  );
  const visible = items.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * estimateSize;

  return (
    <div
      ref={containerRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyNav}
      style={{
        maxHeight: '60vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <ul
          style={{
            position: 'absolute',
            insetBlockStart: 0,
            insetInlineStart: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`,
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {visible.map((item, idx) => {
            const realIdx = startIndex + idx;
            return (
              <li key={keyExtractor(item, realIdx)} style={{ height: estimateSize }}>
                {renderItem(item, realIdx)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
