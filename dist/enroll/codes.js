import { randomInt } from 'node:crypto';
/** Unambiguous characters only: no 0/O/1/I/L, digits and capitals. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function generateCode(length = 8) {
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    return out;
}
/** Normalize scanned/typed codes: uppercase, drop separators and padding. */
export function normalizeCode(input) {
    return input.toUpperCase().replace(/[\s-]/g, '');
}
export function isValidCode(input) {
    return new RegExp(`^[${CODE_ALPHABET}]{8}$`).test(input);
}
//# sourceMappingURL=codes.js.map