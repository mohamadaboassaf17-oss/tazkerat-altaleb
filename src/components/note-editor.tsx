import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { extractTitle } from '../lib/note-text';
import type { NoteType } from '../types/models';
import { Spinner } from './form-field';
import { WikiAutocomplete } from './wiki-autocomplete';

const TYPE_LABELS: Record<NoteType, string> = {
  benefit: 'فائدة',
  rule: 'قاعدة',
  question: 'سؤال',
  commentary: 'تعقيب',
  memorization: 'حفظ',
};

const TYPE_OPTIONS: ReadonlyArray<{ value: NoteType; label: string }> = (
  Object.entries(TYPE_LABELS) as Array<[NoteType, string]>
).map(([value, label]) => ({ value, label }));

const SELECTED_PILL_CLASS =
  'cursor-pointer rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700';
const IDLE_PILL_CLASS =
  'cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100';

const EMPTY_CONTENT_ERROR = 'لا يمكن حفظ ملاحظة فارغة.';

export interface NoteDraft {
  content: string;
  type: NoteType;
}

interface NoteEditorProps {
  initialContent: string;
  initialType: NoteType;
  isSaving: boolean;
  saveError: string | null;
  submitLabel: string;
  currentNoteId?: string | null;
  onSave: (draft: NoteDraft) => void;
}

export function NoteEditor({
  initialContent,
  initialType,
  isSaving,
  saveError,
  submitLabel,
  currentNoteId = null,
  onSave,
}: NoteEditorProps): ReactElement {
  const contentFieldId = useId();
  const [content, setContent] = useState(initialContent);
  const [type, setType] = useState<NoteType>(initialType);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (content.trim().length === 0) {
      setValidationError(EMPTY_CONTENT_ERROR);
      return;
    }
    setValidationError(null);
    onSave({ content, type });
  }

  return (
    <form className="mt-6 flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-neutral-700">نوع الملاحظة</legend>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((option) => (
            <label
              className={type === option.value ? SELECTED_PILL_CLASS : IDLE_PILL_CLASS}
              key={option.value}
            >
              <input
                checked={type === option.value}
                className="sr-only"
                name="note-type"
                onChange={() => setType(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700">
          العنوان (يُستخرج تلقائيًا من أول سطر)
        </span>
        <p className="rounded-lg bg-brand-50 px-3 py-2 font-medium text-brand-800">
          {extractTitle(content)}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor={contentFieldId}>
          نص الملاحظة
        </label>
        <WikiAutocomplete
          className="min-h-64"
          currentNoteId={currentNoteId}
          id={contentFieldId}
          onChange={setContent}
          placeholder="اكتب الملاحظة هنا… اكتب [[ للربط بملاحظة أخرى"
          value={content}
        />
        {validationError !== null && (
          <p className="text-sm text-red-600" role="alert">
            {validationError}
          </p>
        )}
      </div>

      {saveError !== null && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {saveError}
        </p>
      )}

      <button
        className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? (
          <>
            <Spinner /> جارٍ الحفظ…
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}

export function NoteTypeBadge({ type }: { type: NoteType }): ReactElement {
  return (
    <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
      {TYPE_LABELS[type]}
    </span>
  );
}
