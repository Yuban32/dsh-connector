/** Unambiguous characters only: no 0/O/1/I/L, digits and capitals. */
export declare const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export declare function generateCode(length?: number): string;
/** Normalize scanned/typed codes: uppercase, drop separators and padding. */
export declare function normalizeCode(input: string): string;
export declare function isValidCode(input: string): boolean;
//# sourceMappingURL=codes.d.ts.map