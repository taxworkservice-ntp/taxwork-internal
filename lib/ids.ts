// Short, readable, non-sequential identifiers.
// Crockford-style base32 without ambiguous glyphs (I/L/O/U/0/1).

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
// Largest multiple of the alphabet size that fits in a byte, for unbiased sampling.
const MAX_BYTE = 256 - (256 % ALPHABET.length);

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** e.g. generatePublicId() -> "7F3K9Q2M" */
export function generatePublicId(length = 8): string {
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < MAX_BYTE) out += ALPHABET[bytes[i] % ALPHABET.length];
    }
  }
  return out;
}
