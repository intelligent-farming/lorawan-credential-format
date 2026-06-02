const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalize, isHex, isDevEui, isJoinEui, isAppKey, isNwkKey, isDevAddr,
  inferKind, CREDENTIAL_LENGTHS, CredentialFormatError,
  parseDevEui, parseJoinEui, parseAppKey, parseNwkKey, parseDevAddr,
  tryParseDevEui, tryParseJoinEui, tryParseAppKey, tryParseNwkKey, tryParseDevAddr,
  toBytes, fromBytes, swapByteOrder,
} = require('..');

// Real-world fixture data — DevEUIs that match actual IEEE OUI assignments,
// AppKeys shaped like real provisioning material.
const FIX = {
  draginoDevEui: 'A84041035660E3AA',         // OUI A84041 = Dragino
  milesightDevEui: '24E124136D456789',       // OUI 24E124 = Milesight IoT
  seeedDevEui: '2CF7F1C04490010D',           // OUI 2CF7F1 = Seeed Technology
  ttnJoinEui: '70B3D57ED0000001',            // 70:B3:D5 = LoRa Alliance MA-S
  milesightDefaultKey: '5572404C696E6B4C6F52613230313823',  // Milesight's documented default
  ttnDevAddr: '26011BDA',
};

describe('normalize', () => {
  test('strips spaces, dashes, colons, underscores and uppercases', () => {
    assert.equal(normalize('a8-40-41-03-56-60-e3-aa'), FIX.draginoDevEui);
    assert.equal(normalize('A8:40:41:03:56:60:E3:AA'), FIX.draginoDevEui);
    assert.equal(normalize(' a84041 035660 e3aa '), FIX.draginoDevEui);
    assert.equal(normalize('A8_40_41_03_56_60_E3_AA'), FIX.draginoDevEui);
    assert.equal(normalize('a8\t40\n41\r03 56:60-e3_aa'), FIX.draginoDevEui);
  });

  test('preserves non-separator characters even if invalid hex', () => {
    // normalize() doesn't validate — that's the validators' job
    assert.equal(normalize('not-hex-input'), 'NOTHEXINPUT');
    assert.equal(normalize('GHIJKL'), 'GHIJKL');
  });

  test('is idempotent — already-normalized input passes through unchanged', () => {
    assert.equal(normalize(FIX.draginoDevEui), FIX.draginoDevEui);
    assert.equal(normalize(normalize('a8:40:41:03:56:60:e3:aa')), FIX.draginoDevEui);
  });

  test('handles empty and separator-only input', () => {
    assert.equal(normalize(''), '');
    assert.equal(normalize('   '), '');
    assert.equal(normalize('---'), '');
    assert.equal(normalize(':::'), '');
  });

  test('handles a long contiguous hex run', () => {
    const long = 'a'.repeat(1000);
    assert.equal(normalize(long), 'A'.repeat(1000));
  });
});

describe('isHex', () => {
  test('validates length when specified', () => {
    assert.equal(isHex(FIX.draginoDevEui, 16), true);
    assert.equal(isHex(FIX.draginoDevEui, 32), false);
    assert.equal(isHex(FIX.milesightDefaultKey, 32), true);
  });

  test('accepts any non-empty even-length hex when no length given', () => {
    assert.equal(isHex(FIX.draginoDevEui), true);
    assert.equal(isHex(FIX.milesightDefaultKey), true);
    assert.equal(isHex('AB'), true);
  });

  test('rejects odd-length hex without an explicit length', () => {
    assert.equal(isHex('ABC'), false);
    assert.equal(isHex('A'), false);
  });

  test('rejects non-hex characters', () => {
    assert.equal(isHex('A84041035660E3AZ', 16), false);  // Z not hex
    assert.equal(isHex('A84041035660E3AG', 16), false);  // G not hex
    assert.equal(isHex('hello world'), false);
  });

  test('rejects empty input even when length 0 implied', () => {
    assert.equal(isHex(''), false);
    assert.equal(isHex('', 0), false);                   // length 0 still rejected
  });

  test('tolerates byte-group separators (delegated to normalize)', () => {
    assert.equal(isHex('a8-40-41-03-56-60-e3-aa', 16), true);
    assert.equal(isHex('70:B3:D5:7E:D0:00:00:01', 16), true);
  });

  test('rejects non-string input', () => {
    assert.equal(isHex(null, 16), false);
    assert.equal(isHex(undefined, 16), false);
    assert.equal(isHex(12345678, 16), false);
    assert.equal(isHex({}, 16), false);
  });
});

