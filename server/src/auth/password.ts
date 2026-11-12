import { hash, verify } from '@node-rs/argon2';

// argon2id with OWASP-recommended parameters (19 MiB, 2 iterations).
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Pre-computed hash used to keep timing equal when a user does not exist.
let dummyHash: string | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= await hash('dummy-password-for-timing', options);
    await verify(dummyHash, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}
