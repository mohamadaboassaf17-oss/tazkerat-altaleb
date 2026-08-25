import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { stripTashkeel } from '../lib/arabic-text';
import { db } from '../lib/db';
import type { LocalNote } from '../types/models';

const OPEN_TOKEN_PATTERN = /\[\[([^\][]*)$/;
const MAX_SUGGESTIONS = 8;

const TEXTAREA_BASE_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 disabled:bg-neutral-100';

const OPTION_CLASS = 'block w-full px-3 py-2 text-start text-sm text-neutral-800';
const ACTIVE_OPTION_CLASS =
  'block w-full bg-brand-50 px-3 py-2 text-start text-sm text-brand-800';

const CARET_MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

interface WikiAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  currentNoteId?: string | null;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function findOpenQuery(textBeforeCaret: string): string | null {
  return OPEN_TOKEN_PATTERN.exec(textBeforeCaret)?.[1] ?? null;
}

export function WikiAutocomplete({
  value,
  onChange,
  currentNoteId = null,
  id,
  placeholder,
  disabled = false,
  className = '',
}: WikiAutocompleteProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LocalNote[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const popoverOpen = query !== null;

  useEffect(() => {
    setLoadFailed(false);
    if (!popoverOpen) {
      return;
    }
    let active = true;
    void db.notes
      .toArray()
      .then((rows) => {
        if (!active) return;
        setCandidates(
          currentNoteId === null ? rows : rows.filter((row) => row.id !== currentNoteId),
        );
      })
      .catch((error: unknown) => {
        console.error('Failed to load note titles for autocomplete:', error);
        if (active) {
          setCandidates([]);
          setLoadFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [popoverOpen, currentNoteId]);

  const suggestions = useMemo(() => {
    if (query === null) {
      return [];
    }
    const needle = stripTashkeel(query).toLowerCase();
    return candidates
      .filter((note) => stripTashkeel(note.title).toLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title, 'ar'))
      .slice(0, MAX_SUGGESTIONS);
  }, [candidates, query]);

  const clampedHighlight = Math.min(highlightIndex, Math.max(suggestions.length - 1, 0));

  function syncQueryFromDom(): void {
    const el = textareaRef.current;
    if (el === null) {
      return;
    }
    const caret = el.selectionStart ?? el.value.length;
    setQuery(findOpenQuery(el.value.slice(0, caret)));
    setHighlightIndex(0);
  }

  function applySuggestion(note: LocalNote): void {
    const el = textareaRef.current;
    if (el === null) {
      setQuery(null);
      return;
    }
    const caret = el.selectionStart ?? el.value.length;
    const liveValue = el.value;
    const openMatch = OPEN_TOKEN_PATTERN.exec(liveValue.slice(0, caret));
    if (openMatch === null) {
      setQuery(null);
      return;
    }
    const tokenStart = openMatch.index;
    const token = `[[${note.id}|${note.title}]]`;
    onChange(liveValue.slice(0, tokenStart) + token + liveValue.slice(caret));
    setQuery(null);
    window.requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node === null) {
        return;
      }
      node.focus();
      const nextCaret = tokenStart + token.length;
      node.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const el = event.target;
    const caret = el.selectionStart ?? el.value.length;
    onChange(el.value);
    setQuery(findOpenQuery(el.value.slice(0, caret)));
    setHighlightIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (!popoverOpen || suggestions.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = suggestions[clampedHighlight];
      if (selected !== undefined) {
        applySuggestion(selected);
      }
    } else if (event.key === 'Escape') {
      setQuery(null);
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (CARET_MOVE_KEYS.has(event.key)) {
      syncQueryFromDom();
    }
  }

  function handleOptionMouseDown(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
  }

  return (
    <div className="relative">
      <textarea
        aria-activedescendant={
          popoverOpen && suggestions.length > 0
            ? `${listboxId}-${clampedHighlight}`
            : undefined
        }
        aria-controls={popoverOpen ? listboxId : undefined}
        aria-expanded={popoverOpen}
        aria-haspopup="listbox"
        autoComplete="off"
        className={`${TEXTAREA_BASE_CLASS} ${className}`.trim()}
        dir="rtl"
        disabled={disabled}
        id={id}
        onBlur={() => setQuery(null)}
        onChange={handleChange}
        onClick={syncQueryFromDom}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        placeholder={placeholder}
        ref={textareaRef}
        value={value}
      />
      {popoverOpen && loadFailed && (
        <div
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-red-700 shadow-lg"
          role="alert"
        >
          تعذّر تحميل الاقتراحات
        </div>
      )}
      {popoverOpen && !loadFailed && suggestions.length > 0 && (
        <ul
          className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-60 flex-col overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((note, index) => (
            <li key={note.id} role="presentation">
              <button
                aria-selected={index === clampedHighlight}
                className={index === clampedHighlight ? ACTIVE_OPTION_CLASS : OPTION_CLASS}
                id={`${listboxId}-${index}`}
                onClick={() => applySuggestion(note)}
                onMouseDown={handleOptionMouseDown}
                role="option"
                type="button"
              >
                {stripTashkeel(note.title)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
