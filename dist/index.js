"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.swapByteOrder = exports.fromBytes = exports.toBytes = exports.tryParseDevAddr = exports.tryParseNwkKey = exports.tryParseAppKey = exports.tryParseJoinEui = exports.tryParseDevEui = exports.parseDevAddr = exports.parseNwkKey = exports.parseAppKey = exports.parseJoinEui = exports.parseDevEui = exports.inferKind = exports.isDevAddr = exports.isNwkKey = exports.isAppKey = exports.isJoinEui = exports.isDevEui = exports.isHex = exports.normalize = exports.CredentialFormatError = exports.CREDENTIAL_LENGTHS = void 0;
/** Hex-character length of each {@link CredentialKind}. */
exports.CREDENTIAL_LENGTHS = {
    devEui: 16,
    joinEui: 16,
    appKey: 32,
    nwkKey: 32,
    devAddr: 8,
};
/**
 * Thrown by the `parse*` family of functions when an input cannot be normalized
 * to a valid hex string of the expected length.
 */
class CredentialFormatError extends Error {
    constructor(kind, raw, detail) {
        super(`Invalid ${kind}: ${detail}. Input: ${truncate(raw, 80)}`);
        this.name = 'CredentialFormatError';
        this.kind = kind;
        this.raw = raw;
    }
}
exports.CredentialFormatError = CredentialFormatError;
/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */
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
const normalize = (input) => {
    return input.replace(/[\s\-:_]+/g, '').toUpperCase();
};
exports.normalize = normalize;
/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */
const HEX_RE = /^[0-9A-F]+$/;
/**
 * Test whether a string is valid hex after {@link normalize}.
 *
 * @param input  The string to test.
 * @param length Optional required length in hex characters. If omitted, any
 *               non-empty even-length hex string passes.
 */
const isHex = (input, length) => {
    if (typeof input !== 'string')
        return false;
    const n = (0, exports.normalize)(input);
    if (!HEX_RE.test(n))
        return false;
    if (length !== undefined)
        return n.length === length;
    return n.length > 0 && n.length % 2 === 0;
};
exports.isHex = isHex;
/** True when `input`, after normalization, is a 16-char hex DevEUI. */
const isDevEui = (input) => (0, exports.isHex)(input, exports.CREDENTIAL_LENGTHS.devEui);
exports.isDevEui = isDevEui;
/** True when `input`, after normalization, is a 16-char hex JoinEUI / AppEUI. */
const isJoinEui = (input) => (0, exports.isHex)(input, exports.CREDENTIAL_LENGTHS.joinEui);
exports.isJoinEui = isJoinEui;
/** True when `input`, after normalization, is a 32-char hex AppKey. */
const isAppKey = (input) => (0, exports.isHex)(input, exports.CREDENTIAL_LENGTHS.appKey);
exports.isAppKey = isAppKey;
/** True when `input`, after normalization, is a 32-char hex NwkKey (LoRaWAN 1.1.x). */
const isNwkKey = (input) => (0, exports.isHex)(input, exports.CREDENTIAL_LENGTHS.nwkKey);
exports.isNwkKey = isNwkKey;
/** True when `input`, after normalization, is an 8-char hex DevAddr. */
const isDevAddr = (input) => (0, exports.isHex)(input, exports.CREDENTIAL_LENGTHS.devAddr);
exports.isDevAddr = isDevAddr;
/**
 * Infer which credential kind a normalized hex string could be, based on
 * length alone. Returns `undefined` when the length doesn't match any known
 * kind, or when the kind is ambiguous (e.g. 16 chars matches both DevEUI and
 * JoinEUI — in that case `'devEui'` is preferred since it's the more common
 * caller intent).
 */
