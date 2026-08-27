import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { rateNote } from '../lib/note-crud';
import { getDueNotes } from '../lib/srs-queue';
import type { LocalNote } from '../types/models';
import type { Rating } from '../lib/srs';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'card'; note: LocalNote; index: number; total: number }
  | { kind: 'done'; completed: number };

const RATING_BUTTONS: Array<{ rating: Rating; label: string; cls: string }> = [
  { rating: 'hard', label: 'صعب', cls: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-300' },
  { rating: 'medium', label: 'متوسط', cls: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-300' },
  { rating: 'easy', label: 'سهل', cls: 'bg-brand-600 hover:bg-brand-700 focus:ring-brand-300' },
];

function noteTypeLabel(type: LocalNote['type']): string {
  switch (type) {
    case 'memorization':
      return 'حفظ';
    case 'benefit':
      return 'فائدة';
    case 'rule':
      return 'قاعدة';
    case 'question':
      return 'سؤال';
    case 'commentary':
      return 'تعقيب';
    default:
      return type;
  }
}

export default function ReviewScreen() {
  const { user } = useAuth();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [queue, setQueue] = useState<LocalNote[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load queue on mount and when live notes change (simple polling via Dexie hook would need dexie-react-hooks).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const notes = await getDueNotes(user!.id);
        if (cancelled) return;
        setQueue(notes);
        if (notes.length === 0) {
          setState({ kind: 'empty' });
        } else {
          setState({ kind: 'card', note: notes[0]!, index: 0, total: notes.length });
          setCursor(0);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    // Also re-load when the notes table changes (subscribe via Dexie hook workaround: polling not needed; rateNote updates local and we advance).
    // Listen to db.notes hook for external sync pulls.
    const onChange = () => {
      void load();
    };
    // Dexie hook: after any transaction on notes, reload queue (covers pull).
    db.notes.hook('creating', onChange);
    db.notes.hook('updating', onChange);
    db.notes.hook('deleting', onChange);
    return () => {
      cancelled = true;
      db.notes.hook('creating').unsubscribe(onChange);
      db.notes.hook('updating').unsubscribe(onChange);
      db.notes.hook('deleting').unsubscribe(onChange);
    };
  }, [user]);

  // Keyboard 1/2/3 shortcuts
  useEffect(() => {
    if (state.kind !== 'card' || busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === '1') void handleRate('hard');
      else if (e.key === '2') void handleRate('medium');
      else if (e.key === '3') void handleRate('easy');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, busy]);

  const progressLabel = useMemo(() => {
    if (state.kind === 'card') return `${state.index + 1} / ${state.total}`;
    if (state.kind === 'done') return `${state.completed} / ${state.completed}`;
    return '';
  }, [state]);

  async function handleRate(rating: Rating) {
    if (state.kind !== 'card' || busy) return;
    const current = state.note;
    setBusy(true);
    setError(null);
    try {
      await rateNote(current, rating);
      // Advance locally without refetching the whole queue: remove current and go next.
      // But we also need to handle review_date moving to future — so rated card should not reappear.
      const nextIndex = cursor + 1;
      if (nextIndex >= queue.length) {
        setState({ kind: 'done', completed: queue.length });
      } else {
        const nextNote = queue[nextIndex]!;
        // The just-rated note's new review_date is in the future, so it naturally drops from queue.
        // No need to reload; just step forward.
        setCursor(nextIndex);
        setState({ kind: 'card', note: nextNote, index: nextIndex, total: queue.length });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="mb-4 text-rose-700">حدث خطأ: {error}</p>
        <Link className="text-brand-700 underline" to="/dashboard">
          العودة للوحة التحكم
        </Link>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-live="polite">
        <p className="text-neutral-500">جارٍ تحميل المراجعات…</p>
      </div>
    );
  }

  if (state.kind === 'empty') {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <p className="mb-2 text-2xl font-bold text-brand-700">لا توجد مراجعات اليوم</p>
        <p className="mb-6 text-neutral-600">أحسنت! كل ملاحظاتك مجدولة للأيام القادمة.</p>
        <div className="flex justify-center gap-3">
          <Link className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700" to="/dashboard">
            لوحة التحكم
          </Link>
          <Link className="rounded-lg border border-neutral-300 px-5 py-2.5 font-medium text-neutral-700 hover:bg-neutral-50" to="/categories">
            تصفح الملاحظات
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === 'done') {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <p className="mb-2 text-2xl font-bold text-brand-700">أتممت {state.completed} مراجعة ✓</p>
        <p className="mb-6 text-neutral-600">بارك الله في جهدك — نراك غداً.</p>
        <Link className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700" to="/dashboard">
          العودة
        </Link>
      </div>
    );
  }

  // card
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-sm text-neutral-500">
        <span>المراجعة {progressLabel}</span>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {noteTypeLabel(state.note.type)}
        </span>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm" aria-live="polite">
        <h2 className="mb-3 text-lg font-bold leading-7 text-neutral-900">{state.note.title}</h2>
        <div className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-4 text-[15px] leading-7 text-neutral-800">
          {state.note.content}
        </div>
        <p className="mt-3 text-xs text-neutral-400">تاريخ الاستحقاق: {state.note.review_date}</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {RATING_BUTTONS.map((b) => (
          <button
            key={b.rating}
            type="button"
            disabled={busy}
            onClick={() => void handleRate(b.rating)}
            className={`rounded-xl px-4 py-3.5 text-base font-bold text-white shadow-sm transition disabled:opacity-50 focus:outline-none focus:ring-4 ${b.cls}`}
            aria-label={`تقييم ${b.label}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-neutral-400">اختصارات: 1 صعب · 2 متوسط · 3 سهل</p>

      {busy && (
        <p className="mt-3 text-center text-sm text-neutral-500" role="status">
          جارٍ الحفظ…
        </p>
      )}
    </div>
  );
}
