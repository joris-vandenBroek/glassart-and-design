import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Beveiligingsheaders. Er stond er geen enkele, waardoor de beheeromgeving in
 * een iframe te zetten was (clickjacking) en er niets tussen zat wanneer er ooit
 * wél een XSS-gaatje zou zijn.
 *
 * Bewust géén strikte `script-src`-CSP: Next.js 14 gebruikt inline scripts voor
 * hydratie, en die zonder nonce-infrastructuur dichtzetten breekt de app. Wat
 * hier staat kost niets en dekt de concrete gevallen af.
 */
const SECURITY_HEADERS = [
  // De beheeromgeving hoort nooit in een frame van iemand anders te staan.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // Voorkomt dat een geüploade afbeelding als iets anders geïnterpreteerd wordt.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Geen volledige URL's (met bestelnummers erin) naar externe sites lekken.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Zowel staging als productie draaien volledig op https.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