describe('type-specific predicates', () => {
  test('isDevEui / isJoinEui require exactly 16 hex chars', () => {
    assert.equal(isDevEui(FIX.draginoDevEui), true);
    assert.equal(isJoinEui(FIX.ttnJoinEui), true);
    assert.equal(isDevEui('70:B3:D5:7E:D0:00:00:01'), true);
    assert.equal(isDevEui(FIX.milesightDefaultKey), false);   // 32 chars
    assert.equal(isJoinEui(FIX.ttnDevAddr), false);           // 8 chars
  });

  test('isAppKey / isNwkKey require exactly 32 hex chars', () => {
    assert.equal(isAppKey(FIX.milesightDefaultKey), true);
    assert.equal(isNwkKey(FIX.milesightDefaultKey), true);
    assert.equal(isAppKey(FIX.draginoDevEui), false);
  });

  test('isDevAddr requires exactly 8 hex chars', () => {
    assert.equal(isDevAddr(FIX.ttnDevAddr), true);
    assert.equal(isDevAddr(FIX.draginoDevEui), false);
    assert.equal(isDevAddr(''), false);
  });
});

describe('inferKind', () => {
  test('returns the right kind for unambiguous lengths', () => {
    assert.equal(inferKind(FIX.milesightDefaultKey), 'appKey');  // 32 chars
    assert.equal(inferKind(FIX.ttnDevAddr), 'devAddr');          // 8 chars
  });

  test('returns devEui for 16-char input (caller intent more common than joinEui)', () => {
    assert.equal(inferKind(FIX.draginoDevEui), 'devEui');
    assert.equal(inferKind(FIX.ttnJoinEui), 'devEui');           // also 16 — biased to devEui
  });

  test('returns undefined for lengths that match no credential kind', () => {
    assert.equal(inferKind('ABCDEF'), undefined);                // 6 chars
    assert.equal(inferKind('ABCDEF12'), 'devAddr');              // 8 — DevAddr (intentional, edge)
    assert.equal(inferKind('AB'), undefined);                    // 2 chars
    assert.equal(inferKind(''), undefined);
  });

  test('returns undefined when input is not hex at all', () => {
    assert.equal(inferKind('NOT-HEX'), undefined);
    assert.equal(inferKind('hello'), undefined);
  });

  test('tolerates separators in the input', () => {
    assert.equal(inferKind('a8-40-41-03-56-60-e3-aa'), 'devEui');
    assert.equal(inferKind('26-01-1B-DA'), 'devAddr');
  });
});

describe('strict parsers', () => {
  test('parseDevEui normalizes and uppercases', () => {
    assert.equal(parseDevEui('a8-40-41-03-56-60-e3-aa'), FIX.draginoDevEui);
    assert.equal(parseDevEui('A8 40 41 03 56 60 E3 AA'), FIX.draginoDevEui);
  });

  test('parseJoinEui handles byte-group separators', () => {
    assert.equal(parseJoinEui('70:b3:d5:7e:d0:00:00:01'), FIX.ttnJoinEui);
  });

  test('parseAppKey handles whitespace-grouped hex', () => {
    assert.equal(
      parseAppKey('  55 72 40 4C 69 6E 6B 4C 6F 52 61 32 30 31 38 23 '),
      FIX.milesightDefaultKey,
    );
  });

  test('parseNwkKey accepts the same format as AppKey', () => {
    assert.equal(
      parseNwkKey('ffeeddccbbaa99887766554433221100'),
      'FFEEDDCCBBAA99887766554433221100',
    );
  });

  test('parseDevAddr normalizes dashed form', () => {
    assert.equal(parseDevAddr('26-01-1B-DA'), FIX.ttnDevAddr);
  });

  test('throws CredentialFormatError with .kind and meaningful message', () => {
    assert.throws(
      () => parseDevEui('not hex'),
      err => err instanceof CredentialFormatError
          && err.kind === 'devEui'
          && /non-hex/.test(err.message),
    );
    assert.throws(
      () => parseAppKey(FIX.draginoDevEui),  // too short
      err => err instanceof CredentialFormatError
          && err.kind === 'appKey'
          && /expected 32/.test(err.message),
    );
  });

  test('throws on non-string input', () => {
    assert.throws(() => parseDevEui(null), CredentialFormatError);
    assert.throws(() => parseDevEui(undefined), CredentialFormatError);
    assert.throws(() => parseDevEui(12345), CredentialFormatError);
    assert.throws(() => parseDevEui([]), CredentialFormatError);
  });

  test('error.raw preserves the original input pre-normalization', () => {
    try { parseDevEui('Bad-input-here'); assert.fail(); }
    catch (err) { assert.equal(err.raw, 'Bad-input-here'); }
  });
});

describe('lenient parsers', () => {
  test('return the canonical form on success', () => {
    assert.equal(tryParseDevEui('a8-40-41-03-56-60-e3-aa'), FIX.draginoDevEui);
    assert.equal(tryParseJoinEui('70:B3:D5:7E:D0:00:00:01'), FIX.ttnJoinEui);
    assert.equal(tryParseAppKey(FIX.milesightDefaultKey), FIX.milesightDefaultKey);
    assert.equal(tryParseNwkKey(FIX.milesightDefaultKey), FIX.milesightDefaultKey);
    assert.equal(tryParseDevAddr(FIX.ttnDevAddr), FIX.ttnDevAddr);
  });

  test('return null on every failure mode', () => {
    assert.equal(tryParseDevEui('not hex'), null);
    assert.equal(tryParseDevEui('A84041'), null);              // short
    assert.equal(tryParseDevEui('A84041035660E3AA00'), null);  // long
    assert.equal(tryParseAppKey(''), null);
    assert.equal(tryParseDevEui(null), null);
    assert.equal(tryParseDevEui(undefined), null);
  });
});

