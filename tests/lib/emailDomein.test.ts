import { afterEach, describe, expect, it } from 'vitest';
import { completeerBedrijfsEmail, completeerTestKlantEmail } from '@/lib/emailDomein';

const OORSPRONKELIJK_LABEL = process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;

afterEach(() => {
  if (OORSPRONKELIJK_LABEL === undefined) {
    delete process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
  } else {
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = OORSPRONKELIJK_LABEL;
  }
});

describe('completeerBedrijfsEmail', () => {
  it('vult het bedrijfsdomein aan bij een korte gebruikersnaam', () => {
    expect(completeerBedrijfsEmail('hem')).toBe('hem@glassartanddesign.com');
    expect(completeerBedrijfsEmail('paul')).toBe('paul@glassartanddesign.com');
    expect(completeerBedrijfsEmail('julie')).toBe('julie@glassartanddesign.com');
  });

  it('laat een volledig ingevuld adres buiten het bedrijfsdomein ongemoeid', () => {
    expect(completeerBedrijfsEmail('joris.vandenbroek@gmail.com')).toBe(
      'joris.vandenbroek@gmail.com'
    );
  });

  it('negeert omringende spaties', () => {
    expect(completeerBedrijfsEmail('  paul  ')).toBe('paul@glassartanddesign.com');
  });

  it('geeft een lege string terug bij lege invoer, zonder los domein', () => {
    expect(completeerBedrijfsEmail('   ')).toBe('');
  });
});

describe('completeerTestKlantEmail', () => {
  it('vult testaccounts aan op staging', () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
    expect(completeerTestKlantEmail('test1')).toBe('test1@glassartanddesign.com');
    expect(completeerTestKlantEmail('test5')).toBe('test5@glassartanddesign.com');
  });

  it('laat andere invoer zonder @ met rust, ook op staging', () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
    expect(completeerTestKlantEmail('paul')).toBe('paul');
    expect(completeerTestKlantEmail('testklant')).toBe('testklant');
  });

  it('laat een volledig e-mailadres met rust', () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
    expect(completeerTestKlantEmail('klant@example.com')).toBe('klant@example.com');
  });

  it('vult niets aan buiten dev en staging', () => {
    delete process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
    expect(completeerTestKlantEmail('test1')).toBe('test1');
  });
});
