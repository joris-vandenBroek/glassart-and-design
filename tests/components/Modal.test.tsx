import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Modal } from '@/components/Modal';
import messages from '../../messages/nl.json';

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    renderWithIntl(
      <Modal isOpen={false} onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders its children when isOpen is true', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p data-testid="modal-content">Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toHaveTextContent('Inhoud');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('uses closeLabel as the close button\'s aria-label', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });

  it('calls onClose when the footer close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the close tooltip on the footer close button', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-footer-close')).toHaveAttribute(
      'title',
      'Sluit dit scherm, eventuele wijzigingen worden niet opgeslagen!'
    );
  });

  it('uses a wider max width when wide is set', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" wide>
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-\[1400px\]/);
  });

  it('uses the default (narrower) max width when wide is not set', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-lg/);
  });
});
