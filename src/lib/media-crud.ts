import type { LocalMedia, MediaType } from '../types/models';
import { db } from './db';
import { bumpVersion, queueOutbox } from './sync-helpers';
import { validateMediaTargets } from './xor-guards';
import {
  bucketForKind,
  MEDIA_AUDIO_MAX_SECONDS,
  storagePathForMedia,
  validateFileForKind,
  validateAudioDuration,
  isTrialExpired,
} from './media';
import { supabase } from './supabase';

/**
 * M7 — Local-first mutation pipeline for media (audio/image).
 * Mirrors entity-crud.ts / note-crud.ts but additionally uploads the file
 * bytes to Supabase Storage before queuing the metadata row.
 *
 * Storage path convention: <uid>/<mediaId>.<ext> inside the bucket
 * `media-images` or `media-audio`. The metadata row's `url` column stores
 * this path verbatim; rendering resolves it via getPublicUrl / download.
 */

const INITIAL_VERSION = 1;
const NEVER_SYNCED_SERVER_VERSION = 0;

function todayIso(): string {
  return new Date().toISOString();
}

function toMediaPayload(record: LocalMedia): Record<string, unknown> {
  const r: Record<string, unknown> = { ...record };
  delete r.dirty;
  delete r.server_version;
  return r;
}

function assertValidTargets(noteId: string | null, lectureId: string | null) {
  const v = validateMediaTargets(noteId, lectureId);
  if (!v.ok) throw new Error(v.reason);
}

function normalizeTarget(v: string | null): string | null {
  return v !== null && v.trim().length > 0 ? v : null;
}

/** Create media attached to exactly one parent; uploads bytes first. */
export async function createMedia(params: {
  user_id: string;
  note_id: string | null;
  lecture_id: string | null;
  type: MediaType;
  file: File;
  /** For audio, pre-validated duration; if omitted, validated here. */
  duration_seconds?: number | null;
}): Promise<string> {
  const noteId = normalizeTarget(params.note_id);
  const lectureId = normalizeTarget(params.lecture_id);
  assertValidTargets(noteId, lectureId);

  // Trial gate (client-side mirror of RLS — authoritative check is DB).
  const user = await db.users.get(params.user_id);
  if (user && isTrialExpired(user.media_trial_started_at)) {
    throw new Error('انتهت فترة التجربة — الرفع محظور، ملفاتك الحالية محفوظة للقراءة فقط');
  }

  const kind = params.type; // 'audio' | 'image'
  const fileCheck = validateFileForKind(params.file, kind);
  if (!fileCheck.ok) throw new Error(fileCheck.reason);

  let duration: number | null = params.duration_seconds ?? null;
  if (kind === 'audio') {
    if (duration === null) {
      const d = await validateAudioDuration(params.file);
      if (!d.ok) throw new Error(d.reason);
      duration = d.duration;
    } else if (duration > MEDIA_AUDIO_MAX_SECONDS) {
      throw new Error(`مدة الملف تتجاوز 5 دقائق (${duration} ثانية)`);
    }
  } else {
    duration = null;
  }

  const mediaId = crypto.randomUUID();
  const bucket = bucketForKind(kind);
  const path = storagePathForMedia(params.user_id, mediaId, params.file.type || (kind === 'image' ? 'image/jpeg' : 'audio/mpeg'));
  const now = todayIso();

  const record: LocalMedia = {
    id: mediaId,
    user_id: params.user_id,
    note_id: noteId,
    lecture_id: lectureId,
    type: kind,
    url: path,
    duration_seconds: duration,
    created_at: now,
    updated_at: now,
    version: INITIAL_VERSION,
    dirty: true,
    server_version: NEVER_SYNCED_SERVER_VERSION,
  };

  // 1) Try Storage upload first (requires network + session).
  // If offline / transient, queue blob for retry and still persist metadata row.
  let uploadSucceeded = false;
  let uploadError: string | null = null;

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, params.file, {
      upsert: false,
      contentType: params.file.type || undefined,
    });
    if (error) {
      uploadError = error.message;
    } else {
      uploadSucceeded = true;
    }
  } catch (e) {
    uploadError = e instanceof Error ? e.message : String(e);
  }

  if (!uploadSucceeded) {
    // Network/offline or bucket error — persist pending blob for retry.
    // Still create the local metadata row so UI shows it immediately.
    // The outbox entry will be retried after storage succeeds.
    await db.transaction('rw', db.media, db.outbox, db.pending_media_uploads, db.users, async () => {
      await db.media.add(record);
      await db.pending_media_uploads.put({
        mediaId,
        userId: params.user_id,
        bucket,
        path,
        mime: params.file.type,
        blob: params.file,
        createdAt: now,
      });
      await queueOutbox({
        table_name: 'media',
        op: 'insert',
        record_id: mediaId,
        payload: toMediaPayload(record),
      });
      // Optimistic trial stamp locally so countdown updates instantly.
      if (user && (user.media_trial_started_at === null || user.media_trial_started_at === undefined)) {
        await (db.users as unknown as { update: (key: string, changes: Record<string, unknown>) => Promise<number> }).update(
          params.user_id,
          { media_trial_started_at: now, updated_at: now, version: user.version },
        );
      }
    });
    // Surface a soft error so caller can show "سيُرفع عند عودة الاتصال"
    if (uploadError && !isOfflineError(uploadError)) {
      // Non-offline storage error (e.g., trial-blocked RLS) — surface it.
      // Keep the row + pending blob so user can retry after fixing.
      throw new Error(uploadError);
    }
    return mediaId;
  }

  // 2) Upload succeeded — persist row + outbox + optimistic trial stamp.
  await db.transaction('rw', db.media, db.outbox, db.users, async () => {
    await db.media.add(record);
    await queueOutbox({
      table_name: 'media',
      op: 'insert',
      record_id: mediaId,
      payload: toMediaPayload(record),
    });
    // Optimistic local trial start (server trigger is authoritative; this is instant UI).
    const localUser = await db.users.get(params.user_id);
    if (localUser && (localUser.media_trial_started_at === null || localUser.media_trial_started_at === undefined)) {
      await (db.users as unknown as { update: (key: string, changes: Record<string, unknown>) => Promise<number> }).update(
        params.user_id,
        {
          media_trial_started_at: now,
          updated_at: now,
          version: localUser.version,
          dirty: true,
          server_version: localUser.server_version,
        },
      );
      // Also try to push the user row optimistically via outbox? The trigger
      // already sets it server-side, so we piggyback on next pull. No extra outbox needed
      // because the media insert itself will stamp it. We keep local update for countdown.
    }
  });

  // Fire-and-forget: try to update the cloud users row as well (best-effort mirror of trigger).
  // If RLS blocks (e.g., expired), the trigger would have already handled first-upload.
  void (supabase.from('users') as unknown as { update: (v: Record<string, unknown>) => { eq: (c: string, v2: unknown) => { is: (c2: string, v3: unknown) => Promise<unknown> } } })
    .update({ media_trial_started_at: now })
    .eq('id', params.user_id)
    .is('media_trial_started_at', null)
    .then(() => {});

  return mediaId;
}

