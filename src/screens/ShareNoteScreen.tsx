import { useEffect, useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { extractTitle } from '../lib/note-text';

interface ShareNoteRow {
  id: string;
  title: string;
  content: string;
  type: string;
  is_public: boolean;
  created_at: string;
}

const WIKI_WITH_DISPLAY = /\[\[([^\][|\n]*)\|([^\][\n]*)\]\]/g;
const WIKI_BARE = /\[\[([^\][\n]*)\]\]/g;

function renderContentWithLinks(content: string, titleMap: Map<string, string>): string {
  let out = content.replace(WIKI_WITH_DISPLAY, (_m: string, target: string, display: string) => {
    const tid = target.trim();
    const resolved = titleMap.get(tid);
    // If target is public we show resolved title, else fallback to stored display
    return resolved !== undefined ? `[[${resolved}]]` : display || tid;
  });
  out = out.replace(WIKI_BARE, (_m: string, target: string) => {
    const tid = target.trim();
    const resolved = titleMap.get(tid);
    return resolved !== undefined ? `[[${resolved}]]` : `[[${tid}]]`;
  });
  return out;
}

export default function ShareNoteScreen(): ReactElement {
  const { noteId } = useParams();
  const [note, setNote] = useState<ShareNoteRow | null>(null);
  const [renderedContent, setRenderedContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!noteId) {
      setError('الملاحظة غير موجودة أو خاصة.');
      setIsLoading(false);
      return;
    }
    const targetId = noteId;
    async function load(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: ShareNoteRow | null; error: { message: string } | null }> } } } }).from('notes')
          .select('id,title,content,type,is_public,created_at')
          .eq('id', targetId)
          .single();

        if (!active) return;
        if (fetchError !== null || data === null) {
          setError('الملاحظة غير موجودة أو خاصة.');
          setIsLoading(false);
          return;
        }
        const row = data;
        // Anon RLS already enforces is_public, but double-check for direct client
        if (!row.is_public) {
          setError('الملاحظة غير موجودة أو خاصة.');
          setIsLoading(false);
          return;
        }
        setNote(row);

        // Resolve outbound [[id|display]] to current titles (only public targets visible to anon)
        const rawIds: string[] = [];
        for (const m of row.content.matchAll(/\[\[([^\][\n]*)\]\]/g)) {
          const part = m[1]?.split('|')[0]?.trim();
          if (part && !rawIds.includes(part)) rawIds.push(part);
        }
        if (rawIds.length > 0) {
          const { data: targets } = await supabase
            .from('notes')
            .select('id,title')
            .in('id', rawIds);
          const map = new Map<string, string>();
          if (targets) {
            for (const t of targets as Array<{ id: string; title: string }>) {
              map.set(t.id, t.title);
            }
          }
          if (active) setRenderedContent(renderContentWithLinks(row.content, map));
        } else {
          if (active) setRenderedContent(row.content);
        }
        if (active) setIsLoading(false);
      } catch (err: unknown) {
        console.error('Share load failed:', err);
        if (active) {
          setError('تعذّر تحميل الملاحظة.');
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [noteId]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center text-brand-700" role="status">
        جارٍ التحميل…
      </div>
    );
  }

  if (error !== null || note === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700" role="alert">
          {error ?? 'الملاحظة غير موجودة أو خاصة.'}
        </p>
        <p className="mt-6 text-center">
          <Link className="text-sm text-brand-600 underline underline-offset-4 hover:text-brand-700" to="/login">
            تسجيل الدخول لإنشاء ملاحظاتك
          </Link>
        </p>
      </div>
    );
  }

  const displayTitle = note.title || extractTitle(note.content);
  const body = renderedContent ?? note.content;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-brand-800">{displayTitle}</h1>
        <p className="mt-2 text-xs text-neutral-500">
          {new Date(note.created_at).toLocaleDateString('ar-EG')} · {note.type}
        </p>
        <div className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-7 text-neutral-800" dir="rtl">
          {body}
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-neutral-500">
        <Link className="text-brand-600 underline underline-offset-4 hover:text-brand-700" to="/">
          تذكرة الطالب — أنشئ ملاحظاتك الخاصة
        </Link>
      </p>
    </div>
  );
}
