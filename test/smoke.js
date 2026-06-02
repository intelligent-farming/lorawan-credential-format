const assert = require('assert');
const {
  normalize, isHex, isDevEui, isJoinEui, isAppKey, isNwkKey, isDevAddr,
  inferKind, CREDENTIAL_LENGTHS, CredentialFormatError,
  parseDevEui, parseJoinEui, parseAppKey, parseNwkKey, parseDevAddr,
  tryParseDevEui, tryParseAppKey,
  toBytes, fromBytes, swapByteOrder,
} = require('..');

/* --- normalize: strips separators and uppercases --- */
{
  assert.strictEqual(normalize('a8-40-41-03-56-60-e3-aa'), 'A84041035660E3AA');
  assert.strictEqual(normalize('A8:40:41:03:56:60:E3:AA'), 'A84041035660E3AA');
  assert.strictEqual(normalize(' a84041 035660 e3aa '), 'A84041035660E3AA');
  assert.strictEqual(normalize('A8_40_41_03_56_60_E3_AA'), 'A84041035660E3AA');
  assert.strictEqual(normalize('a8\t40\n41\r03 56:60-e3_aa'), 'A84041035660E3AA');
  console.log('✓ normalize strips spaces/dashes/colons/underscores and uppercases');
}

/* --- isHex generic length check --- */
{
  assert.strictEqual(isHex('A84041035660E3AA'), true);
  assert.strictEqual(isHex('A84041035660E3AA', 16), true);
  assert.strictEqual(isHex('A84041035660E3AA', 32), false);
  assert.strictEqual(isHex('A84041035660E3AZ'), false);       // Z not hex
  assert.strictEqual(isHex(''), false);                       // empty
  assert.strictEqual(isHex('ABC'), false);                    // odd length without explicit length
  assert.strictEqual(isHex('a8-40-41-03-56-60-e3-aa', 16), true);
  console.log('✓ isHex validates length and character set after normalization');
}

/* --- type-specific predicates --- */
{
  assert.strictEqual(isDevEui('A84041035660E3AA'), true);
  assert.strictEqual(isJoinEui('70:B3:D5:7E:D0:00:00:01'), true);
  assert.strictEqual(isAppKey('00112233445566778899AABBCCDDEEFF'), true);
  assert.strictEqual(isNwkKey('00112233445566778899AABBCCDDEEFF'), true);
  assert.strictEqual(isDevAddr('26011BDA'), true);
  // Wrong lengths
  assert.strictEqual(isDevEui('00112233445566778899AABBCCDDEEFF'), false);
  assert.strictEqual(isAppKey('A84041035660E3AA'), false);
  assert.strictEqual(isDevAddr('A84041035660E3AA'), false);
  console.log('✓ type-specific predicates enforce expected lengths');
}

/* --- inferKind disambiguates by length --- */
{
  assert.strictEqual(inferKind('A84041035660E3AA'), 'devEui');           // 16 chars
  assert.strictEqual(inferKind('00112233445566778899AABBCCDDEEFF'), 'appKey'); // 32
  assert.strictEqual(inferKind('26011BDA'), 'devAddr');                  // 8
  assert.strictEqual(inferKind('ABCDEF'), undefined);                    // 6 — not a known kind
  assert.strictEqual(inferKind('NOT-HEX'), undefined);
  console.log('✓ inferKind picks the right kind from normalized length');
}

/* --- strict parsers normalize and return canonical form --- */
{
  assert.strictEqual(parseDevEui('a8-40-41-03-56-60-e3-aa'), 'A84041035660E3AA');
  assert.strictEqual(parseJoinEui('70:b3:d5:7e:d0:00:00:01'), '70B3D57ED0000001');
  assert.strictEqual(parseAppKey('  00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF '),
                                  '00112233445566778899AABBCCDDEEFF');
  assert.strictEqual(parseNwkKey('ffeeddccbbaa99887766554433221100'),
                                  'FFEEDDCCBBAA99887766554433221100');
  assert.strictEqual(parseDevAddr('26-01-1B-DA'), '26011BDA');
  console.log('✓ strict parsers normalize and uppercase');
}

