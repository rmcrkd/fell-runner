import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeToSeed, dailySeed, hashString, mulberry32, seedToCode } from '../src/rng.js';

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('seed codes round-trip', () => {
  for (const seed of [0, 1, 123456789, 0xffffffff]) {
    assert.equal(codeToSeed(seedToCode(seed)), seed);
  }
  assert.equal(seedToCode(0xffffffff).length, 7);
});

test('codes are case-insensitive and free text hashes to a seed', () => {
  assert.equal(codeToSeed('abc'), codeToSeed('ABC'));
  assert.equal(codeToSeed('Blencathra in a gale!'), hashString('BLENCATHRA IN A GALE!'));
  assert.equal(codeToSeed('   '), null);
});

test('daily seed is stable within a day and changes between days', () => {
  const d1 = new Date('2026-10-17T08:00:00Z');
  const d2 = new Date('2026-10-17T20:00:00Z');
  const d3 = new Date('2026-10-18T08:00:00Z');
  assert.equal(dailySeed(d1), dailySeed(d2));
  assert.notEqual(dailySeed(d1), dailySeed(d3));
});
