/**
 * PII masking (PRD §11, input layer).
 *
 * The route masks every user message before the model call and before the
 * request log. Contact details reach CTI only through the contact form
 * (app/api/tickets/[id]/contact), never through the model.
 *
 * Order matters: email first (it can hold digits), then card, TIN and phone.
 * A card is a run of 13 to 19 digits that passes the Luhn check.
 */
export type PIIKind = 'PHONE' | 'EMAIL' | 'TIN' | 'CARD';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const CARD = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;
// ponytail: hyphenated TINs only. "123456789" with no hyphens is not masked: it can be a quantity or a reference.
const TIN = /(?<![\d-])\d{3}-\d{3}-\d{3}(?:-\d{3,5})?(?![\d-])/g;
const PHONE = /(?<![\d+])(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function maskPII(text: string): { text: string; found: PIIKind[] } {
  const found: PIIKind[] = [];
  const note = (k: PIIKind) => {
    if (!found.includes(k)) found.push(k);
  };
  let out = text.replace(EMAIL, () => (note('EMAIL'), '[EMAIL]'));
  out = out.replace(CARD, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return m;
    note('CARD');
    return '[CARD]';
  });
  out = out.replace(TIN, () => (note('TIN'), '[TIN]'));
  out = out.replace(PHONE, () => (note('PHONE'), '[PHONE]'));
  return { text: out, found };
}
