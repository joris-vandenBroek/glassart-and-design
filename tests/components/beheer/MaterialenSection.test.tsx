import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MaterialenSection } from '@/components/beheer/MaterialenSection';
import type { Materiaal, Materiaalsoort, Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),}));

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    code: 'Hotel paneel',
    kunstenaarnr: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'soort-2', omschrijvingNl: 'Acryl', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];

// Basisfixture voor de actief-tests: elke test overschrijft alleen wat hij nodig heeft.
const MATERIAAL: Materiaal = {
  id: 'mat-basis',
  materiaalsoortId: 'soort-1',
  materiaaldikte: 4,
  prijsPerM2: 65,
  omschrijvingNl: 'Basis',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  actief: true,
};

const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    prijsPerM2: 65,
    omschrijvingNl: 'Kristalhelder',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'mat-2',
    materiaalsoortId: 'soort-2',
    materiaaldikte: 3,
    prijsPerM2: 40,
    omschrijvingNl: 'Licht en helder',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

type SectionProps = React.ComponentProps<typeof MaterialenSection>;

function sectionTree(overrides: Partial<SectionProps>) {
  return (
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MaterialenSection
        materialen={MATERIALEN}
        materiaalsoorten={SOORTEN}
        kunstwerken={KUNSTWERKEN}
        loadError={null}
        actionErrorCode={null}
        onAdd={vi.fn().mockResolvedValue(true)}
        onUpdate={vi.fn().mockResolvedValue(true)}
        onRemove={vi.fn().mockResolvedValue(true)}
        onKunstwerkenChanged={() => {}}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

function renderSection(overrides: Partial<SectionProps> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const { rerender } = render(sectionTree({ ...overrides, onAdd, onUpdate, onRemove }));
  return { onAdd, onUpdate, onRemove, rerender };
}

// Rendert dezelfde providerboom opnieuw met nieuwe props; nodig om de verversing van de
// materialenlijst na te bootsen die useApiCollection in het echt doet.
function rerenderSection(
  rerender: ReturnType<typeof render>['rerender'],
  overrides: Partial<SectionProps> = {}
) {
  rerender(sectionTree(overrides));
}

describe('MaterialenSection', () => {
  beforeEach(() => {
    logActiviteitMock.mockReset();
  });

  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('materialen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while materialen is null and there is no error', () => {
    renderSection({ materialen: null });
    expect(screen.queryByTestId('materialen-section')).not.toBeInTheDocument();
  });

  it('shows the materiaalsoort name (not the raw id) in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('Veiligheidsglas');
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('4');
    expect(screen.getByTestId('data-table-row-mat-2')).toHaveTextContent('Acryl');
  });

  it('filters by materiaalsoort name via the global search', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'Acryl' } });
    expect(screen.queryByTestId('data-table-row-mat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-mat-2')).toBeInTheDocument();
  });

  it('adds a new materiaal with the selected materiaalsoort, dikte, prijs per m2 and omschrijving', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-materiaalsoort'), { target: { value: 'soort-2' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '80' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), {
      target: { value: 'Extra diepte' },
    });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        materiaalsoortId: 'soort-2',
        materiaaldikte: 5,
        prijsPerM2: 80,
        omschrijvingNl: 'Extra diepte',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        actief: true,
      })
    );
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    expect(screen.getByTestId('materiaal-modal-materiaalsoort')).toHaveValue('soort-1');
    expect(screen.getByTestId('materiaal-modal-dikte')).toHaveValue(4);
    expect(screen.getByTestId('materiaal-modal-prijs-per-m2')).toHaveValue(65);
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('mat-1', {
        materiaalsoortId: 'soort-1',
        materiaaldikte: 6,
        prijsPerM2: 70,
        omschrijvingNl: 'Kristalhelder',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        actief: true,
      })
    );
  });

  it('accepts 0 as a valid dikte', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
    expect(screen.getByTestId('materiaal-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ materiaaldikte: 0 })));
  });

  it('disables opslaan while prijs per m2 is empty', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
    expect(screen.getByTestId('materiaal-modal-opslaan')).toBeDisabled();
  });

  it('disables opslaan when prijs per m2 is 0 or negative', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '0' } });
    expect(screen.getByTestId('materiaal-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '-5' } });
    expect(screen.getByTestId('materiaal-modal-opslaan')).toBeDisabled();
  });

  it('deletes a materiaal', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('mat-2'));
  });

  it('shows an action error and keeps the modal open when deleting fails', async () => {
    const onRemove = vi.fn().mockResolvedValue(false);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    expect(await screen.findByTestId('materiaal-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('materiaal-modal')).toBeInTheDocument();
  });

  it('blocks deleting a materiaal that is still referenced by a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    expect(await screen.findByTestId('materiaal-modal-error')).toHaveTextContent(
      'Dit materiaal is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a materiaal with no linked kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('mat-2'));
  });

  it('logs materiaal_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Nieuw' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_toegevoegd',
        'Nieuw'
      )
    );
  });

  it('logs materiaal_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Bijgewerkt' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_gewijzigd',
        'Bijgewerkt'
      )
    );
  });

  it('logs materiaal_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_verwijderd',
        'Licht en helder'
      )
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await screen.findByTestId('materiaal-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the same "Materiaalgegevens" title when adding and when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaalgegevens');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaalgegevens');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    expect(screen.getByTestId('materiaal-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  it('toont de actief-kolom', () => {
    renderSection({
      materialen: [
        { ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: true },
        { ...MATERIAAL, id: 'mat-b', omschrijvingNl: 'Acryl', actief: false },
      ],
    });
    expect(screen.getByText('Glas').closest('tr')).toHaveTextContent('Ja');
    expect(screen.getByText('Acryl').closest('tr')).toHaveTextContent('Nee');
  });

  it('toont de blokkademelding bij foutcode in-use-open-bestelling', async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: true }],
      onUpdate,
      actionErrorCode: 'in-use-open-bestelling',
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    expect(
      await screen.findByText(
        'Dit materiaal kan niet op inactief gezet worden zolang er openstaande bestellingen met dit materiaal zijn.'
      )
    ).toBeInTheDocument();
  });

  it('vraagt bij activeren of alle kunstwerken gekoppeld moeten worden', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ gekoppeld: 3 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: false }],
      onUpdate,
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));

    expect(await screen.findByTestId('materialen-activeren-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('materialen-activeren-alle'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/materialen/mat-a/koppel-kunstwerken', { method: 'POST' })
    );
    vi.unstubAllGlobals();
  });

  it('koppelt niets als de beheerder "alleen activeren" kiest', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: false }],
      onUpdate,
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));

    fireEvent.click(await screen.findByTestId('materialen-activeren-alleen'));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('vraagt de koppeling ook bij een nieuw actief materiaal', async () => {
    // onAdd geeft geen id terug; de dialoog verschijnt pas als het materiaal in de
    // ververste lijst opduikt. Die verversing bootsen we na met een rerender.
    const onAdd = vi.fn().mockResolvedValue(true);
    const { rerender } = renderSection({ materialen: [], onAdd });
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Nieuw glas' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());

    rerenderSection(rerender, {
      materialen: [{ ...MATERIAAL, id: 'mat-nieuw', omschrijvingNl: 'Nieuw glas', materiaaldikte: 6, actief: true }],
      onAdd,
    });
    expect(await screen.findByTestId('materialen-activeren-dialog')).toBeInTheDocument();
  });

  it('vraagt niets bij het deactiveren van een materiaal', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: true }],
      onUpdate,
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(screen.queryByTestId('materialen-activeren-dialog')).not.toBeInTheDocument();
  });
});
