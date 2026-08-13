export const SCREENSHOT_BRONNEN: Record<string, string[]> = {
  'public/documentatie/klant-registratie.png': ['src/components/beheer/KlantModal.tsx'],
  'public/documentatie/bestelproces.png': ['src/components/beheer/BestellingModal.tsx'],
  'public/documentatie/kunstwerken.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstwerken-code-voor.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstwerken-code-na.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstenaars.png': ['src/components/beheer/KunstenaarsSection.tsx'],
  'public/documentatie/drukkers.png': ['src/components/beheer/DrukkerModal.tsx'],
  'public/documentatie/glassart-design.png': ['src/components/beheer/GlassartDesignSection.tsx'],
  'public/documentatie/instellingen.png': ['src/components/beheer/InstellingenSection.tsx'],
  'public/documentatie/prijsmatrix.png': ['src/components/beheer/PrijsmatrixSection.tsx'],
  'public/documentatie/stamgegevens.png': ['src/components/beheer/MaterialenSection.tsx'],
  'public/documentatie/klant-website.png': ['src/components/ProductsGrid.tsx'],
};

// Pure: geen git/fs-toegang, dus volledig unit-testbaar.
export function vindMogelijkVerouderdeScreenshots(
  gewijzigdeBestanden: string[],
  mapping: Record<string, string[]> = SCREENSHOT_BRONNEN
): { screenshot: string; bronnen: string[] }[] {
  const gewijzigd = new Set(gewijzigdeBestanden);
  const resultaat: { screenshot: string; bronnen: string[] }[] = [];
  for (const [screenshot, bronnen] of Object.entries(mapping)) {
    const gewijzigdeBronnen = bronnen.filter((bron) => gewijzigd.has(bron));
    if (gewijzigdeBronnen.length > 0 && !gewijzigd.has(screenshot)) {
      resultaat.push({ screenshot, bronnen: gewijzigdeBronnen });
    }
  }
  return resultaat;
}
