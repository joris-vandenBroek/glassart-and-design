'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  noResultsLabel: string;
  clearLabel?: string;
  testId: string;
}

export function Combobox({ options, value, onChange, placeholder, noResultsLabel, clearLabel, testId }: ComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function handleSelect(nextValue: string | null) {
    onChange(nextValue);
    setQuery('');
    setIsOpen(false);
  }

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={isOpen ? query : selectedLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (blurTimeoutRef.current !== null) {
            window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
          }
          setQuery('');
          setIsOpen(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsOpen(false);
            blurTimeoutRef.current = null;
          }, 150);
        }}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full rounded-sm bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      {isOpen && (
        <ul
          data-testid={`${testId}-list`}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border border-white/10 bg-charcoal shadow-lg"
        >
          {clearLabel && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(null)}
                data-testid={`${testId}-option-clear`}
                className="block w-full px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10"
              >
                {clearLabel}
              </button>
            </li>
          )}
          {filteredOptions.length === 0 ? (
            <li data-testid={`${testId}-empty`} className="px-3 py-2 text-xs text-white/40">
              {noResultsLabel}
            </li>
          ) : (
            filteredOptions.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(option.value)}
                  data-testid={`${testId}-option-${option.value}`}
                  className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
