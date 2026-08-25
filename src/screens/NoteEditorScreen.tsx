import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog';
import { NoteEditor, type NoteDraft } from '../components/note-editor';
import { useAuth } from '../lib/auth';
import { db } from '../lib/db';
import { createNote, deleteNote, updateNote } from '../lib/note-crud';
import type { LocalBook, LocalLecture, LocalNote, NoteType } from '../types/models';

const DEFAULT_NOTE_TYPE: NoteType = 'benefit';

const NOTE_MISSING = 'الملاحظة غير موجودة.';
const INVALID_TARGET = 'رابط غير صالح: حدد كتابًا أو محاضرة واحدة فقط لربط الملاحظة.';
const BOOK_MISSING = 'لم يتم العثور على هذا الكتاب.';
const LECTURE_MISSING = 'لم يتم العثور على هذه المحاضرة.';
const LOAD_ERROR = 'تعذّر تحميل البيانات المحلية.';
const SESSION_ERROR = 'انتهت الجلسة، أعد تسجيل الدخول.';
const GENERIC_MUTATION_ERROR = 'تعذّر تنفيذ العملية، حاول مجددًا.';

const BACK_LINK_CLASS =
  'inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-700';

type ParentTarget =
  | { kind: 'book'; row: LocalBook }
  | { kind: 'lecture'; row: LocalLecture };

function LoadingBlock(): ReactElement {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="py-10 text-center text-brand-700" role="status">
        جارٍ التحميل…
      </p>
    </div>
  );
}

function FallbackBlock({ message }: { message: string }): ReactElement {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <button
        className={BACK_LINK_CLASS}
        onClick={() => {
          void navigate(-1);
        }}
        type="button"
      >
        رجوع
      </button>
      <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {message}
      </p>
    </div>
  );
}

export default function NoteEditorScreen(): ReactElement {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const currentNoteId = typeof params.noteId === 'string' ? params.noteId : null;
  const isEditMode = currentNoteId !== null;

  const rawBookParam = searchParams.get('book');
  const rawLectureParam = searchParams.get('lecture');
  const bookParam =
    rawBookParam !== null && rawBookParam.trim().length > 0 ? rawBookParam.trim() : null;
  const lectureParam =
    rawLectureParam !== null && rawLectureParam.trim().length > 0
      ? rawLectureParam.trim()
      : null;
  const isTargetInvalid = !isEditMode && (bookParam === null) === (lectureParam === null);

  const [note, setNote] = useState<LocalNote | null>(null);
  const [parent, setParent] = useState<ParentTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setPageError(null);
    setNote(null);
    setParent(null);

    if (currentNoteId !== null) {
      void db.notes
        .get(currentNoteId)
        .then((row) => {
          if (!active) return;
          setNote(row ?? null);
          setIsLoading(false);
        })
        .catch((error: unknown) => {
          console.error('Failed to load the note:', error);
          if (active) {
            setPageError(LOAD_ERROR);
            setIsLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }

    if (isTargetInvalid) {
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    if (bookParam !== null) {
      void db.books
        .get(bookParam)
        .then((row) => {
          if (!active) return;
          setParent(row === undefined ? null : { kind: 'book', row });
          setIsLoading(false);
        })
        .catch((error: unknown) => {
          console.error('Failed to load the parent book:', error);
          if (active) {
            setPageError(LOAD_ERROR);
            setIsLoading(false);
          }
        });
    } else if (lectureParam !== null) {
      void db.lectures
        .get(lectureParam)
        .then((row) => {
          if (!active) return;
          setParent(row === undefined ? null : { kind: 'lecture', row });
          setIsLoading(false);
        })
        .catch((error: unknown) => {
          console.error('Failed to load the parent lecture:', error);
          if (active) {
            setPageError(LOAD_ERROR);
            setIsLoading(false);
          }
        });
    }

    return () => {
      active = false;
    };
  }, [currentNoteId, isTargetInvalid, bookParam, lectureParam]);

  async function handleSave(draft: NoteDraft): Promise<void> {
    if (user === null) {
      setSaveError(SESSION_ERROR);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      if (note !== null) {
        await updateNote(note, { content: draft.content, type: draft.type });
      } else if (parent !== null) {
        await createNote({
          user_id: user.id,
          book_id: parent.kind === 'book' ? parent.row.id : null,
          lecture_id: parent.kind === 'lecture' ? parent.row.id : null,
          content: draft.content,
          type: draft.type,
        });
      } else {
        setSaveError(GENERIC_MUTATION_ERROR);
        return;
      }
      void navigate(-1);
    } catch (error: unknown) {
      console.error('Failed to save the note:', error);
      setSaveError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (note === null) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteNote(note.id);
      setIsDeleteOpen(false);
      void navigate(-1);
    } catch (error: unknown) {
      console.error('Failed to delete the note:', error);
      setDeleteError(GENERIC_MUTATION_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isEditMode) {
    if (isLoading) {
      return <LoadingBlock />;
    }
    if (pageError !== null) {
      return <FallbackBlock message={pageError} />;
    }
    if (note === null) {
      return <FallbackBlock message={NOTE_MISSING} />;
    }
  } else {
    if (isTargetInvalid) {
      return <FallbackBlock message={INVALID_TARGET} />;
    }
    if (user === null) {
      return <FallbackBlock message={SESSION_ERROR} />;
    }
    if (isLoading) {
      return <LoadingBlock />;
    }
    if (pageError !== null) {
      return <FallbackBlock message={pageError} />;
    }
    if (parent === null) {
      return (
        <FallbackBlock message={bookParam !== null ? BOOK_MISSING : LECTURE_MISSING} />
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <button
        className={BACK_LINK_CLASS}
        onClick={() => {
          void navigate(-1);
        }}
        type="button"
      >
        رجوع
      </button>

      <div className="mt-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-brand-800">
          {isEditMode ? 'تعديل الملاحظة' : 'ملاحظة جديدة'}
        </h2>
        {isEditMode && (
          <button
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            onClick={() => {
              setDeleteError(null);
              setIsDeleteOpen(true);
            }}
            type="button"
          >
            حذف
          </button>
        )}
      </div>

      <NoteEditor
        currentNoteId={currentNoteId}
        initialContent={note?.content ?? ''}
        initialType={note?.type ?? DEFAULT_NOTE_TYPE}
        isSaving={isSaving}
        key={note?.id ?? 'create'}
        onSave={(draft) => void handleSave(draft)}
        saveError={saveError}
        submitLabel="حفظ"
      />

      {isDeleteOpen && note !== null && (
        <ConfirmDeleteDialog
          entityName={note.title}
          error={deleteError}
          isDeleting={isDeleting}
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
