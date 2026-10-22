import { describe, expect, it } from 'vitest';
import { pingDb } from '../../src/db/pool';

describe('pingDb', () => {
  it('resolves when the database answers', async () => {
    await expect(pingDb({ query: async () => [] })).resolves.toBeUndefined();
  });

  it('rejects when the database is down', async () => {
    const down = {
      query: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    await expect(pingDb(down)).rejects.toThrow('ECONNREFUSED');
  });
});
