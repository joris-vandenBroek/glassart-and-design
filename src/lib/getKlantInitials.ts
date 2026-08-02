export function getKlantInitials(
  companyName: string | null | undefined,
  contactPerson: string | null | undefined,
  email: string | null | undefined
): string {
  const source = companyName || contactPerson || email || '';
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
