import { normalizeColombianPhone } from './phone';

describe('normalizeColombianPhone', () => {
  it.each([
    ['3001234567', '573001234567'],
    ['300 123-4567', '573001234567'],
    ['(300) 123 4567', '573001234567'],
    ['300.123.4567', '573001234567'],
    ['+57 300 123 4567', '573001234567'],
    ['57 300 123 4567', '573001234567'],
    ['573001234567', '573001234567'],
    ['0057 300 123 4567', '573001234567'],
    // Sin indicativo inventado: fijos y números extranjeros solo pierden el formato
    ['6011234567', '6011234567'],
    ['+1 (305) 555-0123', '13055550123'],
    ['  ', ''],
  ])('%p -> %p', (input, expected) => {
    expect(normalizeColombianPhone(input)).toBe(expected);
  });
});
