import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { liveQuery } from 'dexie';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog';
import { EntityDialog } from '../components/entity-dialog';
import { FormField } from '../components/form-field';
import { useAuth } from '../lib/auth';
import {
  countLecturerChildren,
  createEntity,
  deleteEntity,
  touchBookOpened,
  updateEntity,
} from '../lib/entity-crud';
import { validateRequiredText } from '../lib/entity-validation';
import { db } from '../lib/db';
import type { LocalBook, LocalLecturer } from '../types/models';

const LOAD_ERROR = 'تعذّر تحميل المدرّسين المحليين.';
const SESSION_ERROR = 'انتهت الجلسة، أعد تسجيل الدخول.';
const GENERIC_MUTATION_ERROR = 'تعذّر تنفيذ العملية، حاول مجددًا.';
const DELETE_BLOCKED = 'لا يمكن حذف المدرّس لاحتوائه على محاضرات مرتبطة — احذفها أولًا.';

export default function LecturersScreen(): ReactElement {
  const { categoryId, bookId } = useParams();
  const { user } = useAuth();

  const [book, setBook] = useState<LocalBook | null>(null);
  const [parentMissing, setParentMissing] = useState(false);
  const [lecturers, setLecturers] = useState<LocalLecturer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalLecturer | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LocalLecturer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // last_opened_at fires once per entry into the book's detail view —
  // never per render. The ref survives StrictMode's double effect pass;
  // a fresh navigation remounts and legitimately records again.
  const openedBookIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    if (bookId === undefined) {
      if (active) {
        setParentMissing(true);
        setIsLoading(false);
      }
      return;
    }

    void db.books
      .get(bookId)
      .then((row) => {
        if (!active) return;
        setBook(row ?? null);
        setParentMissing(row === undefined);
      })
      .catch((error: unknown) => {
        console.error('Failed to load the parent book:', error);
        if (active) {
          setPageError(LOAD_ERROR);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (book === null || openedBookIdRef.current === book.id) {
      return;
    }
    openedBookIdRef.current = book.id;

    void touchBookOpened(book.id).catch((error: unknown) => {
      console.error('Failed to record the book opening:', error);
      setPageError('تعذّر تحديث وقت فتح الكتاب.');
    });
  }, [book]);

  useEffect(() => {
    if (user === null) {
      setIsLoading(false);
      return;
    }

    const subscription = liveQuery(() =>
      db.lecturers.where('user_id').equals(user.id).toArray(),
    ).subscribe({
      next: (rows) => {
        const scoped =
          bookId === undefined ? [] : rows.filter((l) => l.book_id === bookId);
        setLecturers([...scoped].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
        setIsLoading(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load lecturers:', error);
        setPageError(LOAD_ERROR);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [user, bookId]);

  function openCreate(): void {
    setEditing(null);
    setName('');
    setNameError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEdit(lecturer: LocalLecturer): void {
    setEditing(lecturer);
    setName(lecturer.name);
    setNameError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openDelete(lecturer: LocalLecturer): void {
    setDeleteError(null);
    setDeleteTarget(lecturer);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (user === null) {
      setFormError(SESSION_ERROR);
      return;
    }
    if (book === null) {
      setFormError(GENERIC_MUTATION_ERROR);
      return;
    }

    const nextNameError = validateRequiredText(name, 'اسم المدرّس');
    setNameError(nextNameError);
    if (nextNameError !== null) {
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      if (editing === null) {
        await createEntity(db.lecturers, 'lecturers', {
          user_id: user.id,
          book_id: book.id,
          name: name.trim(),
        });
      } else {
        await updateEntity(db.lecturers, 'lecturers', editing, { name: name.trim() });
      }
      setIsFormOpen(false);
    } catch (error: unknown) {
      console.error('Failed to save lecturer:', error);
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
      // Delete-blocking policy: a lecturer with lectures must never be deleted.
      const childCount = await countLecturerChildren(deleteTarget.id);
      if (childCount > 0) {
        setDeleteError(DELETE_BLOCKED);
        return;
      }

      await deleteEntity(db.lecturers, 'lecturers', deleteTarget.id);
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error('Failed to delete lecturer:', error);
      setDeleteError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  if (bookId === undefined || categoryId === undefined || (isLoading === false && parentMissing)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
          to="/categories"
        >
          العودة إلى التصنيفات
        </Link>
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {bookId === undefined || categoryId === undefined
            ? 'رابط غير صالح.'
            : 'لم يتم العثور على هذا الكتاب.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
        to={`/categories/${categoryId}`}
      >
        العودة إلى الكتب
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-brand-800">
            {book?.title ?? 'المدرّسون'}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">المدرّسون المرتبطون بهذا الكتاب.</p>
        </div>
        <button
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
          onClick={openCreate}
          type="button"
        >
          إضافة مدرّس
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
      ) : lecturers.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-neutral-600">لا يوجد مدرّسون لهذا الكتاب بعد.</p>
          <button
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
            onClick={openCreate}
            type="button"
          >
            إضافة أول مدرّس
          </button>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {lecturers.map((lecturer) => (
            <li
              className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
              key={lecturer.id}
            >
              <Link
                className="min-w-0 flex-1"
                to={`/categories/${categoryId}/books/${bookId}/lecturers/${lecturer.id}`}
              >
                <span className="block truncate font-medium text-neutral-900">
                  {lecturer.name}
                </span>
              </Link>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                onClick={() => openEdit(lecturer)}
                type="button"
              >
                تعديل
              </button>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                onClick={() => openDelete(lecturer)}
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
          title={editing === null ? 'مدرّس جديد' : 'تعديل المدرّس'}
        >
          <FormField
            error={nameError}
            label="اسم المدرّس"
            onChange={setName}
            placeholder="مثال: الشيخ صالح الفوزان"
            value={name}
          />
        </EntityDialog>
      )}

      {deleteTarget !== null && (
        <ConfirmDeleteDialog
          entityName={deleteTarget.name}
          error={deleteError}
          isDeleting={isDeleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