describe('toBytes / fromBytes', () => {
  test('round-trip preserves bytes exactly', () => {
    const bytes = toBytes(FIX.draginoDevEui);
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(bytes.length, 8);
    assert.equal(bytes[0], 0xA8);
    assert.equal(bytes[7], 0xAA);
    assert.equal(fromBytes(bytes), FIX.draginoDevEui);
  });

  test('round-trip survives cosmetic separators in the input', () => {
    assert.equal(fromBytes(toBytes('a8-40-41-03-56-60-e3-aa')), FIX.draginoDevEui);
    assert.equal(fromBytes(toBytes('a8 40 41 03 56 60 e3 aa')), FIX.draginoDevEui);
    assert.equal(fromBytes(toBytes('a8:40:41:03:56:60:e3:aa')), FIX.draginoDevEui);
  });

  test('handles 16-byte AppKey correctly', () => {
    const bytes = toBytes(FIX.milesightDefaultKey);
    assert.equal(bytes.length, 16);
    assert.equal(fromBytes(bytes), FIX.milesightDefaultKey);
  });

  test('fromBytes uppercases and zero-pads each byte', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x0A, 0xFF]);
    assert.equal(fromBytes(bytes), '00010AFF');
  });

  test('toBytes throws CredentialFormatError on bad input', () => {
    assert.throws(() => toBytes('ABC'), CredentialFormatError);        // odd length
    assert.throws(() => toBytes('not hex'), CredentialFormatError);
    assert.throws(() => toBytes(''), CredentialFormatError);
    assert.throws(() => toBytes(null), CredentialFormatError);
    assert.throws(() => toBytes(undefined), CredentialFormatError);
    assert.throws(() => toBytes(12345), CredentialFormatError);
  });

  test('toBytes(separators-only) is empty after normalize → throws', () => {
    assert.throws(() => toBytes('-:-:-'), CredentialFormatError);
  });

  test('fromBytes(empty array) returns empty string', () => {
    assert.equal(fromBytes(new Uint8Array(0)), '');
  });
});

describe('swapByteOrder', () => {
  test('reverses the bytes of a real DevEUI (LoRaWAN MSB↔LSB)', () => {
    // Bytes A8 40 41 03 56 60 E3 AA reversed → AA E3 60 56 03 41 40 A8.
    assert.equal(swapByteOrder(FIX.draginoDevEui), 'AAE36056034140A8');
  });

  test('is self-inverse', () => {
    assert.equal(swapByteOrder(swapByteOrder(FIX.draginoDevEui)), FIX.draginoDevEui);
    assert.equal(swapByteOrder(swapByteOrder(FIX.milesightDefaultKey)), FIX.milesightDefaultKey);
  });

  test('tolerates cosmetic separators', () => {
    assert.equal(swapByteOrder('a8-40-41-03-56-60-e3-aa'), 'AAE36056034140A8');
  });

  test('handles short input (single byte)', () => {
    assert.equal(swapByteOrder('AB'), 'AB');
  });

  test('handles long input (32 bytes = AppKey)', () => {
    const reversed = swapByteOrder(FIX.milesightDefaultKey);
    assert.equal(reversed.length, 32);
    assert.equal(swapByteOrder(reversed), FIX.milesightDefaultKey);
  });

  test('reverses a 4-byte DevAddr', () => {
    assert.equal(swapByteOrder(FIX.ttnDevAddr), 'DA1B0126');
  });

  test('throws CredentialFormatError on odd-length or non-hex', () => {
    assert.throws(() => swapByteOrder('ABC'), CredentialFormatError);
    assert.throws(() => swapByteOrder('not hex'), CredentialFormatError);
    assert.throws(() => swapByteOrder(''), CredentialFormatError);
  });
});

describe('CREDENTIAL_LENGTHS table', () => {
  test('matches the published LoRaWAN spec lengths', () => {
    assert.equal(CREDENTIAL_LENGTHS.devEui, 16);
    assert.equal(CREDENTIAL_LENGTHS.joinEui, 16);
    assert.equal(CREDENTIAL_LENGTHS.appKey, 32);
    assert.equal(CREDENTIAL_LENGTHS.nwkKey, 32);
    assert.equal(CREDENTIAL_LENGTHS.devAddr, 8);
  });

  test('is the authoritative source: type predicates honor it', () => {
    // Length-table changes should ripple to predicates automatically.
    const eui = 'A'.repeat(CREDENTIAL_LENGTHS.devEui);
    const key = 'A'.repeat(CREDENTIAL_LENGTHS.appKey);
    assert.equal(isDevEui(eui), true);
    assert.equal(isAppKey(key), true);
  });
});
