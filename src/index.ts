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

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

/** Canonical LoRaWAN credential names, keyed by their hex length in characters. */
export type CredentialKind = 'devEui' | 'joinEui' | 'appKey' | 'nwkKey' | 'devAddr';

/** Hex-character length of each {@link CredentialKind}. */
export const CREDENTIAL_LENGTHS: Record<CredentialKind, number> = {
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
export class CredentialFormatError extends Error {
  /** Which credential kind the parser was expecting. */
  readonly kind: CredentialKind | 'hex';
  /** The original input (after `String(input)` coercion but before any trimming). */
  readonly raw: string;
  constructor(kind: CredentialKind | 'hex', raw: string, detail: string) {
    super(`Invalid ${kind}: ${detail}. Input: ${truncate(raw, 80)}`);
    this.name = 'CredentialFormatError';
    this.kind = kind;
    this.raw = raw;
  }
}

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
export const normalize = (input: string): string => {
  return input.replace(/[\s\-:_]+/g, '').toUpperCase();
};

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
export const isHex = (input: string, length?: number): boolean => {
  if (typeof input !== 'string') return false;
  const n = normalize(input);
  if (!HEX_RE.test(n)) return false;
  if (length !== undefined) return n.length === length;
  return n.length > 0 && n.length % 2 === 0;
};

/** True when `input`, after normalization, is a 16-char hex DevEUI. */
export const isDevEui = (input: string): boolean => isHex(input, CREDENTIAL_LENGTHS.devEui);
/** True when `input`, after normalization, is a 16-char hex JoinEUI / AppEUI. */
export const isJoinEui = (input: string): boolean => isHex(input, CREDENTIAL_LENGTHS.joinEui);
/** True when `input`, after normalization, is a 32-char hex AppKey. */
export const isAppKey = (input: string): boolean => isHex(input, CREDENTIAL_LENGTHS.appKey);
/** True when `input`, after normalization, is a 32-char hex NwkKey (LoRaWAN 1.1.x). */
export const isNwkKey = (input: string): boolean => isHex(input, CREDENTIAL_LENGTHS.nwkKey);
/** True when `input`, after normalization, is an 8-char hex DevAddr. */
export const isDevAddr = (input: string): boolean => isHex(input, CREDENTIAL_LENGTHS.devAddr);

/**
 * Infer which credential kind a normalized hex string could be, based on
 * length alone. Returns `undefined` when the length doesn't match any known
 * kind, or when the kind is ambiguous (e.g. 16 chars matches both DevEUI and
 * JoinEUI — in that case `'devEui'` is preferred since it's the more common
 * caller intent).
 */
export const inferKind = (input: string): CredentialKind | undefined => {
  if (!isHex(input)) return undefined;
  const len = normalize(input).length;
  // Ambiguous matches favor the more commonly-referenced kind.
  if (len === CREDENTIAL_LENGTHS.devEui) return 'devEui';
  if (len === CREDENTIAL_LENGTHS.appKey) return 'appKey';
  if (len === CREDENTIAL_LENGTHS.devAddr) return 'devAddr';
  return undefined;
};

/* -------------------------------------------------------------------------- */
/* Strict / lenient parsers                                                    */
/* -------------------------------------------------------------------------- */

const makeStrict = (kind: CredentialKind) => (input: string): string => {
  if (typeof input !== 'string') throw new CredentialFormatError(kind, String(input), 'not a string');
  const n = normalize(input);
  if (!HEX_RE.test(n)) throw new CredentialFormatError(kind, input, 'contains non-hex characters after stripping separators');
  const expected = CREDENTIAL_LENGTHS[kind];
  if (n.length !== expected) throw new CredentialFormatError(kind, input, `expected ${expected} hex chars, got ${n.length}`);
  return n;
};

const makeLenient = (kind: CredentialKind) => (input: string): string | null => {
  try { return makeStrict(kind)(input); }
  catch { return null; }
};

/** Normalize and validate a DevEUI. Throws {@link CredentialFormatError} on failure. */
export const parseDevEui = makeStrict('devEui');
/** Normalize and validate a JoinEUI / AppEUI. Throws {@link CredentialFormatError} on failure. */
export const parseJoinEui = makeStrict('joinEui');
/** Normalize and validate an AppKey. Throws {@link CredentialFormatError} on failure. */
export const parseAppKey = makeStrict('appKey');
/** Normalize and validate an NwkKey. Throws {@link CredentialFormatError} on failure. */
export const parseNwkKey = makeStrict('nwkKey');
/** Normalize and validate a DevAddr. Throws {@link CredentialFormatError} on failure. */
export const parseDevAddr = makeStrict('devAddr');

/** Lenient variant of {@link parseDevEui}. Returns `null` instead of throwing. */
export const tryParseDevEui = makeLenient('devEui');
/** Lenient variant of {@link parseJoinEui}. Returns `null` instead of throwing. */
export const tryParseJoinEui = makeLenient('joinEui');
/** Lenient variant of {@link parseAppKey}. Returns `null` instead of throwing. */
export const tryParseAppKey = makeLenient('appKey');
/** Lenient variant of {@link parseNwkKey}. Returns `null` instead of throwing. */
export const tryParseNwkKey = makeLenient('nwkKey');
/** Lenient variant of {@link parseDevAddr}. Returns `null` instead of throwing. */
export const tryParseDevAddr = makeLenient('devAddr');

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
export const toBytes = (input: string): Uint8Array => {
  if (typeof input !== 'string') throw new CredentialFormatError('hex', String(input), 'not a string');
  const n = normalize(input);
  if (!HEX_RE.test(n) || n.length === 0) throw new CredentialFormatError('hex', input, 'contains non-hex characters');
  if (n.length % 2 !== 0) throw new CredentialFormatError('hex', input, 'odd hex length cannot map to whole bytes');
  const out = new Uint8Array(n.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(n.substr(i * 2, 2), 16);
  return out;
};

/**
 * Convert a `Uint8Array` to an uppercase hex string with no separators.
 * Round-trips cleanly with {@link toBytes}.
 */
export const fromBytes = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s.toUpperCase();
};

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
export const swapByteOrder = (input: string): string => {
  const n = normalize(input);
  if (!HEX_RE.test(n) || n.length === 0) throw new CredentialFormatError('hex', input, 'contains non-hex characters');
  if (n.length % 2 !== 0) throw new CredentialFormatError('hex', input, 'odd hex length cannot map to whole bytes');
  let out = '';
  for (let i = n.length - 2; i >= 0; i -= 2) out += n.substr(i, 2);
  return out;
};

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

const truncate = (s: string, n: number): string => s.length <= n ? s : s.slice(0, n - 1) + '…';
