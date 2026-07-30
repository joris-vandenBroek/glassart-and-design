import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppVersionLabel } from '@/components/AppVersionLabel';

describe('AppVersionLabel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the version number when NEXT_PUBLIC_APP_VERSION is set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'v12');
    render(<AppVersionLabel />);
    expect(screen.getByTestId('app-version-label')).toHaveTextContent('v12');
  });

  it('renders nothing when NEXT_PUBLIC_APP_VERSION is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    render(<AppVersionLabel />);
    expect(screen.queryByTestId('app-version-label')).not.toBeInTheDocument();
  });
});
