import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CollectiesDropdown } from '@/components/CollectiesDropdown';
import messages from '../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

function snapshot(items: Array<{ id: string; omschrijving: string }>) {
  return {
    empty: items.length === 0,
    docs: items.map(({ id, ...data }) => ({ id, data: () => data })),
  };
}

function renderDropdown() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CollectiesDropdown />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue(
    snapshot([
      { id: 'seg-hotel', omschrijving: 'Hotel' },
      { id: 'seg-wellness', omschrijving: 'Wellness' },
    ])
  );
});

describe('CollectiesDropdown', () => {
  it('always renders a link to /collecties', async () => {
    renderDropdown();
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
  });

  it('shows a dropdown with a link per segment on hover, linking to /collecties?segment=<id>', async () => {
    renderDropdown();
    fireEvent.mouseEnter(screen.getByTestId('collections-dropdown-trigger'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument());
    expect(screen.getByTestId('collections-dropdown-item-seg-hotel')).toHaveAttribute(
      'href',
      '/collecties?segment=seg-hotel'
    );
    expect(screen.getByTestId('collections-dropdown-item-seg-wellness')).toHaveAttribute(
      'href',
      '/collecties?segment=seg-wellness'
    );
    expect(screen.getByTestId('collections-dropdown-item-all')).toHaveAttribute('href', '/collecties');
  });

  it('hides the dropdown again on mouse leave', async () => {
    renderDropdown();
    fireEvent.mouseEnter(screen.getByTestId('collections-dropdown-trigger'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument());
    fireEvent.mouseLeave(screen.getByTestId('collections-dropdown-trigger'));
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
  });

  it('opens on focus and stays open when focus moves to an item inside it (keyboard tabbing)', async () => {
    renderDropdown();
    fireEvent.focus(screen.getByTestId('nav-collections'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument());

    const firstItem = screen.getByTestId('collections-dropdown-item-seg-hotel');
    fireEvent.blur(screen.getByTestId('nav-collections'), { relatedTarget: firstItem });
    expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument();
  });

  it('closes on blur when focus moves outside the dropdown entirely', async () => {
    renderDropdown();
    fireEvent.focus(screen.getByTestId('nav-collections'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument());

    fireEvent.blur(screen.getByTestId('nav-collections'), { relatedTarget: document.body });
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
  });
});
