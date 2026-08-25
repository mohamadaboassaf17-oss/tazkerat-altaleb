import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';
import { liveQuery } from 'dexie';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog';
import { EntityDialog } from '../components/entity-dialog';
import { FormField } from '../components/form-field';
import { useAuth } from '../lib/auth';
import {
  countLectureChildren,
  createEntity,
  deleteEntity,
  updateEntity,
} from '../lib/entity-crud';
import { parseIntegerInput, validateRequiredText } from '../lib/entity-validation';
import { db } from '../lib/db';
import type { LocalLecturer, LocalLecture } from '../types/models';

const LOAD_ERROR = 'تعذّر تحميل المحاضرات المحلية.';
const SESSION_ERROR = 'انتهت الجلسة، أعد تسجيل الدخول.';
const GENERIC_MUTATION_ERROR = 'تعذّر تنفيذ العملية، حاول مجددًا.';
const DELETE_BLOCKED = 'لا يمكن حذف المحاضرة لاحتوائها على ملاحظات مرتبطة.';

export default function LecturesScreen(): ReactElement {
  const { categoryId, bookId, lecturerId } = useParams();
  const { user } = useAuth();

  const [lecturer, setLecturer] = useState<LocalLecturer | null>(null);
  const [parentMissing, setParentMissing] = useState(false);
  const [lectures, setLectures] = useState<LocalLecture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalLecture | null>(null);
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LocalLecture | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;

    if (lecturerId === undefined) {
      if (active) {
        setParentMissing(true);
        setIsLoading(false);
      }
      return;
    }

    void db.lecturers
      .get(lecturerId)
      .then((row) => {
        if (!active) return;
        setLecturer(row ?? null);
        setParentMissing(row === undefined);
      })
      .catch((error: unknown) => {
        console.error('Failed to load the parent lecturer:', error);
        if (active) {
          setPageError(LOAD_ERROR);
        }
      });

    return () => {
      active = false;
    };
  }, [lecturerId]);

  useEffect(() => {
    if (lecturerId === undefined) {
      setIsLoading(false);
      return;
    }

    const subscription = liveQuery(() =>
      db.lectures.where('lecturer_id').equals(lecturerId).toArray(),
    ).subscribe({
      next: (rows) => {
        setLectures([...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)));
        setIsLoading(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load lectures:', error);
        setPageError(LOAD_ERROR);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [lecturerId]);

  useEffect(() => {
    if (lecturerId === undefined) {
      setNoteCounts({});
      return;
    }

    const subscription = liveQuery(async () => {
      const rows = await db.lectures.where('lecturer_id').equals(lecturerId).toArray();
      const entries = await Promise.all(
        rows.map(async (lecture): Promise<readonly [string, number]> => [
          lecture.id,
          await db.notes.where('lecture_id').equals(lecture.id).count(),
        ]),
      );
      return Object.fromEntries(entries);
    }).subscribe({
      next: (counts) => {
        setNoteCounts(counts);
      },
      error: (error: unknown) => {
        console.error('Failed to load lecture note counts:', error);
        setPageError(LOAD_ERROR);
      },
    });

    return () => subscription.unsubscribe();
  }, [lecturerId]);

  function openCreate(): void {
    setEditing(null);
    setTitle('');
    setDurationMinutes('');
    setIsCompleted(false);
    setTitleError(null);
    setDurationError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEdit(lecture: LocalLecture): void {
    setEditing(lecture);
    setTitle(lecture.title);
    setDurationMinutes(String(lecture.duration_minutes));
    setIsCompleted(lecture.is_completed);
    setTitleError(null);
    setDurationError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openDelete(lecture: LocalLecture): void {
    setDeleteError(null);
    setDeleteTarget(lecture);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (user === null) {
      setFormError(SESSION_ERROR);
      return;
    }
    if (lecturer === null) {
      setFormError(GENERIC_MUTATION_ERROR);
      return;
    }

    const nextTitleError = validateRequiredText(title, 'عنوان المحاضرة');
    setTitleError(nextTitleError);

    const parsedDuration = parseIntegerInput(durationMinutes);
    let nextDurationError: string | null = null;
    if (parsedDuration === null) {
      nextDurationError = 'المدة بالدقائق يجب أن تكون رقمًا صحيحًا.';
    } else if (parsedDuration < 1) {
      nextDurationError = 'المدة بالدقائق يجب أن تكون دقيقة واحدة على الأقل.';
    }
    setDurationError(nextDurationError);

    if (nextTitleError !== null || nextDurationError !== null) {
      return;
    }
    if (parsedDuration === null) {
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      if (editing === null) {
        await createEntity(db.lectures, 'lectures', {
          lecturer_id: lecturer.id,
          title: title.trim(),
          duration_minutes: parsedDuration,
          is_completed: isCompleted,
        });
      } else {
        await updateEntity(db.lectures, 'lectures', editing, {
          title: title.trim(),
          duration_minutes: parsedDuration,
          is_completed: isCompleted,
        });
      }
      setIsFormOpen(false);
    } catch (error: unknown) {
      console.error('Failed to save lecture:', error);
      setFormError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (deleteTarget === null) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Delete-blocking policy: a lecture with notes must never be deleted.
      const childCount = await countLectureChildren(deleteTarget.id);
      if (childCount > 0) {
        setDeleteError(DELETE_BLOCKED);
        return;
      }

      await deleteEntity(db.lectures, 'lectures', deleteTarget.id);
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error('Failed to delete lecture:', error);
      setDeleteError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCompletedChange(event: ChangeEvent<HTMLInputElement>): void {
    setIsCompleted(event.target.checked);
  }

  if (
    lecturerId === undefined ||
    categoryId === undefined ||
    bookId === undefined ||
    (isLoading === false && parentMissing)
  ) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
          to="/categories"
        >
          العودة إلى التصنيفات
        </Link>
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {lecturerId === undefined || categoryId === undefined || bookId === undefined
            ? 'رابط غير صالح.'
            : 'لم يتم العثور على هذا المدرّس.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
        to={`/categories/${categoryId}/books/${bookId}`}
      >
        العودة إلى المدرّسين
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-brand-800">
            {lecturer?.name ?? 'المحاضرات'}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">محاضرات هذا المدرّس في الكتاب.</p>
        </div>
        <button
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
          onClick={openCreate}
          type="button"
        >
          إضافة محاضرة
        </button>
      </div>

      {pageError !== null && (
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {pageError}
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-brand-700" role="status">
          جارٍ التحميل…
        </p>
      ) : lectures.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-neutral-600">لا توجد محاضرات لهذا المدرّس بعد.</p>
          <button
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
            onClick={openCreate}
            type="button"
          >
            إضافة أول محاضرة
          </button>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {lectures.map((lecture) => (
            <li className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm" key={lecture.id}>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium text-neutral-900">
                  {lecture.title}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                  المدة: {lecture.duration_minutes} دقيقة
                  {lecture.is_completed && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                      مكتملة
                    </span>
                  )}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-neutral-500">
                  ملاحظات: {noteCounts[lecture.id] ?? 0}
                </span>
                <Link
                  className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                  to={`/notes/new?lecture=${lecture.id}`}
                >
                  + ملاحظة
                </Link>
              </div>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                onClick={() => openEdit(lecture)}
                type="button"
              >
                تعديل
              </button>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                onClick={() => openDelete(lecture)}
                type="button"
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}

      {isFormOpen && (
        <EntityDialog
          formError={formError}
          isSubmitting={isSaving}
          onCancel={() => setIsFormOpen(false)}
          onSubmit={(event) => void handleSubmit(event)}
          submitLabel="حفظ"
          title={editing === null ? 'محاضرة جديدة' : 'تعديل المحاضرة'}
        >
          <FormField
            error={titleError}
            label="عنوان المحاضرة"
            onChange={setTitle}
            placeholder="مثال: المحاضرة الأولى"
            value={title}
          />
          <FormField
            error={durationError}
            inputMode="numeric"
            label="المدة بالدقائق"
            onChange={setDurationMinutes}
            placeholder="مثال: 60"
            value={durationMinutes}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
            <input
              checked={isCompleted}
              className="size-4 accent-brand-600"
              onChange={handleCompletedChange}
              type="checkbox"
            />
            اكتملت المحاضرة
          </label>
        </EntityDialog>
      )}

      {deleteTarget !== null && (
        <ConfirmDeleteDialog
          entityName={deleteTarget.title}
          error={deleteError}
          isDeleting={isDeleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
