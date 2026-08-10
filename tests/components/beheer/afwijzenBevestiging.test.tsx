import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  useAfwijzenBevestiging,
  AfwijzenBevestigingTekst,
  AfwijzenBevestigingActies,
} from '@/components/beheer/afwijzenBevestiging';
import messages from '../../../messages/nl.json';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('useAfwijzenBevestiging', () => {
  it('starts closed with an empty reden', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    expect(result.current.open).toBe(false);
    expect(result.current.reden).toBe('');
  });

  it('vraag() opens the confirmation with an empty reden', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    expect(result.current.open).toBe(true);
    expect(result.current.reden).toBe('');
  });

  it('wijzigReden() updates the reden while open', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    act(() => result.current.wijzigReden('Te laat besteld'));
    expect(result.current.reden).toBe('Te laat besteld');
  });

  it('annuleer() closes the confirmation and clears the reden', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    act(() => result.current.wijzigReden('Te laat besteld'));
    act(() => result.current.annuleer());
    expect(result.current.open).toBe(false);
    expect(result.current.reden).toBe('');
  });

  it('vraag() after a previous annuleer() opens with an empty reden again, not the old one', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    act(() => result.current.wijzigReden('Eerste reden'));
    act(() => result.current.annuleer());
    act(() => result.current.vraag());
    expect(result.current.reden).toBe('');
  });

  it('returns referentially stable vraag/wijzigReden/annuleer across re-renders', () => {
    const { result, rerender } = renderHook(() => useAfwijzenBevestiging());
    const eerste = { vraag: result.current.vraag, wijzigReden: result.current.wijzigReden, annuleer: result.current.annuleer };
    rerender();
    expect(result.current.vraag).toBe(eerste.vraag);
    expect(result.current.wijzigReden).toBe(eerste.wijzigReden);
    expect(result.current.annuleer).toBe(eerste.annuleer);
  });
});

describe('AfwijzenBevestigingTekst', () => {
  it('shows the question with the item name and calls onWijzigReden while typing', () => {
    const onWijzigReden = vi.fn();
    render(
      <AfwijzenBevestigingTekst
        item="Testbedrijf BV"
        reden=""
        onWijzigReden={onWijzigReden}
        testId="klant-modal-afwijzen-bevestiging"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestiging')).toHaveTextContent('Testbedrijf BV');
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    expect(onWijzigReden).toHaveBeenCalledWith('Onvolledige aanvraag');
  });
});

describe('AfwijzenBevestigingActies', () => {
  it('disables the confirm button while the reden is empty or only whitespace', () => {
    const { rerender } = render(
      <AfwijzenBevestigingActies reden="" onBevestig={vi.fn()} onAnnuleer={vi.fn()} testIdPrefix="klant" />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();

    rerender(
      <Wrapper>
        <AfwijzenBevestigingActies reden="   " onBevestig={vi.fn()} onAnnuleer={vi.fn()} testIdPrefix="klant" />
      </Wrapper>
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();
  });

  it('enables the confirm button once a non-empty reden is given, and calls onBevestig/onAnnuleer', () => {
    const onBevestig = vi.fn();
    const onAnnuleer = vi.fn();
    render(
      <AfwijzenBevestigingActies
        reden="Een geldige reden"
        onBevestig={onBevestig}
        onAnnuleer={onAnnuleer}
        testIdPrefix="klant"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));
    expect(onBevestig).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-annuleren'));
    expect(onAnnuleer).toHaveBeenCalled();
  });

  it('disables both buttons while isBezig is true', () => {
    render(
      <AfwijzenBevestigingActies reden="Reden" onBevestig={vi.fn()} onAnnuleer={vi.fn()} testIdPrefix="klant" isBezig />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();
    expect(screen.getByTestId('klant-modal-afwijzen-annuleren')).toBeDisabled();
  });
});
