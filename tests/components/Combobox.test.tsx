import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Combobox } from '@/components/Combobox';

const OPTIONS = [
  { value: 'a', label: 'Anna' },
  { value: 'b', label: 'Bram' },
];

describe('Combobox', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(
      <Combobox options={OPTIONS} value={null} onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    expect(screen.getByTestId('combo')).toHaveAttribute('placeholder', 'Zoek…');
    expect(screen.getByTestId('combo')).toHaveValue('');
  });

  it('shows the selected option label when a value is set', () => {
    render(
      <Combobox options={OPTIONS} value="b" onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    expect(screen.getByTestId('combo')).toHaveValue('Bram');
  });

  it('filters options as the user types and selects one on click', () => {
    const onChange = vi.fn();
    render(
      <Combobox options={OPTIONS} value={null} onChange={onChange} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    fireEvent.change(screen.getByTestId('combo'), { target: { value: 'an' } });
    expect(screen.getByTestId('combo-option-a')).toBeInTheDocument();
    expect(screen.queryByTestId('combo-option-b')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('combo-option-a'));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('shows noResultsLabel when nothing matches', () => {
    render(
      <Combobox options={OPTIONS} value={null} onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    fireEvent.change(screen.getByTestId('combo'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('combo-empty')).toHaveTextContent('Niets gevonden');
  });

  it('calls onChange(null) when the clear option is clicked', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value="a"
        onChange={onChange}
        placeholder="Zoek…"
        noResultsLabel="Niets gevonden"
        clearLabel="Geen koppeling"
        testId="combo"
      />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    expect(screen.getByTestId('combo-option-clear')).toHaveTextContent('Geen koppeling');
    fireEvent.click(screen.getByTestId('combo-option-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not render a clear option when clearLabel is omitted', () => {
    render(
      <Combobox options={OPTIONS} value="a" onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    expect(screen.queryByTestId('combo-option-clear')).not.toBeInTheDocument();
  });

  it('keeps the dropdown open if the input is refocused before the blur-close timer fires', () => {
    vi.useFakeTimers();
    try {
      render(
        <Combobox options={OPTIONS} value={null} onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
      );
      fireEvent.focus(screen.getByTestId('combo'));
      expect(screen.getByTestId('combo-option-a')).toBeInTheDocument();
      fireEvent.blur(screen.getByTestId('combo'));
      vi.advanceTimersByTime(100);
      fireEvent.focus(screen.getByTestId('combo'));
      vi.advanceTimersByTime(100);
      expect(screen.getByTestId('combo-option-a')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
