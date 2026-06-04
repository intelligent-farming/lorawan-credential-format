# @intelligent-farming/lorawan-credential-format

Normalize, validate, and convert LoRaWAN credential strings.

Full API reference: [docs/api-doc.md](docs/api-doc.md). Regenerate with `npm run docs`.

## Install

```sh
npm install @intelligent-farming/lorawan-credential-format
```

## Usage

```ts
import {
  normalize, isDevEui, isAppKey, inferKind,
  parseDevEui, tryParseAppKey, CredentialFormatError,
  toBytes, fromBytes, swapByteOrder,
} from '@intelligent-farming/lorawan-credential-format';

// Strip cosmetic separators and uppercase.
normalize('a8-40-41-03-56-60-e3-aa');   // → 'A84041035660E3AA'
normalize('A8:40:41:03:56:60:E3:AA');   // → 'A84041035660E3AA'

// Type-specific validators (return booleans).
isDevEui('A84041035660E3AA');           // → true
isAppKey('00112233445566778899AABBCCDDEEFF'); // → true

// Infer the kind from length alone.
inferKind('A84041035660E3AA');          // → 'devEui'

// Strict parsers normalize and validate, or throw CredentialFormatError.
parseDevEui('a8:40:41:03:56:60:e3:aa'); // → 'A84041035660E3AA'

// Lenient parsers return null instead of throwing.
tryParseAppKey('not-a-key');            // → null

// Hex ↔ Uint8Array.
const bytes = toBytes('A84041035660E3AA');
fromBytes(bytes);                       // → 'A84041035660E3AA'

// MSB ↔ LSB byte order. A device labeled A84041035660E3AA shows up in packet
// captures and join-server logs as AAE36056034140A8 — same EUI, opposite order.
swapByteOrder('A84041035660E3AA');      // → 'AAE36056034140A8'
```

## Credential kinds

| Kind      | Hex length | Notes                                                |
|-----------|------------|------------------------------------------------------|
| `devEui`  | 16         | Device EUI                                           |
| `joinEui` | 16         | Join EUI (a.k.a. AppEUI before LoRaWAN 1.1)          |
| `appKey`  | 32         | Application root key (and 1.0.x OTAA root key)       |
| `nwkKey`  | 32         | Network root key (LoRaWAN 1.1.x only)                |
| `devAddr` | 8          | Device address (post-join, network-assigned)         |

Lengths are exposed at runtime as `CREDENTIAL_LENGTHS`.

## Errors

Strict parsers and `toBytes` / `swapByteOrder` throw `CredentialFormatError` on bad input. The error carries the credential `kind` it was expecting and the original `raw` input, useful for surfacing form-validation messages:

```ts
try {
  parseDevEui(userInput);
} catch (e) {
  if (e instanceof CredentialFormatError) {
    console.error(`That's not a valid ${e.kind}: ${e.message}`);
  } else {
    throw e;
  }
}
```
