import { useEffect, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { stripTashkeel } from '../lib/arabic-text';
import { VirtualList } from '../components/virtual-list';
import { useAuth } from '../lib/auth';
import { searchNotesLocal } from '../lib/search';
import type { LocalNote } from '../types/models';

const TYPE_LABEL: Record<string, string> = {
  benefit: 'فائدة',
  rule: 'قاعدة',
  question: 'سؤال',
  commentary: 'تعقيب',
  memorization: 'حفظ',
};

export default function SearchScreen(): ReactElement {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [results, setResults] = useState<LocalNote[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!user || q.length === 0) {
      setResults(q.length === 0 ? [] : null);
      return;
    }
    let active = true;
    setIsSearching(true);
    void searchNotesLocal(user.id, q)
      .then((hits) => {
        if (!active) return;
        setResults(hits);
        setIsSearching(false);
      })
      .catch(() => {
        if (!active) return;
        setResults([]);
        setIsSearching(false);
      });
    return () => {
      active = false;
    };
  }, [user, q]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h2 className="mb-1 text-xl font-bold text-neutral-900">البحث</h2>
      <p className="mb-4 text-sm text-neutral-500">
        {q.length === 0 ? 'اكتب كلمة للبحث في عناوين ومحتوى ملاحظاتك.' : `نتائج البحث عن: "${q}"`}
      </p>

      {q.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          جرّب البحث بكلمات مثل العقيدة أو مع التشكيل العقيدةَ
        </p>
      ) : isSearching || results === null ? (
        <p className="text-sm text-neutral-500" role="status">
          جارٍ البحث…
        </p>
      ) : results.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">لا توجد نتائج مطابقة.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-neutral-500">{results.length} نتيجة</p>
          <VirtualList
            items={results}
            estimateSize={112}
            keyExtractor={(n) => n.id}
            ariaLabel="نتائج البحث"
            className="grid gap-3"
            renderItem={(note) => (
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                    {TYPE_LABEL[note.type] ?? note.type}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {new Date(note.created_at).toLocaleDateString('ar-EG')}
                  </span>
                </div>
                <Link
                  to={`/notes/${note.id}`}
                  className="font-medium text-neutral-900 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {stripTashkeel(note.title)}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{note.content.slice(0, 160)}</p>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
