import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { FeaturedWorks } from '@/components/FeaturedWorks';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeKunstwerk(id: string) {
  return {
    id,
    foto: `https://example.com/${id}.jpg`,
    segmentIds: ['seg-1'],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: `Kunstwerk ${id}`,
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('FeaturedWorks', () => {
  it('renders the section label and exactly 3 featured works when 5 kunstwerken exist', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ['a', 'b', 'c', 'd', 'e'].map(makeKunstwerk) });
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    expect(await screen.findByText('Uitgelichte werken')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('featured-work')).toHaveLength(3));
  });

  it('shows all kunstwerken (not padded) when fewer than 3 exist', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ['a', 'b'].map(makeKunstwerk) });
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    await waitFor(() => expect(screen.getAllByTestId('featured-work')).toHaveLength(2));
  });

  it('shows a photo for each featured work', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ['a', 'b', 'c'].map(makeKunstwerk) });
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    await waitFor(() => expect(screen.getAllByTestId('product-image')).toHaveLength(3));
  });
});
