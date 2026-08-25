import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { stripTashkeel } from '../lib/arabic-text';
import { db } from '../lib/db';
import type { LocalBook, LocalNote, LocalNoteLink, NoteType } from '../types/models';

const EMPTY_MESSAGE = 'لا توجد ملاحظات بعد';
const LOAD_ERROR_MESSAGE = 'تعذّر تحميل بيانات الخريطة.';
const LOADING_MESSAGE = 'جارٍ بناء الخريطة…';

/**
 * Node palette harmonized around the brand green (#1e6f50).
 * `حفظ` (memorization) is the only fully saturated fill so it reads as
 * visually distinct per the SRS priority rule.
 */
const NODE_COLOR_BY_TYPE: Record<NoteType, string> = {
  memorization: '#1e6f50',
  benefit: '#57a97b',
  rule: '#c98f2d',
  question: '#4d7ea8',
  commentary: '#9b6bb3',
};

/** Legend entries in PRD §6 note-type order. */
const LEGEND_ITEMS: ReadonlyArray<{ type: NoteType; label: string }> = [
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

/** Radii (graph units) of the inner cluster ring vs the wide outer ring. */
const CLUSTER_RING_INNER = 40;
const CLUSTER_RING_OUTER = 140;
const OUTER_RING_INNER = 520;
const OUTER_RING_OUTER = 780;

/** Golden-angle spiral step; spreads nodes evenly without clumping. */
const GOLDEN_ANGLE = 2.399963229728653;

interface GraphNode {
  id: string;
  /** Tashkeel-stripped title used for the canvas label. */
  name: string;
  type: NoteType;
  fx: number;
  fy: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphDataset {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Adjacency map: node id → ids of directly connected nodes. */
  neighborsById: Map<string, ReadonlySet<string>>;
}

function hashJitter(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 997;
  }
  return ((hash / 997) - 0.5) * 24;
}

function ringPosition(
  index: number,
  total: number,
  innerRadius: number,
  outerRadius: number,
  jitter: number,
): { x: number; y: number } {
  const angle = index * GOLDEN_ANGLE + jitter * 0.02;
  const t = total <= 1 ? 0 : index / (total - 1);
  const radius = innerRadius + t * (outerRadius - innerRadius) + jitter;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/**
 * Builds the full graph dataset from local Dexie tables.
 *
 * Centering rule (AGENTS.md): notes belonging to the most recently opened
 * book — either directly (`book_id`) or through the two-hop join
 * lecture → lecturer → book — are placed on a small ring near the center.
 * Every other note sits on a wide outer ring so the centered cluster reads
 * clearly. Positions are fixed once at build time via `fx`/`fy`.
 */
async function buildGraphData(): Promise<GraphDataset> {
  const [notes, allLinks, books] = await Promise.all([
    db.notes.toArray(),
    db.note_links.toArray(),
    db.books.toArray(),
  ]);

  const latestBook = books.reduce<LocalBook | null>(
    (latest, book) =>
      latest === null || book.last_opened_at > latest.last_opened_at ? book : latest,
    null,
  );

  // Two-hop join: lecturers of the latest book → their lectures.
  const lectureIdsInLatestBook = new Set<string>();
  if (latestBook !== null) {
    const lecturers = await db.lecturers.where('book_id').equals(latestBook.id).toArray();
    const lecturerIds = lecturers.map((lecturer) => lecturer.id);
    if (lecturerIds.length > 0) {
      const lectures = await db.lectures.where('lecturer_id').anyOf(lecturerIds).toArray();
      for (const lecture of lectures) {
        lectureIdsInLatestBook.add(lecture.id);
      }
    }
  }

  const isInCluster = (note: LocalNote): boolean =>
    latestBook !== null &&
    (note.book_id === latestBook.id ||
      (note.lecture_id !== null && lectureIdsInLatestBook.has(note.lecture_id)));

  const clusterNotes = notes.filter(isInCluster);
  const outerNotes = notes.filter((note) => !isInCluster(note));

  const nodes: GraphNode[] = [];
  clusterNotes.forEach((note, index) => {
    const pos = ringPosition(
      index,
      clusterNotes.length,
      CLUSTER_RING_INNER,
      CLUSTER_RING_OUTER,
      hashJitter(note.id),
    );
    nodes.push({
      id: note.id,
      name: stripTashkeel(note.title),
      type: note.type,
      fx: pos.x,
      fy: pos.y,
    });
  });
  outerNotes.forEach((note, index) => {
    const pos = ringPosition(
      index,
      outerNotes.length,
      OUTER_RING_INNER,
      OUTER_RING_OUTER,
      hashJitter(note.id),
    );
    nodes.push({
      id: note.id,
      name: stripTashkeel(note.title),
      type: note.type,
      fx: pos.x,
      fy: pos.y,
    });
  });

  // Dangling edges are skipped: both endpoints must exist in the node set.
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links: GraphLink[] = allLinks
    .filter(
      (link: LocalNoteLink) =>
        nodeIds.has(link.source_note_id) && nodeIds.has(link.target_note_id),
    )
    .map((link) => ({ source: link.source_note_id, target: link.target_note_id }));

  const neighborsById = new Map<string, Set<string>>();
  for (const link of links) {
    if (!neighborsById.has(link.source)) {
      neighborsById.set(link.source, new Set());
    }
    if (!neighborsById.has(link.target)) {
      neighborsById.set(link.target, new Set());
    }
    neighborsById.get(link.source)?.add(link.target);
    neighborsById.get(link.target)?.add(link.source);
  }

  return { nodes, links, neighborsById };
}

function endpointId(
  endpoint: string | number | NodeObject<GraphNode> | undefined,
): string {
  if (typeof endpoint === 'object' && endpoint !== null) {
    return typeof endpoint.id === 'string' ? endpoint.id : '';
  }
  return typeof endpoint === 'string' ? endpoint : '';
}

function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_CHARS
    ? `${name.slice(0, MAX_LABEL_CHARS)}…`
    : name;
}

export function KnowledgeGraph(): ReactElement {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [data, setData] = useState<GraphDataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void buildGraphData()
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
  }, []);

  // Track the container box so the canvas stays responsive on resize.
  // The container element is always rendered (loading/error/empty states live
  // inside it), so the observer can attach on the very first commit instead of
  // waiting for data. Measure eagerly at attach time as well; ResizeObserver
  // also fires an initial observation right after observe().
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const measure = (): void => {
      setSize({
        width: Math.max(container.clientWidth, 1),
        height: Math.max(container.clientHeight, 1),
      });
    };
    measure();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      setSize({
        width: Math.max(entry.contentRect.width, 1),
        height: Math.max(entry.contentRect.height, 1),
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Fit the whole fixed-position layout into view once data is ready and the
  // canvas has its measured size (the graph only mounts when both hold).
  useEffect(() => {
    if (data === null || data.nodes.length === 0 || size === null) return undefined;
    const frame = requestAnimationFrame(() => {
      void graphRef.current?.zoomToFit(400, 80);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [data, size]);

  const hoveredNode =
    hoveredId === null || data === null
      ? null
      : (data.nodes.find((node) => node.id === hoveredId) ?? null);

  const isRelatedToHover = useCallback(
    (nodeId: string): boolean => {
      if (data === null || hoveredId === null) return true;
      return (
        nodeId === hoveredId || data.neighborsById.get(hoveredId)?.has(nodeId) === true
      );
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

  const paintPointerArea = useCallback(
    (node: NodeObject<GraphNode>, color: string, ctx: CanvasRenderingContext2D): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, 14, 0, 2 * Math.PI);
      ctx.fill();
    },
    [],
  );

  const linkColorFor = useCallback(
    (link: LinkObject<GraphNode, GraphLink>): string =>
      hoveredId !== null &&
      (endpointId(link.source) === hoveredId || endpointId(link.target) === hoveredId)
        ? EDGE_HIGHLIGHT_COLOR
        : EDGE_COLOR,
    [hoveredId],
  );

  const linkWidthFor = useCallback(
    (link: LinkObject<GraphNode, GraphLink>): number =>
      hoveredId !== null &&
      (endpointId(link.source) === hoveredId || endpointId(link.target) === hoveredId)
        ? 2.5
        : 1,
    [hoveredId],
  );

  function handleNodeClick(node: NodeObject<GraphNode>): void {
    if (typeof node.id === 'string') {
      void navigate(`/notes/${node.id}`);
    }
  }

  const isGraphReady = error === null && !isLoading && data !== null && data.nodes.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
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
            onNodeHover={(node) => {
              setHoveredId(typeof node?.id === 'string' ? node.id : null);
            }}
          />
          <ul className="pointer-events-none absolute bottom-3 start-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-white/90 px-3 py-2 text-xs shadow-sm">
            {LEGEND_ITEMS.map((item) => (
              <li key={item.type} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: NODE_COLOR_BY_TYPE[item.type] }}
                />
                <span className="text-neutral-700">{item.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
