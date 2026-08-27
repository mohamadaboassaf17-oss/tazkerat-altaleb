import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { deleteMedia, getMediaDownloadUrl } from '../lib/media-crud';
import { bucketForKind } from '../lib/media';
import { useMediaTrial } from '../hooks/useMediaTrial';
import type { LocalMedia } from '../types/models';

interface Props {
  noteId?: string | null;
  lectureId?: string | null;
}

function MediaItem({ row, canDelete, onDeleted }: { row: LocalMedia; canDelete: boolean; onDeleted: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const bucket = bucketForKind(row.type);

  useEffect(() => {
    let cancelled = false;
    void getMediaDownloadUrl(bucket, row.url).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, row.url]);

  const handleDelete = async () => {
    setErr(null);
    try {
      await deleteMedia(row.id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
          {row.type === 'image' ? 'صورة' : `صوت${row.duration_seconds ? ` · ${row.duration_seconds}ث` : ''}`}
        </span>
        {canDelete ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            حذف
          </button>
        ) : (
          <span className="text-xs text-neutral-400">للقراءة فقط</span>
        )}
      </div>

      {row.type === 'image' ? (
        url ? (
          <img src={url} alt="وسيط صورة" className="max-h-64 w-full rounded-lg object-contain bg-neutral-50" />
        ) : (
          <p className="text-sm text-neutral-500">جارٍ التحميل…</p>
        )
      ) : url ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded audio has no captions in MVP; track would be empty
        <audio controls src={url} className="w-full" preload="metadata" />
      ) : (
        <p className="text-sm text-neutral-500">جارٍ التحميل…</p>
      )}

      <div className="mt-2 flex gap-2">
        {url && (
          <a
            href={url}
            download
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand-600 hover:underline"
          >
            تحميل
          </a>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

export default function MediaGallery({ noteId = null, lectureId = null }: Props) {
  const trial = useMediaTrial();
  const [rows, setRows] = useState<LocalMedia[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let list: LocalMedia[] = [];
      if (noteId) list = await db.media.where('note_id').equals(noteId).toArray();
      else if (lectureId) list = await db.media.where('lecture_id').equals(lectureId).toArray();
      if (!cancelled) setRows(list);
    }
    void load();
    const handler = () => void load();
    db.media.hook('creating', handler as unknown as () => void);
    db.media.hook('updating', handler as unknown as () => void);
    db.media.hook('deleting', handler as unknown as () => void);
    return () => {
      cancelled = true;
      db.media.hook('creating').unsubscribe(handler);
      db.media.hook('updating').unsubscribe(handler);
      db.media.hook('deleting').unsubscribe(handler);
    };
  }, [noteId, lectureId, version]);

  if (rows.length === 0) {
    return <p className="py-2 text-sm text-neutral-500">لا توجد وسائط بعد</p>;
  }

  const canDelete = !trial.isExpired;

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <MediaItem key={row.id} row={row} canDelete={canDelete} onDeleted={() => setVersion((v) => v + 1)} />
      ))}
    </div>
  );
}
