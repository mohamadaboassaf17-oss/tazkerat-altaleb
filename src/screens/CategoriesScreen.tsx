import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { liveQuery } from 'dexie';
import { Link } from 'react-router-dom';
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog';
import { EntityDialog } from '../components/entity-dialog';
import { FormField } from '../components/form-field';
import { useAuth } from '../lib/auth';
import {
  countCategoryChildren,
  createEntity,
  deleteEntity,
  updateEntity,
} from '../lib/entity-crud';
import { validateRequiredText } from '../lib/entity-validation';
import { db } from '../lib/db';
import type { LocalCategory } from '../types/models';

const LOAD_ERROR = 'تعذّر تحميل التصنيفات المحلية.';
const SESSION_ERROR = 'انتهت الجلسة، أعد تسجيل الدخول.';
const GENERIC_MUTATION_ERROR = 'تعذّر تنفيذ العملية، حاول مجددًا.';
const DELETE_BLOCKED = 'لا يمكن حذف القسم لاحتوائه على كتب مرتبطة — احذف كتبه أولًا.';

export default function CategoriesScreen(): ReactElement {
  const { user } = useAuth();

  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalCategory | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LocalCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user === null) {
      setIsLoading(false);
      return;
    }

    const subscription = liveQuery(() =>
      db.categories.where('user_id').equals(user.id).toArray(),
    ).subscribe({
      next: (rows) => {
        setCategories([...rows].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
        setIsLoading(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load categories:', error);
        setPageError(LOAD_ERROR);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [user]);

  function openCreate(): void {
    setEditing(null);
    setName('');
    setIcon('');
    setNameError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEdit(category: LocalCategory): void {
    setEditing(category);
    setName(category.name);
    setIcon(category.icon ?? '');
    setNameError(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openDelete(category: LocalCategory): void {
    setDeleteError(null);
    setDeleteTarget(category);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (user === null) {
      setFormError(SESSION_ERROR);
      return;
    }

    const nextNameError = validateRequiredText(name, 'اسم التصنيف');
    setNameError(nextNameError);
    if (nextNameError !== null) {
      return;
    }

    setFormError(null);
    setIsSaving(true);
    const iconName = icon.trim().length > 0 ? icon.trim() : null;

    try {
      if (editing === null) {
        await createEntity(db.categories, 'categories', {
          user_id: user.id,
          name: name.trim(),
          icon: iconName,
        });
      } else {
        await updateEntity(db.categories, 'categories', editing, {
          name: name.trim(),
          icon: iconName,
        });
      }
      setIsFormOpen(false);
    } catch (error: unknown) {
      console.error('Failed to save category:', error);
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
      // Delete-blocking policy: a category with books must never be deleted.
      const childCount = await countCategoryChildren(deleteTarget.id);
      if (childCount > 0) {
        setDeleteError(DELETE_BLOCKED);
        return;
      }

      await deleteEntity(db.categories, 'categories', deleteTarget.id);
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error('Failed to delete category:', error);
      setDeleteError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        className="inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700"
        to="/dashboard"
      >
        العودة إلى لوحة التحكم
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-brand-800">تصنيفاتي</h2>
          <p className="mt-1 text-sm text-neutral-500">نظّم مكتبتك عبر التصنيفات.</p>
        </div>
        <button
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
          onClick={openCreate}
          type="button"
        >
          إنشاء تصنيف
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
      ) : categories.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-neutral-600">لا توجد تصنيفات بعد.</p>
          <button
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
            onClick={openCreate}
            type="button"
          >
            إنشاء أول تصنيف
          </button>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {categories.map((category) => (
            <li
              className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
              key={category.id}
            >
              <Link className="min-w-0 flex-1" to={`/categories/${category.id}`}>
                <span className="block truncate font-medium text-neutral-900">
                  {category.icon !== null && category.icon.length > 0 && (
                    <span aria-hidden="true" className="me-2">
                      {category.icon}
                    </span>
                  )}
                  {category.name}
                </span>
              </Link>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                onClick={() => openEdit(category)}
                type="button"
              >
                تعديل
              </button>
              <button
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                onClick={() => openDelete(category)}
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
          title={editing === null ? 'تصنيف جديد' : 'تعديل التصنيف'}
        >
          <FormField
            error={nameError}
            label="اسم التصنيف"
            onChange={setName}
            placeholder="مثال: العقيدة"
            value={name}
          />
          <FormField
            label="الأيقونة (اختياري)"
            onChange={setIcon}
            placeholder="مثال: 📚"
            value={icon}
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
