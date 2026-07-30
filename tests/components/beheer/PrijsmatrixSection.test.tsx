// tests/components/beheer/PrijsmatrixSection.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PrijsmatrixSection } from '@/components/beheer/PrijsmatrixSection';
import { AdminAuthProvider } from '@/lib/useAdminAuth';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const MATEN = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN = [{ id: 'soort-1', omschrijving: 'Acryl' }];
const MATERIALEN = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'Acryl 3mm' }];
const PRIJSMATRIX = [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: null }];

function renderSection(overrides = {}) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminAuthProvider>
        <PrijsmatrixSection
          prijsmatrix={PRIJSMATRIX}
          maten={MATEN}
          materialen={MATERIALEN}
          materiaalsoorten={MATERIAALSOORTEN}
          loadError={null}
          onRegelUpdated={vi.fn()}
          {...overrides}
        />
      </AdminAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe('PrijsmatrixSection', () => {
  it('shows the load error instead of the grid when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.', prijsmatrix: null });
    expect(screen.getByTestId('prijsmatrix-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders one row per maat and one column per materiaal', () => {
    renderSection();
    expect(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1')).toBeInTheDocument();
  });

  it('shows an existing prijs pre-filled in its cell', () => {
    renderSection({ prijsmatrix: [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150 }] });
    expect(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1')).toHaveValue(150);
  });

  it('saves a prijs on blur and calls onRegelUpdated', async () => {
    const onRegelUpdated = vi.fn();
    renderSection({ onRegelUpdated });
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    fireEvent.blur(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/prijsmatrix', expect.objectContaining({ method: 'PUT' })));
    expect(onRegelUpdated).toHaveBeenCalledWith('maat-1', 'mat-1', 175);
  });

  it('renders maten rows sorted by breedte then hoogte ascending', () => {
    const unsortedMaten = [
      { id: 'maat-large', breedte: 100, hoogte: 100 },
      { id: 'maat-small', breedte: 40, hoogte: 60 },
      { id: 'maat-medium', breedte: 60, hoogte: 60 },
    ];
    const prijsmatrix = unsortedMaten.map((maat) => ({
      maatId: maat.id,
      materiaalId: 'mat-1',
      prijs: null,
    }));
    renderSection({ maten: unsortedMaten, prijsmatrix });

    // Get all row label cells (skipping the header row)
    const rows = screen.getAllByRole('row');
    const rowLabels = rows.slice(1).map((row) => row.querySelector('td')?.textContent);

    expect(rowLabels).toEqual(['40×60', '60×60', '100×100']);
  });

  it('renders materialen columns grouped by materiaalsoort then sorted by dikte ascending', () => {
    const materiaalsoorten = [
      { id: 'soort-A', omschrijving: 'Acryl' },
      { id: 'soort-B', omschrijving: 'Glas' },
    ];
    const unsortedMaterialen = [
      { id: 'mat-glas-5', materiaalsoortId: 'soort-B', materiaaldikte: 5, omschrijving: 'Glas 5mm' },
      { id: 'mat-acryl-3', materiaalsoortId: 'soort-A', materiaaldikte: 3, omschrijving: 'Acryl 3mm' },
      { id: 'mat-glas-3', materiaalsoortId: 'soort-B', materiaaldikte: 3, omschrijving: 'Glas 3mm' },
      { id: 'mat-acryl-5', materiaalsoortId: 'soort-A', materiaaldikte: 5, omschrijving: 'Acryl 5mm' },
    ];
    const prijsmatrix = unsortedMaterialen.map((mat) => ({
      maatId: 'maat-1',
      materiaalId: mat.id,
      prijs: null,
    }));

    renderSection({
      maten: [{ id: 'maat-1', breedte: 40, hoogte: 60 }],
      materiaalsoorten,
      materialen: unsortedMaterialen,
      prijsmatrix,
    });

    // Get the header row's column headers (skipping the first empty cell)
    const headerRow = screen.getAllByRole('row')[0];
    const headers = Array.from(headerRow.querySelectorAll('th')).slice(1);
    const headerTexts = headers.map((h) => h.textContent);

    // Acryl should come before Glas (alphabetically), and within each soort, dikte should be ascending
    expect(headerTexts).toEqual(['3mm Acryl', '5mm Acryl', '3mm Glas', '5mm Glas']);
  });
});
