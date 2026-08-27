import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { createMedia } from '../lib/media-crud';
import { useMediaTrial } from '../hooks/useMediaTrial';
import type { MediaType } from '../types/models';

interface Props {
  /** Exactly one parent must be set (mirrors media XOR). */
  noteId?: string | null;
  lectureId?: string | null;
  onCreated?: (mediaId: string) => void;
}

export default function MediaUploader({ noteId = null, lectureId = null, onCreated }: Props) {
  const { user } = useAuth();
  const trial = useMediaTrial();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  if (trial.isExpired) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">{trial.label}</p>
        <p className="mt-2 text-amber-700">ملفاتك الحالية محفوظة للقراءة فقط — لا يمكن رفع ملفات جديدة.</p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900"
          disabled
          title="الترقية إلى Pro قريبًا — لا يوجد دفع في MVP"
        >
          الترقية إلى Pro (قريبًا)
        </button>
      </div>
    );
  }

  const handleFile = async (file: File, type: MediaType) => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const mediaId = await createMedia({
        user_id: user.id,
        note_id: noteId ?? null,
        lecture_id: lectureId ?? null,
        type,
        file,
      });
      setSuccess(type === 'image' ? 'تم رفع الصورة' : 'تم رفع الملف الصوتي');
      onCreated?.(mediaId);
      // reset inputs
      if (imageRef.current) imageRef.current.value = '';
      if (audioRef.current) audioRef.current.value = '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Network/offline soft error still created the row — show info instead of error
      if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
        setSuccess('تم الحفظ محليًا — سيُرفع عند عودة الاتصال');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-neutral-800">إضافة وسائط</p>
      <p className="mb-3 text-xs text-neutral-500">{trial.label}</p>

      <div className="flex flex-wrap gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          <span>رفع صورة</span>
          <input
            ref={imageRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f, 'image');
            }}
          />
        </label>

        <label className="inline-flex cursor-pointer items-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
          <span>رفع صوت (≤ 5 دقائق)</span>
          <input
            ref={audioRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,audio/mp4"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f, 'audio');
            }}
          />
        </label>
      </div>

      {busy && <p className="mt-3 text-sm text-neutral-500">جارٍ الرفع…</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          {success}
        </p>
      )}
    </div>
  );
}
