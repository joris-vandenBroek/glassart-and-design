// tests/components/beheer/PrijsmatrixSection.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PrijsmatrixSection } from '@/components/beheer/PrijsmatrixSection';
import { AdminAuthProvider } from '@/lib/useAdminAuth';
import messages from '../../../messages/nl.json';

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { email: 'test@example.com' } }),
  AdminAuthProvider: ({ children }: any) => children,
}));

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

  it('marks a cell as gewijzigd when edited, without saving yet', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    expect(screen.getByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unmarks a cell as gewijzigd when its value is edited back to the saved prijs', () => {
    renderSection({ prijsmatrix: [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150 }] });
    const input = screen.getByTestId('prijsmatrix-cel-maat-1-mat-1');
    fireEvent.change(input, { target: { value: '175' } });
    expect(screen.getByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '150' } });
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).not.toBeInTheDocument();
  });

  it('disables the Opslaan button until a cell is edited', () => {
    renderSection();
    expect(screen.getByTestId('prijsmatrix-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    expect(screen.getByTestId('prijsmatrix-opslaan')).toBeEnabled();
  });

  it('saves all gewijzigde cellen in one bulk PUT call when Opslaan is clicked', async () => {
    const onRegelUpdated = vi.fn();
    const materialen = [
      { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'Acryl 3mm' },
      { id: 'mat-2', materiaalsoortId: 'soort-1', materiaaldikte: 5, omschrijving: 'Acryl 5mm' },
    ];
    const prijsmatrix = [
      { maatId: 'maat-1', materiaalId: 'mat-1', prijs: null },
      { maatId: 'maat-1', materiaalId: 'mat-2', prijs: null },
    ];
    renderSection({ onRegelUpdated, materialen, prijsmatrix });

    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-2'), { target: { value: '225' } });
    fireEvent.click(screen.getByTestId('prijsmatrix-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prijsmatrix',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            regels: [
              { maatId: 'maat-1', materiaalId: 'mat-1', prijs: 175 },
              { maatId: 'maat-1', materiaalId: 'mat-2', prijs: 225 },
            ],
          }),
        })
      )
    );
    await waitFor(() => expect(screen.getByTestId('prijsmatrix-saved-maat-1-mat-1')).toBeInTheDocument());
    expect(screen.getByTestId('prijsmatrix-saved-maat-1-mat-2')).toBeInTheDocument();
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-2')).not.toBeInTheDocument();
    expect(onRegelUpdated).toHaveBeenCalledWith('maat-1', 'mat-1', 175);
    expect(onRegelUpdated).toHaveBeenCalledWith('maat-1', 'mat-2', 225);
  });

  it('keeps cells marked as gewijzigd and shows an error when the bulk save fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderSection();
    const input = screen.getByTestId('prijsmatrix-cel-maat-1-mat-1');
    fireEvent.change(input, { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('prijsmatrix-opslaan'));

    await waitFor(() => expect(screen.getByTestId('prijsmatrix-action-error')).toBeInTheDocument());
    expect(screen.getByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).toBeInTheDocument();
    expect(screen.queryByTestId('prijsmatrix-saved-maat-1-mat-1')).not.toBeInTheDocument();
  });

  it('disables inputs during an in-flight save so a mid-save edit cannot be discarded', async () => {
    const materialen = [
      { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'Acryl 3mm' },
      { id: 'mat-2', materiaalsoortId: 'soort-1', materiaaldikte: 5, omschrijving: 'Acryl 5mm' },
    ];
    const prijsmatrix = [
      { maatId: 'maat-1', materiaalId: 'mat-1', prijs: null },
      { maatId: 'maat-1', materiaalId: 'mat-2', prijs: null },
    ];

    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    const deferred = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValue(deferred);

    renderSection({ materialen, prijsmatrix });

    const cellA = screen.getByTestId('prijsmatrix-cel-maat-1-mat-1');
    const cellB = screen.getByTestId('prijsmatrix-cel-maat-1-mat-2');

    fireEvent.change(cellA, { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('prijsmatrix-opslaan'));

    // Save is in flight now: inputs must be disabled so a mid-save edit is impossible.
    await waitFor(() => expect(cellA).toBeDisabled());
    expect(cellB).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ ok: true }) });

    await waitFor(() => expect(screen.getByTestId('prijsmatrix-saved-maat-1-mat-1')).toBeInTheDocument());
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).not.toBeInTheDocument();
    expect(cellA).toBeEnabled();
    expect(cellB).toBeEnabled();
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-2')).not.toBeInTheDocument();
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

    const headerRow = screen.getAllByRole('row')[0];
    const headers = Array.from(headerRow.querySelectorAll('th')).slice(1);
    const headerTexts = headers.map((h) => h.textContent);

    expect(headerTexts).toEqual(['3mm Acryl', '5mm Acryl', '3mm Glas', '5mm Glas']);
  });
});