/* --- strict parsers throw CredentialFormatError with context --- */
{
  try {
    parseDevEui('not hex');
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err instanceof CredentialFormatError);
    assert.strictEqual(err.kind, 'devEui');
    assert.ok(err.message.includes('non-hex'));
  }
  try {
    parseAppKey('A84041035660E3AA');  // too short
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err instanceof CredentialFormatError);
    assert.strictEqual(err.kind, 'appKey');
    assert.ok(err.message.includes('expected 32'));
  }
  // Non-string input
  assert.throws(() => parseDevEui(null), CredentialFormatError);
  assert.throws(() => parseDevEui(undefined), CredentialFormatError);
  console.log('✓ strict parsers throw CredentialFormatError with kind + reason');
}

/* --- lenient parsers return null on failure --- */
{
  assert.strictEqual(tryParseDevEui('a8-40-41-03-56-60-e3-aa'), 'A84041035660E3AA');
  assert.strictEqual(tryParseDevEui('not hex'), null);
  assert.strictEqual(tryParseDevEui('A84041'), null);
  assert.strictEqual(tryParseAppKey(''), null);
  assert.strictEqual(tryParseDevEui(null), null);
  console.log('✓ lenient parsers return null instead of throwing');
}

/* --- toBytes / fromBytes round-trip --- */
{
  const bytes = toBytes('A84041035660E3AA');
  assert.ok(bytes instanceof Uint8Array);
  assert.strictEqual(bytes.length, 8);
  assert.strictEqual(bytes[0], 0xA8);
  assert.strictEqual(bytes[7], 0xAA);
  assert.strictEqual(fromBytes(bytes), 'A84041035660E3AA');

  // Round-trip through separators
  const roundTripped = fromBytes(toBytes('a8-40-41-03-56-60-e3-aa'));
  assert.strictEqual(roundTripped, 'A84041035660E3AA');

  // 16-byte AppKey
  const keyBytes = toBytes('00112233445566778899AABBCCDDEEFF');
  assert.strictEqual(keyBytes.length, 16);
  assert.strictEqual(fromBytes(keyBytes), '00112233445566778899AABBCCDDEEFF');

  console.log('✓ toBytes / fromBytes round-trip cleanly');
}

/* --- toBytes rejects invalid input --- */
{
  assert.throws(() => toBytes('ABC'), CredentialFormatError);       // odd length
  assert.throws(() => toBytes('not hex'), CredentialFormatError);
  assert.throws(() => toBytes(''), CredentialFormatError);
  assert.throws(() => toBytes(null), CredentialFormatError);
  console.log('✓ toBytes throws on non-hex, odd-length, or empty input');
}

/* --- swapByteOrder reverses bytes (LoRaWAN MSB↔LSB) --- */
{
  // Real Dragino DevEUI from our QR fixtures.
  // Bytes A8 40 41 03 56 60 E3 AA reversed → AA E3 60 56 03 41 40 A8.
  assert.strictEqual(swapByteOrder('A84041035660E3AA'), 'AAE36056034140A8');
  // Round-trip (self-inverse)
  assert.strictEqual(swapByteOrder(swapByteOrder('A84041035660E3AA')), 'A84041035660E3AA');
  // Works through cosmetic separators
  assert.strictEqual(swapByteOrder('a8-40-41-03-56-60-e3-aa'), 'AAE36056034140A8');
  // 4-byte DevAddr
  assert.strictEqual(swapByteOrder('26011BDA'), 'DA1B0126');
  console.log('✓ swapByteOrder reverses byte order and is self-inverse');
}

/* --- swapByteOrder rejects invalid input --- */
{
  assert.throws(() => swapByteOrder('ABC'), CredentialFormatError);
  assert.throws(() => swapByteOrder('not hex'), CredentialFormatError);
  assert.throws(() => swapByteOrder(''), CredentialFormatError);
  console.log('✓ swapByteOrder throws on odd-length or non-hex input');
}

/* --- CREDENTIAL_LENGTHS table is internally consistent --- */
{
  assert.strictEqual(CREDENTIAL_LENGTHS.devEui, 16);
  assert.strictEqual(CREDENTIAL_LENGTHS.joinEui, 16);
  assert.strictEqual(CREDENTIAL_LENGTHS.appKey, 32);
  assert.strictEqual(CREDENTIAL_LENGTHS.nwkKey, 32);
  assert.strictEqual(CREDENTIAL_LENGTHS.devAddr, 8);
  console.log('✓ CREDENTIAL_LENGTHS exposes the expected per-kind hex sizes');
}

console.log('ok');
