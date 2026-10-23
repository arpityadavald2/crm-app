import * as argon2 from 'argon2';

// OWASP minimum for argon2id: 19 MiB memory, 2 iterations, 1 lane.
// Kept modest on purpose: our dev server has only 1 GB RAM.
const options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, options);
}

/** Never throws: a malformed hash simply counts as "wrong password". */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
