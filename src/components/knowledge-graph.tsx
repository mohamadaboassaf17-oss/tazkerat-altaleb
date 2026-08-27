import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { buildGraphData, NODE_COLOR_BY_TYPE, type GraphLink, type GraphNode } from '../lib/graph-data';

const EMPTY_MESSAGE = 'لا توجد ملاحظات بعد';
const LOAD_ERROR_MESSAGE = 'تعذّر تحميل بيانات الخريطة.';
const LOADING_MESSAGE = 'جارٍ بناء الخريطة…';

const LEGEND_ITEMS: ReadonlyArray<{ type: GraphNode['type']; label: string }> = [
  { type: 'benefit', label: 'فائدة' },
  { type: 'rule', label: 'قاعدة' },
  { type: 'question', label: 'سؤال' },
  { type: 'commentary', label: 'تعقيب' },
  { type: 'memorization', label: 'حفظ' },
];

const EDGE_COLOR = '#ccd6d0';
const EDGE_HIGHLIGHT_COLOR = '#1e6f50';
const LABEL_COLOR = '#52615a';
const LABEL_HIGHLIGHT_COLOR = '#173d2c';
const FONT_FAMILY = "'IBM Plex Sans Arabic', sans-serif";
const MAX_LABEL_CHARS = 16;

function endpointId(endpoint: string | number | NodeObject<GraphNode> | undefined): string {
  if (typeof endpoint === 'object' && endpoint !== null) return typeof endpoint.id === 'string' ? endpoint.id : '';
  return typeof endpoint === 'string' ? endpoint : '';
}

function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS)}…` : name;
}

export interface KnowledgeGraphProps {
  scope?: 'full' | 'cluster';
  compact?: boolean;
}

export function KnowledgeGraph({ scope = 'full', compact = false }: KnowledgeGraphProps): ReactElement {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof buildGraphData>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void buildGraphData(scope)
      .then((dataset) => {
        if (!active) return;
        setData(dataset);
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        console.error('Failed to load knowledge-graph data:', loadError);
        if (!active) return;
        setError(LOAD_ERROR_MESSAGE);
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const measure = (): void => {
      setSize({ width: Math.max(container.clientWidth, 1), height: Math.max(container.clientHeight, 1) });
    };
    measure();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      setSize({ width: Math.max(entry.contentRect.width, 1), height: Math.max(entry.contentRect.height, 1) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (data === null || data.nodes.length === 0 || size === null) return undefined;
    const frame = requestAnimationFrame(() => {
      void graphRef.current?.zoomToFit(400, 80);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, size]);

  const hoveredNode = hoveredId === null || data === null ? null : (data.nodes.find((n) => n.id === hoveredId) ?? null);

  const isRelatedToHover = useCallback(
    (nodeId: string): boolean => {
      if (data === null || hoveredId === null) return true;
      return nodeId === hoveredId || data.neighborsById.get(hoveredId)?.has(nodeId) === true;
    },
    [data, hoveredId],
  );

  const drawNode = useCallback(
    (node: NodeObject<GraphNode>, ctx: CanvasRenderingContext2D): void => {
      const radius = node.type === 'memorization' ? 7 : 5;
      const related = isRelatedToHover(node.id);
      const dimmed = hoveredNode !== null && !related;
      ctx.globalAlpha = dimmed ? 0.22 : 1;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
      ctx.fillStyle = NODE_COLOR_BY_TYPE[node.type];
      ctx.fill();
      if (hoveredNode !== null && node.id === hoveredNode.id) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = LABEL_HIGHLIGHT_COLOR;
        ctx.stroke();
      }
      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = node.id === hoveredId ? LABEL_HIGHLIGHT_COLOR : LABEL_COLOR;
      ctx.fillText(truncateLabel(node.name), node.x ?? 0, (node.y ?? 0) + radius + 4);
      ctx.globalAlpha = 1;
    },
    [isRelatedToHover, hoveredId, hoveredNode],
  );

  const paintPointerArea = useCallback((node: NodeObject<GraphNode>, color: string, ctx: CanvasRenderingContext2D): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, 14, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const linkColorFor = useCallback(
    (link: LinkObject<GraphNode, GraphLink>): string =>
      hoveredId !== null && (endpointId(link.source) === hoveredId || endpointId(link.target) === hoveredId)
        ? EDGE_HIGHLIGHT_COLOR
        : EDGE_COLOR,
    [hoveredId],
  );

  const linkWidthFor = useCallback(
    (link: LinkObject<GraphNode, GraphLink>): number =>
      hoveredId !== null && (endpointId(link.source) === hoveredId || endpointId(link.target) === hoveredId) ? 2.5 : 1,
    [hoveredId],
  );

  function handleNodeClick(node: NodeObject<GraphNode>): void {
    if (typeof node.id === 'string') void navigate(`/notes/${node.id}`);
  }

  const isGraphReady = error === null && !isLoading && data !== null && data.nodes.length > 0;
  const minH = compact ? 'min-h-[280px]' : 'min-h-[420px]';

  return (
    <div ref={containerRef} className={`relative h-full ${minH} w-full overflow-hidden rounded-xl border border-neutral-200 bg-white`}>
      {error !== null ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        </div>
      ) : isLoading || data === null ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-brand-700" role="status">
            {LOADING_MESSAGE}
          </p>
        </div>
      ) : data.nodes.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-neutral-500">{EMPTY_MESSAGE}</p>
        </div>
      ) : null}
      {isGraphReady && size !== null && (
        <>
          <ForceGraph<GraphNode, GraphLink>
            ref={graphRef}
            graphData={{ nodes: data.nodes, links: data.links }}
            width={size.width}
            height={size.height}
            backgroundColor="#ffffff"
            nodeRelSize={4}
            nodeId="id"
            nodeCanvasObject={drawNode}
            nodeCanvasObjectMode={() => 'replace'}
            nodePointerAreaPaint={paintPointerArea}
            linkColor={linkColorFor}
            linkWidth={linkWidthFor}
            enableZoomInteraction
            onNodeClick={handleNodeClick}
            onNodeHover={(node) => setHoveredId(typeof node?.id === 'string' ? node.id : null)}
          />
          {!compact && (
            <ul className="pointer-events-none absolute bottom-3 start-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-white/90 px-3 py-2 text-xs shadow-sm">
              {LEGEND_ITEMS.map((item) => (
                <li key={item.type} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_COLOR_BY_TYPE[item.type] }} />
                  <span className="text-neutral-700">{item.label}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
