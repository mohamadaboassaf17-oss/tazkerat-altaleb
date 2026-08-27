/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMedia, LocalNote, LocalUser } from '../types/models';
import { db } from './db';

// Mock supabase with auth + from(users) + storage
const storageUploadMock = vi.fn();
const storageRemoveMock = vi.fn();
const storageCreateSignedUrlMock = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user_1' } } }, error: null }) },
    from: (table: string) => {
      if (table === 'users') {
        return {
          update: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      // generic fallback for other tables (not used in media-crud success path)
      return {
        update: () => ({ eq: () => ({ is: () => Promise.resolve({ data: null, error: null }) }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        upsert: () => Promise.resolve({ data: null, error: null }),
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    },
    storage: {
      from: (_bucket: string) => ({
        upload: storageUploadMock,
        remove: storageRemoveMock,
        createSignedUrl: storageCreateSignedUrlMock,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  },
}));

import { createMedia, deleteMedia, retryPendingUploads, updateMedia } from './media-crud';

function fileFor(kind: 'image' | 'audio', size = 100, mime?: string): File {
  const m = mime ?? (kind === 'image' ? 'image/jpeg' : 'audio/mpeg');
  return new File([new Uint8Array(size)], `test.${kind === 'image' ? 'jpg' : 'mp3'}`, { type: m });
}

async function seedUser(trialStartedAt: string | null) {
  const now = new Date().toISOString();
  const user: LocalUser = {
    id: 'user_1',
    email: 'u@example.com',
    display_name: 'طالب',
    media_trial_started_at: trialStartedAt,
    created_at: now,
    updated_at: now,
    version: 1,
    dirty: false,
    server_version: 1,
  };
  await db.users.put(user);
}

async function seedNote(noteId: string) {
  const now = new Date().toISOString();
  const note: LocalNote = {
    id: noteId,
    user_id: 'user_1',
    book_id: null,
    lecture_id: null,
    title: 'ملاحظة',
    content: 'محتوى',
    type: 'benefit',
    review_date: now.slice(0, 10),
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    is_public: false,
    created_at: now,
    updated_at: now,
    version: 1,
    dirty: false,
    server_version: 1,
  };
  await db.notes.put(note);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  storageUploadMock.mockReset();
  storageRemoveMock.mockReset();
  storageCreateSignedUrlMock.mockReset();
  // default success
  storageUploadMock.mockResolvedValue({ data: { path: 'ok' }, error: null });
  storageRemoveMock.mockResolvedValue({ data: {}, error: null });
  storageCreateSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed.example' }, error: null });
});

describe('createMedia', () => {
  it('uploads file, creates local row and outbox insert, and sets trial start optimistically', async () => {
    await seedUser(null);
    await seedNote('note_1');

    const f = fileFor('image', 200);
    const mediaId = await createMedia({
      user_id: 'user_1',
      note_id: 'note_1',
      lecture_id: null,
      type: 'image',
      file: f,
    });

    expect(storageUploadMock).toHaveBeenCalledOnce();
    const [pathArg, fileArg] = [storageUploadMock.mock.calls[0]?.[0], storageUploadMock.mock.calls[0]?.[1]];
    expect(typeof pathArg).toBe('string');
    expect((pathArg as string).startsWith('user_1/')).toBe(true);
    expect(fileArg).toBe(f);

    const row = (await db.media.get(mediaId)) as LocalMedia | undefined;
    expect(row).toBeDefined();
    expect(row?.user_id).toBe('user_1');
    expect(row?.note_id).toBe('note_1');
    expect(row?.type).toBe('image');
    expect(row?.duration_seconds).toBeNull();
    expect(row?.version).toBe(1);
    expect(row?.dirty).toBe(true);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.table_name).toBe('media');
    expect(outbox[0]?.op).toBe('insert');

    const user = await db.users.get('user_1');
    expect(user?.media_trial_started_at).not.toBeNull();
  });

  it('rejects when both note_id and lecture_id are set (XOR)', async () => {
    await seedUser(null);
    await expect(
      createMedia({
        user_id: 'user_1',
        note_id: 'note_1',
        lecture_id: 'lec_1',
        type: 'image',
        file: fileFor('image'),
      }),
    ).rejects.toThrow();
    expect(await db.media.count()).toBe(0);
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it('rejects when trial is expired (31 days ago)', async () => {
    const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await seedUser(past);
    await seedNote('note_1');
    await expect(
      createMedia({
        user_id: 'user_1',
        note_id: 'note_1',
        lecture_id: null,
        type: 'image',
        file: fileFor('image'),
      }),
    ).rejects.toThrow('انتهت فترة التجربة');
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it('queues pending blob when storage upload fails with network error', async () => {
    await seedUser(null);
    await seedNote('note_1');
    storageUploadMock.mockRejectedValue(new Error('Failed to fetch'));

    const f = fileFor('image', 200);
    const mediaId = await createMedia({
      user_id: 'user_1',
      note_id: 'note_1',
      lecture_id: null,
      type: 'image',
      file: f,
    });

    const pending = await db.pending_media_uploads.get(mediaId);
    expect(pending).toBeDefined();
    expect(pending?.blob).toBeDefined();
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
  });

  it('rejects audio exceeding 5 minutes when duration supplied', async () => {
    await seedUser(null);
    await seedNote('note_1');
    await expect(
      createMedia({
        user_id: 'user_1',
        note_id: 'note_1',
        lecture_id: null,
        type: 'audio',
        file: fileFor('audio'),
        duration_seconds: 301,
      }),
    ).rejects.toThrow('5 دقائق');
    expect(storageUploadMock).not.toHaveBeenCalled();
  });
});

describe('deleteMedia', () => {
  it('blocks delete after trial expiry', async () => {
    await seedUser(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString());
    const now = new Date().toISOString();
    await db.media.put({
      id: 'm1',
      user_id: 'user_1',
      note_id: null,
      lecture_id: 'lec_1',
      type: 'image',
      url: 'user_1/m1.jpg',
      duration_seconds: null,
      created_at: now,
      updated_at: now,
      version: 1,
      dirty: false,
      server_version: 1,
    } as LocalMedia);
    await expect(deleteMedia('m1')).rejects.toThrow('لا يمكن حذف');
  });
});

describe('updateMedia', () => {
  it('blocks update after trial expiry', async () => {
    await seedUser(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString());
    const now = new Date().toISOString();
    const row: LocalMedia = {
      id: 'm1',
      user_id: 'user_1',
      note_id: null,
      lecture_id: 'lec_1',
      type: 'image',
      url: 'user_1/m1.jpg',
      duration_seconds: null,
      created_at: now,
      updated_at: now,
      version: 1,
      dirty: false,
      server_version: 1,
    };
    await db.media.put(row);
    await expect(updateMedia(row, { note_id: 'note_x' })).rejects.toThrow('للقراءة فقط');
  });
});

describe('retryPendingUploads', () => {
  it('retries pending blobs and clears on success', async () => {
    await db.pending_media_uploads.put({
      mediaId: 'm_pending',
      userId: 'user_1',
      bucket: 'media-images',
      path: 'user_1/m_pending.jpg',
      mime: 'image/jpeg',
      blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
      createdAt: new Date().toISOString(),
    });
    storageUploadMock.mockResolvedValue({ data: { path: 'user_1/m_pending.jpg' }, error: null });
    const n = await retryPendingUploads();
    expect(n).toBe(1);
    expect(await db.pending_media_uploads.get('m_pending')).toBeUndefined();
  });
});
