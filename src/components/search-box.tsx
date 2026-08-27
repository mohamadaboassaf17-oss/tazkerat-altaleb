import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

interface SearchBoxProps {
  initialValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBox({ initialValue = '', placeholder = 'ابحث في ملاحظاتك…', autoFocus = false }: SearchBoxProps): ReactElement {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    void navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2" role="search" dir="rtl">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- header search is progressive enhancement; focus is opt-in via prop
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="البحث"
        className="w-full rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-sm text-white placeholder:text-white/70 outline-none backdrop-blur focus:border-white focus:bg-white focus:text-neutral-900 focus:placeholder:text-neutral-400 sm:w-64"
      />
      <button type="submit" className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-neutral-100" aria-label="بحث">
        بحث
      </button>
    </form>
  );
}