const inferKind = (input) => {
    if (!(0, exports.isHex)(input))
        return undefined;
    const len = (0, exports.normalize)(input).length;
    // Ambiguous matches favor the more commonly-referenced kind.
    if (len === exports.CREDENTIAL_LENGTHS.devEui)
        return 'devEui';
    if (len === exports.CREDENTIAL_LENGTHS.appKey)
        return 'appKey';
    if (len === exports.CREDENTIAL_LENGTHS.devAddr)
        return 'devAddr';
    return undefined;
};
exports.inferKind = inferKind;
/* -------------------------------------------------------------------------- */
/* Strict / lenient parsers                                                    */
/* -------------------------------------------------------------------------- */
const makeStrict = (kind) => (input) => {
    if (typeof input !== 'string')
        throw new CredentialFormatError(kind, String(input), 'not a string');
    const n = (0, exports.normalize)(input);
    if (!HEX_RE.test(n))
        throw new CredentialFormatError(kind, input, 'contains non-hex characters after stripping separators');
    const expected = exports.CREDENTIAL_LENGTHS[kind];
    if (n.length !== expected)
        throw new CredentialFormatError(kind, input, `expected ${expected} hex chars, got ${n.length}`);
    return n;
};
const makeLenient = (kind) => (input) => {
    try {
        return makeStrict(kind)(input);
    }
    catch {
        return null;
    }
};
/** Normalize and validate a DevEUI. Throws {@link CredentialFormatError} on failure. */
exports.parseDevEui = makeStrict('devEui');
/** Normalize and validate a JoinEUI / AppEUI. Throws {@link CredentialFormatError} on failure. */
exports.parseJoinEui = makeStrict('joinEui');
/** Normalize and validate an AppKey. Throws {@link CredentialFormatError} on failure. */
exports.parseAppKey = makeStrict('appKey');
/** Normalize and validate an NwkKey. Throws {@link CredentialFormatError} on failure. */
exports.parseNwkKey = makeStrict('nwkKey');
/** Normalize and validate a DevAddr. Throws {@link CredentialFormatError} on failure. */
exports.parseDevAddr = makeStrict('devAddr');
/** Lenient variant of {@link parseDevEui}. Returns `null` instead of throwing. */
exports.tryParseDevEui = makeLenient('devEui');
/** Lenient variant of {@link parseJoinEui}. Returns `null` instead of throwing. */
exports.tryParseJoinEui = makeLenient('joinEui');
/** Lenient variant of {@link parseAppKey}. Returns `null` instead of throwing. */
exports.tryParseAppKey = makeLenient('appKey');
/** Lenient variant of {@link parseNwkKey}. Returns `null` instead of throwing. */
exports.tryParseNwkKey = makeLenient('nwkKey');
/** Lenient variant of {@link parseDevAddr}. Returns `null` instead of throwing. */
exports.tryParseDevAddr = makeLenient('devAddr');
/* -------------------------------------------------------------------------- */
/* Hex ↔ bytes conversion                                                      */
/* -------------------------------------------------------------------------- */
/**
 * Convert a hex string to a `Uint8Array`. Accepts any of the cosmetic
 * separator forms — `-`, `:`, `_`, whitespace — handled by {@link normalize}.
 *
 * @throws {@link CredentialFormatError} when the input contains non-hex
 *         characters or has an odd hex length after normalization.
 */
const toBytes = (input) => {
    if (typeof input !== 'string')
        throw new CredentialFormatError('hex', String(input), 'not a string');
    const n = (0, exports.normalize)(input);
    if (!HEX_RE.test(n) || n.length === 0)
        throw new CredentialFormatError('hex', input, 'contains non-hex characters');
    if (n.length % 2 !== 0)
        throw new CredentialFormatError('hex', input, 'odd hex length cannot map to whole bytes');
    const out = new Uint8Array(n.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(n.substr(i * 2, 2), 16);
    return out;
};
exports.toBytes = toBytes;
/**
 * Convert a `Uint8Array` to an uppercase hex string with no separators.
 * Round-trips cleanly with {@link toBytes}.
 */
const fromBytes = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i++)
        s += bytes[i].toString(16).padStart(2, '0');
    return s.toUpperCase();
};
exports.fromBytes = fromBytes;
/* -------------------------------------------------------------------------- */
/* Byte-order swap                                                             */
/* -------------------------------------------------------------------------- */
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
const swapByteOrder = (input) => {
    const n = (0, exports.normalize)(input);
    if (!HEX_RE.test(n) || n.length === 0)
        throw new CredentialFormatError('hex', input, 'contains non-hex characters');
    if (n.length % 2 !== 0)
        throw new CredentialFormatError('hex', input, 'odd hex length cannot map to whole bytes');
    let out = '';
    for (let i = n.length - 2; i >= 0; i -= 2)
        out += n.substr(i, 2);
    return out;
};
exports.swapByteOrder = swapByteOrder;
/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */
const truncate = (s, n) => s.length <= n ? s : s.slice(0, n - 1) + '…';
//# sourceMappingURL=index.js.map