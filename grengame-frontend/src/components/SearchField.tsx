import { useEffect, useRef } from "react";

export type SearchFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
  ariaLabel?: string;
};

export default function SearchField({
  value,
  onValueChange,
  onSubmit,
  onClear,
  isLoading = false,
  placeholder = "Buscar games...",
  autoFocus = false,
  inputRef,
  ariaLabel = "Buscar games",
}: SearchFieldProps) {
  const localRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const target = inputRef?.current ?? localRef.current;
    target?.focus();
  }, [autoFocus, inputRef]);

  const assignRef = (node: HTMLInputElement | null) => {
    localRef.current = node;
    if (inputRef) {
      inputRef.current = node;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }

    if (event.key === "Escape" && value) {
      event.preventDefault();
      onClear();
    }
  };

  const handleClear = () => {
    onClear();
    const target = inputRef?.current ?? localRef.current;
    target?.focus();
  };

  return (
    <div className="relative flex items-center">
      <input
        ref={assignRef}
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        maxLength={120}
        className="w-full rounded-xl border border-white/20 bg-white/95 py-2.5 pl-4 pr-24 text-sm text-azul-forte placeholder:text-azul-forte/60 focus:border-white focus:outline-none focus:ring-2 focus:ring-amarelo/70"
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-12 flex h-7 w-7 items-center justify-center rounded-full bg-azul-forte/5 text-azul-forte/60 transition hover:bg-azul-forte/10 hover:text-azul-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/70"
        >
          <span className="sr-only">Limpar busca</span>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-3.5 w-3.5"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onSubmit}
        className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full bg-amarelo text-azul-forte transition hover:bg-amarelo/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/70 disabled:cursor-not-allowed disabled:opacity-70"
        aria-label={ariaLabel}
        disabled={isLoading}
      >
        {isLoading ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-azul-forte/40 border-t-azul-forte"
            aria-hidden="true"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-5 w-5"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
