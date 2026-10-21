import { describe, expect, it } from 'vitest';
import { hello } from '../../src/hello';

describe('hello', () => {
  it('greets by name', () => {
    expect(hello('Arpit')).toBe('Hello, Arpit!');
  });
});