function isOfflineError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('network') || m.includes('failed to fetch') || m.includes('offline') || m.includes('fetch');
}

/** Delete media — blocked after trial expiry at RLS layer (read-only). */
export async function deleteMedia(mediaId: string): Promise<void> {
  const existing = await db.media.get(mediaId);
  if (!existing) return;

  const user = await db.users.get(existing.user_id);
  if (user && isTrialExpired(user.media_trial_started_at)) {
    throw new Error('انتهت فترة التجربة — لا يمكن حذف الملفات بعد التجميد');
  }

  // Try storage delete first (best-effort; if offline, queue pending delete).
  const bucket = bucketForKind(existing.type);
  try {
    await supabase.storage.from(bucket).remove([existing.url]);
  } catch {
    // Ignore — row delete will be retried via outbox; orphan object can be GC'd.
  }

  await db.transaction('rw', db.media, db.outbox, db.pending_media_uploads, async () => {
    await db.media.delete(mediaId);
    await db.pending_media_uploads.delete(mediaId);
    await queueOutbox({ table_name: 'media', op: 'delete', record_id: mediaId, payload: null });
  });
}

/** Update media metadata (e.g., re-parent) — bumps version; blocked after expiry. */
export async function updateMedia(
  current: LocalMedia,
  changes: Partial<Pick<LocalMedia, 'note_id' | 'lecture_id' | 'duration_seconds'>>,
): Promise<void> {
  const user = await db.users.get(current.user_id);
  if (user && isTrialExpired(user.media_trial_started_at)) {
    throw new Error('انتهت فترة التجربة — الملفات الحالية للقراءة فقط');
  }
  const nextNoteId = changes.note_id !== undefined ? normalizeTarget(changes.note_id) : current.note_id;
  const nextLectureId = changes.lecture_id !== undefined ? normalizeTarget(changes.lecture_id) : current.lecture_id;
  assertValidTargets(nextNoteId, nextLectureId);

  const next = bumpVersion({
    ...current,
    ...changes,
    note_id: nextNoteId,
    lecture_id: nextLectureId,
    updated_at: todayIso(),
  });

  await db.transaction('rw', db.media, db.outbox, async () => {
    await db.media.put(next);
    await queueOutbox({ table_name: 'media', op: 'update', record_id: next.id, payload: toMediaPayload(next) });
  });
}

/** Retry all pending blobs (call on online / visibilitychange / interval). */
export async function retryPendingUploads(): Promise<number> {
  const pendings = await db.pending_media_uploads.toArray();
  let retried = 0;
  for (const p of pendings) {
    try {
      const { error } = await supabase.storage.from(p.bucket).upload(p.path, p.blob, {
        upsert: false,
        contentType: p.mime || undefined,
      });
      if (!error) {
        await db.pending_media_uploads.delete(p.mediaId);
        retried++;
      } else if (isOfflineError(error.message)) {
        // Keep pending for next cycle
      } else {
        // Permanent storage error (e.g., trial blocked) — keep pending but surface via last_error?
        // For now keep pending so user can observe; don't delete.
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isOfflineError(msg)) {
        // Permanent — keep pending
      }
    }
  }
  return retried;
}

/** Resolve a storage path to a signed/download URL (for rendering). */
export async function getMediaDownloadUrl(bucket: string, path: string): Promise<string | null> {
  // Private bucket: create a short-lived signed URL. Falls back to publicUrl if bucket is public.
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
  } catch {
    // ignore
  }
  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch {
    // ignore
  }
  return null;
}
