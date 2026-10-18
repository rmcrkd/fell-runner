import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedClock } from '../src/clock.js';

function stepsOver(seconds, hz, speed = 1) {
  const clock = new FixedClock();
  let steps = 0;
  for (let i = 0; i < Math.round(seconds * hz); i++) steps += clock.advance(1 / hz, speed);
  return steps;
}

test('one second of play is 60 physics steps at any refresh rate', () => {
  for (const hz of [30, 50, 60, 75, 90, 120, 144, 165, 240]) assert.equal(stepsOver(1, hz), 60, `${hz} Hz`);
});

test('a ten-minute run stays exact, with no drift', () => {
  assert.equal(stepsOver(600, 144), 36000);
  assert.equal(stepsOver(600, 59.94), 36000);
});

test('assist game speed slows the simulation, not the timing of each step', () => {
  assert.equal(stepsOver(2, 60, 0.5), 60);
  assert.equal(stepsOver(1, 120, 0.7), 42);
});

test('a long stall drops the backlog instead of fast-forwarding', () => {
  const clock = new FixedClock();
  assert.equal(clock.advance(2), 6);
  assert.equal(clock.advance(1 / 60), 1);
});

test('reset clears leftover time', () => {
  const clock = new FixedClock();
  clock.advance(1 / 120);
  clock.reset();
  assert.equal(clock.advance(1 / 120), 0);
});
