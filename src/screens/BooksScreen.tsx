import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { liveQuery } from 'dexie';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog';
import { EntityDialog } from '../components/entity-dialog';
import { FormField } from '../components/form-field';
import { useAuth } from '../lib/auth';
import {
  countBookChildren,
  createEntity,
  deleteEntity,
  updateEntity,
} from '../lib/entity-crud';
import { parseIntegerInput, validateRequiredText } from '../lib/entity-validation';
import { db } from '../lib/db';
import type { LocalBook, LocalCategory } from '../types/models';
import { VirtualList } from '../components/virtual-list';

const LOAD_ERROR = 'تعذّر تحميل الكتب المحلية.';
const SESSION_ERROR = 'انتهت الجلسة، أعد تسجيل الدخول.';
const GENERIC_MUTATION_ERROR = 'تعذّر تنفيذ العملية، حاول مجددًا.';
const DELETE_BLOCKED =
  'لا يمكن حذف الكتاب لاحتوائه على مدرّسين أو ملاحظات مرتبطة — احذفها أولًا.';

export default function BooksScreen(): ReactElement {
  const { categoryId } = useParams();
  const { user } = useAuth();

  const [category, setCategory] = useState<LocalCategory | null>(null);
  const [parentMissing, setParentMissing] = useState(false);
  const [books, setBooks] = useState<LocalBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalBook | null>(null);
  const [title, setTitle] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [totalPagesError, setTotalPagesError] = useState<string | null>(null);
  const [currentPageError, setCurrentPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LocalBook | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    if (categoryId === undefined) {
      if (active) {
        setParentMissing(true);
        setIsLoading(false);
      }
      return;
    }

    void db.categories
      .get(categoryId)
      .then((row) => {
        if (!active) return;
        setCategory(row ?? null);
        setParentMissing(row === undefined);
      })
      .catch((error: unknown) => {
        console.error('Failed to load the parent category:', error);
        if (active) {
          setPageError(LOAD_ERROR);
        }
      });

    return () => {
      active = false;
    };
  }, [categoryId]);

  useEffect(() => {
    if (user === null) {
      setIsLoading(false);
      return;
    }

    const subscription = liveQuery(() =>
      db.books.where('user_id').equals(user.id).toArray(),
    ).subscribe({
      next: (rows) => {
        const scoped = categoryId === undefined ? [] : rows.filter((b) => b.category_id === categoryId);
        setBooks([...scoped].sort((a, b) => a.title.localeCompare(b.title, 'ar')));
        setIsLoading(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load books:', error);
        setPageError(LOAD_ERROR);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [user, categoryId]);

  function openCreate(): void {
    setEditing(null);
    setTitle('');
    setTotalPages('');
    setCurrentPage('');
    setTitleError(null);
    setTotalPagesError(null);
    setCurrentPageError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEdit(book: LocalBook): void {
    setEditing(book);
    setTitle(book.title);
    setTotalPages(String(book.total_pages));
    setCurrentPage(String(book.current_page));
    setTitleError(null);
    setTotalPagesError(null);
    setCurrentPageError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openDelete(book: LocalBook): void {
    setDeleteError(null);
    setDeleteTarget(book);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (user === null) {
      setFormError(SESSION_ERROR);
      return;
    }
    if (category === null) {
      setFormError(GENERIC_MUTATION_ERROR);
      return;
    }

    const nextTitleError = validateRequiredText(title, 'عنوان الكتاب');
    setTitleError(nextTitleError);

    const parsedTotal = parseIntegerInput(totalPages);
    const nextTotalError =
      parsedTotal === null
        ? 'عدد الصفحات يجب أن يكون رقمًا صحيحًا.'
        : parsedTotal < 1
          ? 'عدد الصفحات يجب أن يكون 1 على الأقل.'
          : null;
    setTotalPagesError(nextTotalError);

    const parsedCurrent = parseIntegerInput(currentPage);
    let nextCurrentError: string | null = null;
    if (parsedCurrent === null) {
      nextCurrentError = 'الصفحة الحالية يجب أن تكون رقمًا صحيحًا.';
    } else if (parsedTotal !== null && parsedCurrent > parsedTotal) {
      nextCurrentError = 'الصفحة الحالية لا يمكن أن تتجاوز عدد صفحات الكتاب.';
    }
    setCurrentPageError(nextCurrentError);

    if (
      nextTitleError !== null ||
      nextTotalError !== null ||
      nextCurrentError !== null
    ) {
      return;
    }
    if (parsedTotal === null || parsedCurrent === null) {
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      if (editing === null) {
        await createEntity(db.books, 'books', {
          user_id: user.id,
          category_id: category.id,
          title: title.trim(),
          total_pages: parsedTotal,
          current_page: parsedCurrent,
          last_opened_at: new Date().toISOString(),
        });
      } else {
        await updateEntity(db.books, 'books', editing, {
          title: title.trim(),
          total_pages: parsedTotal,
          current_page: parsedCurrent,
        });
      }
      setIsFormOpen(false);
    } catch (error: unknown) {
      console.error('Failed to save book:', error);
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
      // Delete-blocking policy: a book with lecturers or notes must never
      // be deleted.
      const childCount = await countBookChildren(deleteTarget.id);
      if (childCount > 0) {
        setDeleteError(DELETE_BLOCKED);
        return;
      }

      await deleteEntity(db.books, 'books', deleteTarget.id);
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error('Failed to delete book:', error);
      setDeleteError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  if (categoryId === undefined || (isLoading === false && parentMissing)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
          to="/categories"
        >
          العودة إلى التصنيفات
        </Link>
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {categoryId === undefined
            ? 'رابط غير صالح.'
            : 'لم يتم العثور على هذا التصنيف.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
        to="/categories"
      >
        العودة إلى التصنيفات
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-brand-800">
            {category?.name ?? 'الكتب'}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">الكتب المسجَّلة في هذا التصنيف.</p>
        </div>
        <button
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
          onClick={openCreate}
          type="button"
        >
          إنشاء كتاب
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
      ) : books.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-neutral-600">لا توجد كتب في هذا التصنيف بعد.</p>
          <button
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
            onClick={openCreate}
            type="button"
          >
            إنشاء أول كتاب
          </button>
        </div>
      ) : (
        <VirtualList
          items={books}
          estimateSize={76}
          keyExtractor={(b) => b.id}
          ariaLabel="قائمة الكتب"
          className="mt-6 flex flex-col gap-3"
          renderItem={(book) => (
            <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
              <Link className="min-w-0 flex-1" to={`/categories/${categoryId}/books/${book.id}`}>
                <span className="block truncate font-medium text-neutral-900">{book.title}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  الصفحة {book.current_page} من {book.total_pages}
                </span>
              </Link>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                onClick={() => openEdit(book)}
                type="button"
              >
                تعديل
              </button>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                onClick={() => openDelete(book)}
                type="button"
              >
                حذف
              </button>
            </div>
          )}
        />
      )}

      {isFormOpen && (
        <EntityDialog
          formError={formError}
          isSubmitting={isSaving}
          onCancel={() => setIsFormOpen(false)}
          onSubmit={(event) => void handleSubmit(event)}
          submitLabel="حفظ"
          title={editing === null ? 'كتاب جديد' : 'تعديل الكتاب'}
        >
          <FormField
            error={titleError}
            label="عنوان الكتاب"
            onChange={setTitle}
            placeholder="مثال: الأصول الثلاثة"
            value={title}
          />
          <FormField
            error={totalPagesError}
            inputMode="numeric"
            label="عدد الصفحات"
            onChange={setTotalPages}
            placeholder="مثال: 120"
            value={totalPages}
          />
          <FormField
            error={currentPageError}
            inputMode="numeric"
            label="الصفحة الحالية"
            onChange={setCurrentPage}
            placeholder="مثال: 45"
            value={currentPage}
          />
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
