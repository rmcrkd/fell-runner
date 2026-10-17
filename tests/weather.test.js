import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, WIND_CAP, byId } from '../src/config.js';
import { createWeather } from '../src/weather.js';

const none = byId(DIFFICULTIES, 'none');
const normal = byId(DIFFICULTIES, 'normal');
const extreme = byId(DIFFICULTIES, 'extreme');

test('no-weather difficulty is completely calm and dry', () => {
  for (let seed = 0; seed < 50; seed++) {
    const w = createWeather(seed, none, 'x');
    assert.equal(w.precipType, 'none');
    assert.equal(w.fog, 0);
    assert.equal(w.grip, 1);
    for (let t = 0; t < 120; t += 0.5) assert.equal(w.windAt(t), 0);
    assert.equal(w.nextGust(0, 999), null);
  }
});

test('same seed gives identical weather; different seeds differ', () => {
  const a = createWeather(1234, extreme, 'helvellyn');
  const b = createWeather(1234, extreme, 'helvellyn');
  const c = createWeather(1235, extreme, 'helvellyn');
  let differs = false;
  for (let t = 0; t < 90; t += 0.1) {
    assert.equal(a.windAt(t), b.windAt(t));
    if (a.windAt(t) !== c.windAt(t)) differs = true;
  }
  assert.ok(differs);
});

test('extreme is windier than normal on average', () => {
  const mean = (d) => {
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < 40; seed++) {
      const w = createWeather(seed, d, 'x');
      for (let t = 0; t < 60; t += 0.5, n++) sum += Math.abs(w.windAt(t));
    }
    return sum / n;
  };
  assert.ok(mean(extreme) > mean(normal) * 1.4);
});

test('wind never exceeds the cap', () => {
  for (let seed = 0; seed < 100; seed++) {
    const w = createWeather(seed, extreme, 'x');
    for (let t = 0; t < 120; t += 0.05) assert.ok(Math.abs(w.windAt(t)) <= WIND_CAP);
  }
});

test('gust warnings come before the gust arrives', () => {
  const w = createWeather(99, extreme, 'scafell');
  const g = w.gusts[0];
  const warn = w.nextGust(g.start - 0.5);
  assert.ok(warn);
  assert.ok(Math.abs(warn.in - 0.5) < 1e-9);
  assert.equal(w.nextGust(g.start - 3), null);
});

test('weather has a human-readable description', () => {
  assert.equal(createWeather(1, none, 'x').describe(), 'Still and clear');
  assert.match(createWeather(1, extreme, 'x').describe(), /(westerly|easterly)/);
});
