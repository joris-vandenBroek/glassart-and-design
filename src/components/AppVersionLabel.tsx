'use client';

export function AppVersionLabel() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  if (!version) {
    return null;
  }

  return (
    <span
      data-testid="app-version-label"
      className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-white/40 sm:left-6"
    >
      {version}
    </span>
  );
}
