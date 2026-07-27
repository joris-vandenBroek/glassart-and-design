import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders its children when isOpen is true', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p data-testid="modal-content">Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toHaveTextContent('Inhoud');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('uses closeLabel as the close button\'s aria-label', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });

  it('uses a wider max width when wide is set', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" wide>
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-\[1400px\]/);
  });

  it('uses the default (narrower) max width when wide is not set', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-lg/);
  });
});
