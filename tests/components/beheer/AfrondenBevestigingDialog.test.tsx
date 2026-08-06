import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AfrondenBevestigingDialog } from '@/components/beheer/AfrondenBevestigingDialog';
import type { ZendingGenoten } from '@/lib/zendingGenoten';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import messages from '../../../messages/nl.json';

function bestelling(id: string, bestelnr: string): Bestelling {
  return {
    id,
    klantId: `klant-${id}`,
    companyName: `Bedrijf ${id}`,
    bestelnr,
    besteldatum: '1-8-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
}

const GENOTEN: ZendingGenoten[] = [
  {
    zending: {
      id: 'z1',
      drukkerId: 'drukker-1',
      drukkerNaam: 'Drukkerij Janssen',
      verzondenOp: new Date('2026-08-03T10:00:00Z'),
      bestellingIds: ['header-1', 'header-2'],
    },
    bestellingen: [bestelling('header-2', 'GD-00302')],
  },
];

function renderDialog(overrides: Partial<React.ComponentProps<typeof AfrondenBevestigingDialog>> = {}) {
  const onAlleenDeze = vi.fn();
  const onOokDeze = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AfrondenBevestigingDialog
        isOpen
        genoten={GENOTEN}
        onAlleenDeze={onAlleenDeze}
        onOokDeze={onOokDeze}
        onClose={onClose}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAlleenDeze, onOokDeze, onClose };
}

describe('AfrondenBevestigingDialog', () => {
  it('renders nothing when it is closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
  });

  it('names the drukker and lists the open bestelnummers', () => {
    renderDialog();
    const dialog = screen.getByTestId('afronden-bevestiging');
    expect(dialog).toHaveTextContent('Drukkerij Janssen');
    expect(dialog).toHaveTextContent('GD-00302');
  });

  it('falls back to a readable line when the verzenddatum is unknown', () => {
    renderDialog({
      genoten: [{ ...GENOTEN[0], zending: { ...GENOTEN[0].zending, verzondenOp: null } }],
    });
    expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('verzenddatum onbekend');
  });

  it('calls onAlleenDeze when only the original selection should be afgerond', () => {
    const { onAlleenDeze, onOokDeze } = renderDialog();
    fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));
    expect(onAlleenDeze).toHaveBeenCalledTimes(1);
    expect(onOokDeze).not.toHaveBeenCalled();
  });

  it('calls onOokDeze when the genoten should be afgerond too', () => {
    const { onAlleenDeze, onOokDeze } = renderDialog();
    fireEvent.click(screen.getByTestId('afronden-bevestiging-ook-deze'));
    expect(onOokDeze).toHaveBeenCalledTimes(1);
    expect(onAlleenDeze).not.toHaveBeenCalled();
  });

  it('closes without afronden when cancelled', () => {
    const { onClose, onAlleenDeze, onOokDeze } = renderDialog();
    fireEvent.click(screen.getByTestId('afronden-bevestiging-annuleren'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAlleenDeze).not.toHaveBeenCalled();
    expect(onOokDeze).not.toHaveBeenCalled();
  });
});
