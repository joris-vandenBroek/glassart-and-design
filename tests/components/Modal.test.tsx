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
      <Modal isOpen={false} onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders its children when isOpen is true', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p data-testid="modal-content">Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toHaveTextContent('Inhoud');
  });

  it('renders the given title in the header', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Testmodal');
  });

  it('renders the subtitle in the header when provided', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal" subtitle="Extra context">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Extra context');
  });

  it('renders a non-text subtitle (e.g. a flex row with a badge) without nesting block content in a <p>', () => {
    renderWithIntl(
      <Modal
        isOpen
        onClose={vi.fn()}
        closeLabel="Sluiten"
        title="Testmodal"
        subtitle={
          <div data-testid="rich-subtitle" className="flex items-center gap-2">
            <span>Extra context</span>
            <span data-testid="badge">Badge</span>
          </div>
        }
      >
        <p>Inhoud</p>
      </Modal>
    );
    const subtitleEl = screen.getByTestId('rich-subtitle');
    expect(subtitleEl.tagName).toBe('DIV');
    expect(subtitleEl.closest('p')).toBeNull();
    expect(screen.getByTestId('badge')).toHaveTextContent('Badge');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it("uses closeLabel as the close button's aria-label", () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });

  it("uses closeButtonAriaLabel instead of closeLabel for the close button's aria-label when provided", () => {
    renderWithIntl(
      <Modal
        isOpen
        onClose={vi.fn()}
        closeLabel="Toon 3 resultaten"
        closeButtonAriaLabel="Paneel sluiten"
        title="Testmodal"
      >
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Paneel sluiten');
    expect(screen.getByTestId('modal-footer-close')).toHaveTextContent('Toon 3 resultaten');
  });

  it('calls onClose when the footer close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the close tooltip on the footer close button', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
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
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal" wide>
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-\[1400px\]/);
  });

  it('uses the default (narrower) max width when wide is not set', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-lg/);
  });

  it('keeps the header outside the scrollable body', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-header').className).not.toMatch(/overflow-y-auto/);
    expect(screen.getByTestId('modal-body').className).toMatch(/overflow-y-auto/);
  });

  it('keeps the footer outside the scrollable body', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-footer')).toBeInTheDocument();
    expect(screen.getByTestId('modal-footer').className).not.toMatch(/overflow-y-auto/);
  });

  it('places the header before the body and the footer after it in the DOM', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    const header = screen.getByTestId('modal-header');
    const body = screen.getByTestId('modal-body');
    const footer = screen.getByTestId('modal-footer');
    expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
