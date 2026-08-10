import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantWachtwoordSectie } from '@/components/beheer/KlantWachtwoordSectie';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function renderSectie() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantWachtwoordSectie klantId="uid-1" />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('KlantWachtwoordSectie', () => {
  // De actie is onomkeerbaar en sluit de klant buiten, dus hij mag nooit op één
  // klik gebeuren.
  it('vraagt eerst om bevestiging en stuurt nog niets', () => {
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));

    expect(screen.getByTestId('klant-wachtwoord-waarschuwing')).toHaveTextContent(
      'Het huidige wachtwoord van deze klant vervalt en hij wordt overal uitgelogd.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('annuleren sluit de bevestiging zonder iets te versturen', () => {
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-annuleren'));

    expect(screen.queryByTestId('klant-wachtwoord-waarschuwing')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('toont het wachtwoord na bevestiging', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ wachtwoord: 'k7fp-r2mq-x4tz' }) });
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    expect(await screen.findByTestId('klant-wachtwoord-waarde')).toHaveTextContent('k7fp-r2mq-x4tz');
    expect(fetchMock).toHaveBeenCalledWith('/api/klanten/uid-1/wachtwoord', { method: 'POST' });
  });

  it('meldt een mislukte poging en toont geen wachtwoord', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    expect(await screen.findByTestId('klant-wachtwoord-fout')).toHaveTextContent(
      'Het uitgeven van een nieuw wachtwoord is mislukt.'
    );
    expect(screen.queryByTestId('klant-wachtwoord-waarde')).toBeNull();
  });

  // De endpoint is niet idempotent (nieuw wachtwoord, oude sessies vervallen), dus een
  // tweede klik terwijl het eerste verzoek nog loopt mag nooit een tweede POST sturen.
  it('stuurt bij dubbel klikken op bevestigen maar één verzoek', async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    const fetchPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValueOnce(fetchPromise);

    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    await waitFor(() => expect(screen.getByTestId('klant-wachtwoord-bevestigen')).toBeDisabled());

    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ wachtwoord: 'k7fp-r2mq-x4tz' }) });

    expect(await screen.findByTestId('klant-wachtwoord-waarde')).toHaveTextContent('k7fp-r2mq-x4tz');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Na een mislukte poging mag de foutmelding niet blijven hangen zodra de operator
  // opnieuw naar het bevestigingsscherm gaat.
  it('toont geen oude foutmelding meer na opnieuw bevestigen aanvragen', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    await screen.findByTestId('klant-wachtwoord-fout');

    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));

    expect(screen.queryByTestId('klant-wachtwoord-fout')).toBeNull();
  });

  // Sluiten van de modal unmount deze component; daarna mag er niets bewaard zijn.
  it('toont het wachtwoord niet meer na opnieuw monteren', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ wachtwoord: 'k7fp-r2mq-x4tz' }) });
    const { unmount } = renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));
    await screen.findByTestId('klant-wachtwoord-waarde');

    unmount();
    renderSectie();

    await waitFor(() => expect(screen.queryByTestId('klant-wachtwoord-waarde')).toBeNull());
    expect(screen.getByTestId('klant-wachtwoord-uitgeven')).toBeInTheDocument();
  });
});
