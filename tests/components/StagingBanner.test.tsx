import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StagingBanner } from '@/components/StagingBanner';

describe('StagingBanner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows a staging banner when NEXT_PUBLIC_ENVIRONMENT_LABEL is "staging"', () => {
    vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT_LABEL', 'staging');
    render(<StagingBanner />);
    expect(screen.getByTestId('staging-banner')).toHaveTextContent('STAGING');
  });

  it('renders nothing when NEXT_PUBLIC_ENVIRONMENT_LABEL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT_LABEL', '');
    render(<StagingBanner />);
    expect(screen.queryByTestId('staging-banner')).not.toBeInTheDocument();
  });
});
