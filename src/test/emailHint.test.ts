import { describe, expect, it } from 'vitest';
import { emailSuggestion } from '../app/emailHint';

describe('E-Mail-Tippfehler', () => {
  it.each([
    ['anna@gmial.com', 'anna@gmail.com'],
    ['anna@gmail.de', null],
    ['anna@gmx.dee', 'anna@gmx.de'],
    ['anna@web.de', null],
    ['anna@hotmial.com', 'anna@hotmail.com'],
    ['anna@uni-stuttgart.de', null],
    ['kein-at', null],
  ])('%s → %s', (input, out) => expect(emailSuggestion(input)).toBe(out));
});
