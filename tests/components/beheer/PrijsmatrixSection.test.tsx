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
});
