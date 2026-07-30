import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalTabs } from '@/components/ModalTabs';

const TABS = [
  { id: 'algemeen', label: 'Algemeen' },
  { id: 'omschrijvingen', label: 'Omschrijvingen', hasError: true },
];

describe('ModalTabs', () => {
  it('renders a tab button for each tab with its label', () => {
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={vi.fn()} testIdPrefix="test" />);
    expect(screen.getByTestId('test-tab-algemeen')).toHaveTextContent('Algemeen');
    expect(screen.getByTestId('test-tab-omschrijvingen')).toHaveTextContent('Omschrijvingen');
  });

  it('marks the active tab with aria-selected=true and others false', () => {
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={vi.fn()} testIdPrefix="test" />);
    expect(screen.getByTestId('test-tab-algemeen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('test-tab-omschrijvingen')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={onTabChange} testIdPrefix="test" />);
    fireEvent.click(screen.getByTestId('test-tab-omschrijvingen'));
    expect(onTabChange).toHaveBeenCalledWith('omschrijvingen');
  });

  it('shows an error dot only for tabs with hasError set', () => {
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={vi.fn()} testIdPrefix="test" />);
    expect(screen.queryByTestId('test-tab-algemeen-error-dot')).not.toBeInTheDocument();
    expect(screen.getByTestId('test-tab-omschrijvingen-error-dot')).toBeInTheDocument();
  });
});
