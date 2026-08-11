'use client';

export function AppVersionLabel() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  if (!version) {
    return null;
  }

  return (
    <span data-testid="app-version-label" className="text-xs text-white/40">
      {version}
    </span>
  );
}
