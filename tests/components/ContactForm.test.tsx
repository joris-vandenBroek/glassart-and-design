import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ContactForm } from '@/components/ContactForm';
import messages from '../../messages/nl.json';

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ContactForm />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ContactForm', () => {
  it('marks name, email, subject, and message as required; company and phone as optional', () => {
    renderForm();
    expect(screen.getByTestId('contact-form-name')).toBeRequired();
    expect(screen.getByTestId('contact-form-company')).not.toBeRequired();
    expect(screen.getByTestId('contact-form-email')).toBeRequired();
    expect(screen.getByTestId('contact-form-phone')).not.toBeRequired();
    expect(screen.getByTestId('contact-form-subject')).toBeRequired();
    expect(screen.getByTestId('contact-form-message')).toBeRequired();
  });

  it('offers exactly the 3 subject options', () => {
    renderForm();
    const select = screen.getByTestId('contact-form-subject') as HTMLSelectElement;
    const optionTexts = Array.from(select.options)
      .map((option) => option.text)
      .filter((text) => text !== 'Onderwerp');
    expect(optionTexts).toEqual(['Algemene vraag', 'Offerte aanvragen', 'Overig']);
  });

  it('shows "Verzonden!" and disables the button on submit, then resets after the delay', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('contact-form-name'), {
      target: { value: 'Jan Jansen' },
    });
    fireEvent.change(screen.getByTestId('contact-form-email'), {
      target: { value: 'jan@example.com' },
    });
    fireEvent.change(screen.getByTestId('contact-form-subject'), {
      target: { value: 'general' },
    });
    fireEvent.change(screen.getByTestId('contact-form-message'), {
      target: { value: 'Hallo, ik heb een vraag.' },
    });

    fireEvent.submit(screen.getByTestId('contact-form-submit').closest('form')!);

    expect(screen.getByTestId('contact-form-submit')).toHaveTextContent('Verzonden!');
    expect(screen.getByTestId('contact-form-submit')).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByTestId('contact-form-submit')).toHaveTextContent('Versturen');
    expect(screen.getByTestId('contact-form-submit')).not.toBeDisabled();
    expect(screen.getByTestId('contact-form-name')).toHaveValue('');
  });

  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('contact-form-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
