'use client';

export function StagingBanner() {
  if (process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL !== 'staging') {
    return null;
  }

  return (
    <div
      data-testid="staging-banner"
      className="fixed bottom-0 left-0 z-[60] w-full bg-yellow-400 text-center text-sm font-semibold text-black py-1"
    >
      STAGING — dit is niet de live site
    </div>
  );
}
