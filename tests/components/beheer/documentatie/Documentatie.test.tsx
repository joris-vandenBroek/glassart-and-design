import { describe, expect, it, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Documentatie } from '@/components/beheer/documentatie/Documentatie';
import messages from '../../../../messages/nl.json';

function renderDocumentatie() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <Documentatie />
    </NextIntlClientProvider>
  );
}

describe('Documentatie', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('scrolls to the chapter matching the URL hash once its content has mounted', () => {
    window.location.hash = '#drukkers-standaard';
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    renderDocumentatie();

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no hash in the URL', () => {
    window.location.hash = '';
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    renderDocumentatie();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
