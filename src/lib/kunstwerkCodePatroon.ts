const STANDAARD_KUNSTWERK_CODE = /^[A-Z]{3}-[A-Z]{3}-\d{5}$/;

export function voldoetAanStandaardKunstwerkCode(code: string): boolean {
  return STANDAARD_KUNSTWERK_CODE.test(code.trim());
}
