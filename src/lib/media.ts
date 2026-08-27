/**
 * M7 — Media helpers: trial window math + audio duration validation.
 * Pure functions; no Supabase / Dexie I/O here.
 */

export const MEDIA_AUDIO_MAX_SECONDS = 300;
export const MEDIA_TRIAL_DAYS = 30;
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB — mirrors bucket file_size_limit

const IMAGE_MIME_ALLOW = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const AUDIO_MIME_ALLOW = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
]);

export type MediaKind = 'image' | 'audio';

/** Infer bucket name from media kind. */
export function bucketForKind(kind: MediaKind): string {
  return kind === 'audio' ? 'media-audio' : 'media-images';
}

/** Extension from MIME (fallback to 'bin'). */
export function extForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  };
  return map[mime] ?? 'bin';
}

/** Validate file size + mime for a given kind. Pure. */
export function validateFileForKind(
  file: File,
  kind: MediaKind,
): { ok: true } | { ok: false; reason: string } {
  if (file.size > MEDIA_MAX_BYTES) {
    return { ok: false, reason: `حجم الملف يتجاوز الحد المسموح (10 ميغابايت)` };
  }
  if (file.size === 0) {
    return { ok: false, reason: `الملف فارغ` };
  }
  const mime = file.type.toLowerCase();
  if (kind === 'image' && !IMAGE_MIME_ALLOW.has(mime)) {
    return { ok: false, reason: `نوع الصورة غير مدعوم` };
  }
  if (kind === 'audio' && !AUDIO_MIME_ALLOW.has(mime)) {
    // Allow generic audio/* as fallback but still cap duration separately
    if (!mime.startsWith('audio/')) {
      return { ok: false, reason: `نوع الصوت غير مدعوم` };
    }
  }
  return { ok: true };
}

/**
 * Validate audio duration via an <audio> element.
 * Resolves with duration seconds (rounded) or a reason.
 * Caller must not call during SSR.
 */
export function validateAudioDuration(file: File): Promise<
  { ok: true; duration: number } | { ok: false; reason: string }
> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      audio.load();
    };
    audio.onloadedmetadata = () => {
      const raw = audio.duration;
      cleanup();
      if (!Number.isFinite(raw) || raw <= 0) {
        resolve({ ok: false, reason: `تعذر قراءة مدة الملف الصوتي` });
        return;
      }
      const duration = Math.round(raw);
      if (duration > MEDIA_AUDIO_MAX_SECONDS) {
        resolve({ ok: false, reason: `مدة الملف تتجاوز 5 دقائق (${duration} ثانية)` });
        return;
      }
      resolve({ ok: true, duration });
    };
    audio.onerror = () => {
      cleanup();
      resolve({ ok: false, reason: `تعذر قراءة الملف الصوتي` });
    };
    audio.src = url;
  });
}

// ------------------------------------------------------------------ trial ---

/** True when the trial window is still open (or never started = open for first upload). */
export function isTrialOpen(trialStartedAt: string | null | undefined): boolean {
  if (trialStartedAt === null || trialStartedAt === undefined || trialStartedAt.trim() === '') {
    return true;
  }
  const start = Date.parse(trialStartedAt);
  if (Number.isNaN(start)) return true; // corrupt value → allow (server will decide)
  const elapsed = Date.now() - start;
  return elapsed < MEDIA_TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

/** True when trial has expired. */
export function isTrialExpired(trialStartedAt: string | null | undefined): boolean {
  return !isTrialOpen(trialStartedAt);
}

/** Days remaining (ceiled), 0 when expired, MEDIA_TRIAL_DAYS when never started. */
export function trialDaysRemaining(trialStartedAt: string | null | undefined): number {
  if (trialStartedAt === null || trialStartedAt === undefined || trialStartedAt.trim() === '') {
    return MEDIA_TRIAL_DAYS;
  }
  const start = Date.parse(trialStartedAt);
  if (Number.isNaN(start)) return MEDIA_TRIAL_DAYS;
  const elapsedMs = Date.now() - start;
  const totalMs = MEDIA_TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = totalMs - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/** Arabic countdown label. */
export function trialCountdownLabel(trialStartedAt: string | null | undefined): string {
  if (isTrialExpired(trialStartedAt)) {
    return 'انتهت فترة التجربة — الرفع محظور، ملفاتك الحالية محفوظة للقراءة فقط';
  }
  const days = trialDaysRemaining(trialStartedAt);
  if (trialStartedAt === null || trialStartedAt === undefined || trialStartedAt.trim() === '') {
    return `التجربة: ${MEDIA_TRIAL_DAYS} يومًا من أول رفع — لم تبدأ بعد`;
  }
  if (days === 1) return 'بقي يوم واحد في فترة التجربة';
  if (days === 2) return 'بقي يومان في فترة التجربة';
  return `بقي ${days} يومًا في فترة التجربة`;
}

/** Storage path for one media row: <uid>/<mediaId>.<ext> */
export function storagePathForMedia(userId: string, mediaId: string, mime: string): string {
  const ext = extForMime(mime);
  return `${userId}/${mediaId}.${ext}`;
}
