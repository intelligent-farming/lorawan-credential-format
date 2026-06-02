/**
 * Normalize, validate, and convert LoRaWAN credential strings.
 *
 * Handles the small, repetitive concerns that every LoRaWAN tool reimplements
 * and frequently gets wrong:
 *
 * - Stripping cosmetic byte separators (`-`, `:`, `_`, whitespace) from labels
 * - Uppercasing hex
 * - Validating length and character set for the standard credential types
 *   (DevEUI / JoinEUI / AppKey / NwkKey / DevAddr)
 * - Converting between hex strings and `Uint8Array` (both directions)
 * - Swapping byte order — LoRaWAN labels print MSB-first but the air protocol
 *   transmits EUIs LSB-first, and a packet capture or join-server log will
 *   surface the LSB form. {@link swapByteOrder} bridges the two.
 *
 * Every function is isomorphic — there are no Node-only dependencies, so the
 * module works unchanged in browsers, edge runtimes, and Node.
 *
 * @packageDocumentation
 */
/** Canonical LoRaWAN credential names, keyed by their hex length in characters. */
export type CredentialKind = 'devEui' | 'joinEui' | 'appKey' | 'nwkKey' | 'devAddr';
/** Hex-character length of each {@link CredentialKind}. */
export declare const CREDENTIAL_LENGTHS: Record<CredentialKind, number>;
/**
 * Thrown by the `parse*` family of functions when an input cannot be normalized
 * to a valid hex string of the expected length.
 */
export declare class CredentialFormatError extends Error {
    /** Which credential kind the parser was expecting. */
    readonly kind: CredentialKind | 'hex';
    /** The original input (after `String(input)` coercion but before any trimming). */
    readonly raw: string;
    constructor(kind: CredentialKind | 'hex', raw: string, detail: string);
}
/**
 * Strip cosmetic separators from a hex string and uppercase it.
 *
 * Removes ASCII whitespace, `-`, `:`, and `_` — the four characters vendors
 * commonly insert between bytes on labels and in human-typed input. Does
 * **not** validate that the result is hex; that's the job of {@link isHex}
 * and the type-specific predicates.
 *
 * @example
 * normalize('a8-40-41-03-56-60-e3-aa') // → 'A84041035660E3AA'
 * normalize('A8:40:41:03:56:60:E3:AA') // → 'A84041035660E3AA'
 * normalize(' a84041 035660 e3aa ')    // → 'A84041035660E3AA'
 */
export declare const normalize: (input: string) => string;
/**
 * Test whether a string is valid hex after {@link normalize}.
 *
 * @param input  The string to test.
 * @param length Optional required length in hex characters. If omitted, any
 *               non-empty even-length hex string passes.
 */
export declare const isHex: (input: string, length?: number) => boolean;
/** True when `input`, after normalization, is a 16-char hex DevEUI. */
export declare const isDevEui: (input: string) => boolean;
/** True when `input`, after normalization, is a 16-char hex JoinEUI / AppEUI. */
export declare const isJoinEui: (input: string) => boolean;
/** True when `input`, after normalization, is a 32-char hex AppKey. */
export declare const isAppKey: (input: string) => boolean;
/** True when `input`, after normalization, is a 32-char hex NwkKey (LoRaWAN 1.1.x). */
export declare const isNwkKey: (input: string) => boolean;
/** True when `input`, after normalization, is an 8-char hex DevAddr. */
export declare const isDevAddr: (input: string) => boolean;
/**
 * Infer which credential kind a normalized hex string could be, based on
 * length alone. Returns `undefined` when the length doesn't match any known
 * kind, or when the kind is ambiguous (e.g. 16 chars matches both DevEUI and
 * JoinEUI — in that case `'devEui'` is preferred since it's the more common
 * caller intent).
 */
export declare const inferKind: (input: string) => CredentialKind | undefined;
/** Normalize and validate a DevEUI. Throws {@link CredentialFormatError} on failure. */
export declare const parseDevEui: (input: string) => string;
/** Normalize and validate a JoinEUI / AppEUI. Throws {@link CredentialFormatError} on failure. */
export declare const parseJoinEui: (input: string) => string;
/** Normalize and validate an AppKey. Throws {@link CredentialFormatError} on failure. */
export declare const parseAppKey: (input: string) => string;
/** Normalize and validate an NwkKey. Throws {@link CredentialFormatError} on failure. */
export declare const parseNwkKey: (input: string) => string;
/** Normalize and validate a DevAddr. Throws {@link CredentialFormatError} on failure. */
export declare const parseDevAddr: (input: string) => string;
/** Lenient variant of {@link parseDevEui}. Returns `null` instead of throwing. */
export declare const tryParseDevEui: (input: string) => string | null;
/** Lenient variant of {@link parseJoinEui}. Returns `null` instead of throwing. */
export declare const tryParseJoinEui: (input: string) => string | null;
/** Lenient variant of {@link parseAppKey}. Returns `null` instead of throwing. */
export declare const tryParseAppKey: (input: string) => string | null;
/** Lenient variant of {@link parseNwkKey}. Returns `null` instead of throwing. */
export declare const tryParseNwkKey: (input: string) => string | null;
/** Lenient variant of {@link parseDevAddr}. Returns `null` instead of throwing. */
export declare const tryParseDevAddr: (input: string) => string | null;
/**
 * Convert a hex string to a `Uint8Array`. Accepts any of the cosmetic
 * separator forms — `-`, `:`, `_`, whitespace — handled by {@link normalize}.
 *
 * @throws {@link CredentialFormatError} when the input contains non-hex
 *         characters or has an odd hex length after normalization.
 */
export declare const toBytes: (input: string) => Uint8Array;
/**
 * Convert a `Uint8Array` to an uppercase hex string with no separators.
 * Round-trips cleanly with {@link toBytes}.
 */
export declare const fromBytes: (bytes: Uint8Array) => string;
/**
 * Reverse the byte order of a hex string.
 *
 * LoRaWAN devices print their EUIs MSB-first on labels (`A84041035660E3AA`)
 * but transmit them LSB-first on the air. When you read a packet capture or
 * join-server debug log, the same EUI appears as `AAE36056034140A8` — that's
 * not corruption, it's the LSB form. Use this to translate between the two.
 *
 * Works on any hex of even length. The input is normalized first, so cosmetic
 * separators are tolerated.
 *
 * @example
 * swapByteOrder('A84041035660E3AA') // → 'AAE36056034140A8'
 *
 * @throws {@link CredentialFormatError} when the input isn't valid even-length hex.
 */
export declare const swapByteOrder: (input: string) => string;
//# sourceMappingURL=index.d.ts.map