import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentenSection } from '@/components/beheer/SegmentenSection';
import type { Segment } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof SegmentenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <SegmentenSection
        segmenten={SEGMENTEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('SegmentenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('segmenten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while segmenten is null and there is no error', () => {
    renderSection({ segmenten: null });
    expect(screen.queryByTestId('segmenten-section')).not.toBeInTheDocument();
  });

  it('lists the segmenten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-seg-1')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('data-table-row-seg-2')).toHaveTextContent('Restaurant');
  });

  it('adds a new segment and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Wellness' }));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('segment-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('segment-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    expect(screen.getByTestId('segment-modal-omschrijving')).toHaveValue('Restaurant');
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Restaurants' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('seg-2', { omschrijving: 'Restaurants' }));
  });

  it('deletes a segment', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-1'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('seg-1'));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    expect(await screen.findByTestId('segment-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('segment-modal')).toBeInTheDocument();
  });

  it('logs segment_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'segment_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Wellness'
      )
    );
  });

  it('logs segment_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Restaurants' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'segment_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Restaurants'
      )
    );
  });

  it('logs segment_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-1'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'segment_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Hotel'
      )
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await screen.findByTestId('segment-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Segment toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Segment bewerken');
  });
});
