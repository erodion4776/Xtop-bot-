// supabase/functions/whatsapp-webhook/lib/encryption.ts
// AES-256-GCM encryption for WhatsApp access tokens at rest.
// Uses the Web Crypto API available in Deno.

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

function getEncryptionKey(): Uint8Array {
  const keyHex = Deno.env.get("ENCRYPTION_KEY") || "";
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function encryptToken(plainText: string): Promise<string> {
  const keyBytes = getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    encoder.encode(plainText)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(cipherText: string): Promise<string> {
  const keyBytes = getEncryptionKey();
  const combined = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);
  const decoder = new TextDecoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    data
  );

  return decoder.decode(decrypted);
}
