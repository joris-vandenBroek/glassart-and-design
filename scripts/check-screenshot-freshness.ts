import { execFileSync } from 'node:child_process';

export const SCREENSHOT_BRONNEN: Record<string, string[]> = {
  'public/documentatie/klant-registratie.png': ['src/components/beheer/KlantModal.tsx'],
  'public/documentatie/bestelproces.png': ['src/components/beheer/BestellingModal.tsx'],
  'public/documentatie/kunstwerken.png': ['src/components/beheer/KunstwerkenSection.tsx', 'src/components/ProductModal.tsx'],
  'public/documentatie/kunstwerken-code-voor.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstwerken-code-na.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstenaars.png': ['src/components/beheer/KunstenaarsSection.tsx'],
  'public/documentatie/drukkers.png': ['src/components/beheer/DrukkerModal.tsx'],
  'public/documentatie/drukkers-zending-bekijken.png': ['src/components/beheer/ZendingBekijkenModal.tsx'],
  'public/documentatie/glassart-design.png': ['src/components/beheer/GlassartDesignSection.tsx'],
  'public/documentatie/instellingen.png': ['src/components/beheer/InstellingenSection.tsx'],
  'public/documentatie/prijsmatrix.png': ['src/components/beheer/PrijsmatrixSection.tsx'],
  'public/documentatie/stamgegevens.png': ['src/components/beheer/MaterialenSection.tsx', 'src/components/beheer/BeheerNav.tsx'],
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

function main(): void {
  const vorigeTag = process.argv[2];
  if (!vorigeTag) {
    console.error('Gebruik: tsx scripts/check-screenshot-freshness.ts <vorige-tag>');
    process.exit(2);
  }

  let gewijzigdeBestanden: string[];
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${vorigeTag}..HEAD`], { encoding: 'utf8' });
    gewijzigdeBestanden = output.split('\n').filter((regel) => regel.trim() !== '');
  } catch (error) {
    // Dit script is een geheugensteun, geen correctheidscontrole -- het mag de deploy nooit
    // laten falen (zie CLAUDE.md). Een onbekende/ongeldige ref of een andere git-hik geeft
    // hier dus alleen een waarschuwing, geen non-zero exit.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Kon de screenshot-versheidscontrole niet uitvoeren: ${message}`);
    return;
  }

  const verouderd = vindMogelijkVerouderdeScreenshots(gewijzigdeBestanden);
  if (verouderd.length === 0) {
    console.log('Geen screenshots lijken verouderd.');
    return;
  }

  for (const { screenshot, bronnen } of verouderd) {
    console.log(
      `::warning::${screenshot} is mogelijk verouderd -- ${bronnen.join(', ')} gewijzigd sinds ${vorigeTag}, maar de screenshot zelf niet. Zie CLAUDE.md's gebruikershandleiding-sectie.`
    );
  }
}

// Only run the CLI when executed directly, so the test can import the pure function
// (same pattern as scripts/check-migrations.ts).
if (process.argv[1]?.endsWith('check-screenshot-freshness.ts')) {
  main();
}
