import { stripTashkeel } from './arabic-text';
import { db } from './db';
import type { LocalBook, LocalNote, LocalNoteLink, NoteType } from '../types/models';

const CLUSTER_RING_INNER = 40;
const CLUSTER_RING_OUTER = 140;
const OUTER_RING_INNER = 520;
const OUTER_RING_OUTER = 780;

const GOLDEN_ANGLE = 2.399963229728653;

export const NODE_COLOR_BY_TYPE: Record<NoteType, string> = {
  memorization: '#1e6f50',
  benefit: '#57a97b',
  rule: '#c98f2d',
  question: '#4d7ea8',
  commentary: '#9b6bb3',
};

export interface GraphNode {
  id: string;
  name: string;
  type: NoteType;
  fx: number;
  fy: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphDataset {
  nodes: GraphNode[];
  links: GraphLink[];
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
 * Builds the graph dataset from local Dexie tables.
 *
 * Centering rule (AGENTS.md): notes belonging to the most recently opened
 * book — directly (book_id) or via two-hop join lecture → lecturer → book —
 * are placed on a small ring near the center; others on a wide outer ring.
 * When scope is 'cluster', returns only cluster nodes+internal edges.
 */
export async function buildGraphData(scope: 'full' | 'cluster' = 'full'): Promise<GraphDataset> {
  const [notes, allLinks, books] = await Promise.all([
    db.notes.toArray(),
    db.note_links.toArray(),
    db.books.toArray(),
  ]);

  const latestBook = books.reduce<LocalBook | null>(
    (latest, book) => (latest === null || book.last_opened_at > latest.last_opened_at ? book : latest),
    null,
  );

  const lectureIdsInLatestBook = new Set<string>();
  if (latestBook !== null) {
    const lecturers = await db.lecturers.where('book_id').equals(latestBook.id).toArray();
    const lecturerIds = lecturers.map((l) => l.id);
    if (lecturerIds.length > 0) {
      const lectures = await db.lectures.where('lecturer_id').anyOf(lecturerIds).toArray();
      for (const lecture of lectures) lectureIdsInLatestBook.add(lecture.id);
    }
  }

  const isInCluster = (note: LocalNote): boolean =>
    latestBook !== null &&
    (note.book_id === latestBook.id ||
      (note.lecture_id !== null && lectureIdsInLatestBook.has(note.lecture_id)));

  const clusterNotes = notes.filter(isInCluster);
  const outerNotes = notes.filter((note) => !isInCluster(note));

  const relevantNotes = scope === 'cluster' ? clusterNotes : notes;

  const nodes: GraphNode[] = [];
  if (scope === 'cluster') {
    clusterNotes.forEach((note, index) => {
      const pos = ringPosition(index, clusterNotes.length, CLUSTER_RING_INNER, CLUSTER_RING_OUTER, hashJitter(note.id));
      nodes.push({ id: note.id, name: stripTashkeel(note.title), type: note.type, fx: pos.x, fy: pos.y });
    });
  } else {
    clusterNotes.forEach((note, index) => {
      const pos = ringPosition(index, clusterNotes.length, CLUSTER_RING_INNER, CLUSTER_RING_OUTER, hashJitter(note.id));
      nodes.push({ id: note.id, name: stripTashkeel(note.title), type: note.type, fx: pos.x, fy: pos.y });
    });
    outerNotes.forEach((note, index) => {
      const pos = ringPosition(index, outerNotes.length, OUTER_RING_INNER, OUTER_RING_OUTER, hashJitter(note.id));
      nodes.push({ id: note.id, name: stripTashkeel(note.title), type: note.type, fx: pos.x, fy: pos.y });
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  // When scope is cluster, only include edges fully inside the cluster.
  const links: GraphLink[] = allLinks
    .filter(
      (link: LocalNoteLink) => nodeIds.has(link.source_note_id) && nodeIds.has(link.target_note_id),
    )
    .map((link) => ({ source: link.source_note_id, target: link.target_note_id }));

  // For full scope, also guard outer cluster membership already handled by nodeIds set above.
  void relevantNotes;

  const neighborsById = new Map<string, Set<string>>();
  for (const link of links) {
    if (!neighborsById.has(link.source)) neighborsById.set(link.source, new Set());
    if (!neighborsById.has(link.target)) neighborsById.set(link.target, new Set());
    neighborsById.get(link.source)?.add(link.target);
    neighborsById.get(link.target)?.add(link.source);
  }

  return { nodes, links, neighborsById };
}
