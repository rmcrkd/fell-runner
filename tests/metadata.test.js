import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPackage, localProblems, parseCitation, remoteProblems } from '../tools/metadata.js';

test('CITATION.cff matches package.json, and the keywords are valid GitHub topics', () => {
  assert.deepEqual(localProblems(), []);
});

test('a drifted citation or GitHub About box is reported', () => {
  const pkg = loadPackage();
  const cff = parseCitation(`title: Fell Runner\nversion: 0.1.0\nabstract: old\nkeywords:\n  - game\n`);
  const problems = localProblems(pkg, cff);
  assert.ok(problems.some((p) => p.includes('version')));
  assert.ok(problems.some((p) => p.includes('keywords')));
  assert.equal(remoteProblems(pkg, { description: pkg.description, homepage: pkg.homepage, topics: pkg.keywords }).length, 0);
  assert.equal(remoteProblems(pkg, { description: '', homepage: '', topics: [] }).length, 3);
});
