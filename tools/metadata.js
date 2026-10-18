// Keeps the project's public metadata in one place: package.json is the
// source of truth for the description, homepage, keywords (GitHub topics),
// version and licence. CITATION.cff and the GitHub repository's About box
// must match it.
//
//   npm run metadata        check CITATION.cff, and GitHub too if gh can reach it
//   npm run metadata:sync   push the description, homepage and topics to GitHub
//
// The social preview image can't be set through the API: upload
// docs/social-preview.png in Settings → General → Social preview.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(ROOT + file, 'utf8');

export function loadPackage() {
  const pkg = JSON.parse(read('package.json'));
  const repo = pkg.repository.url.replace(/^.*github\.com\//, '').replace(/\.git$/, '');
  return { ...pkg, repo };
}

// Just enough YAML for CITATION.cff: top-level scalars and the keywords list.
export function parseCitation(text) {
  const out = { keywords: [] };
  let list = null;
  for (const line of text.split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue;
    const top = line.match(/^([a-z-]+):\s*(.*)$/);
    if (top) {
      list = top[2] === '' ? top[1] : null;
      if (top[2] !== '') out[top[1]] = top[2].replace(/^["']|["']$/g, '');
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && list === 'keywords') out.keywords.push(item[1]);
  }
  return out;
}

const sameList = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

// Problems that can be found without the network.
export function localProblems(pkg = loadPackage(), cff = parseCitation(read('CITATION.cff'))) {
  const problems = [];
  const expect = (what, got, want) => got !== want && problems.push(`CITATION.cff ${what} is "${got}", but package.json says "${want}"`);
  expect('title', cff.title, 'Fell Runner');
  expect('version', cff.version, pkg.version);
  expect('abstract', cff.abstract, pkg.description);
  expect('url', cff.url, pkg.homepage);
  expect('repository-code', cff['repository-code'], `https://github.com/${pkg.repo}`);
  expect('license', cff.license, pkg.license);
  if (!sameList(cff.keywords, pkg.keywords)) problems.push('CITATION.cff keywords differ from package.json keywords');
  // GitHub's rules for topics
  if (pkg.keywords.length > 20) problems.push('GitHub allows at most 20 topics; package.json has ' + pkg.keywords.length);
  for (const k of pkg.keywords) if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(k)) problems.push(`"${k}" is not a valid GitHub topic (lowercase letters, digits and hyphens, at most 50)`);
  if (pkg.description.length > 350) problems.push('the description is longer than GitHub allows (350 characters)');
  return problems;
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 20000, env: { ...process.env, GH_NO_UPDATE_NOTIFIER: '1', GH_PROMPT_DISABLED: '1' } });
  return r.status === 0 ? r.stdout : null;
}

// The repository's About box as GitHub has it, or null if gh can't tell us.
export function liveMetadata(repo) {
  const out = gh(['repo', 'view', repo, '--json', 'description,homepageUrl,repositoryTopics']);
  if (!out) return null;
  const j = JSON.parse(out);
  return { description: j.description ?? '', homepage: j.homepageUrl ?? '', topics: (j.repositoryTopics ?? []).map((t) => t.name ?? t.topic?.name ?? t) };
}

export function remoteProblems(pkg, live) {
  const problems = [];
  if (live.description !== pkg.description) problems.push(`GitHub description is "${live.description}", not package.json's description`);
  if (live.homepage !== pkg.homepage) problems.push(`GitHub website is "${live.homepage}", not ${pkg.homepage}`);
  if (!sameList(live.topics, pkg.keywords)) problems.push(`GitHub topics [${live.topics.join(', ')}] differ from package.json keywords`);
  return problems;
}

function sync(pkg) {
  const live = liveMetadata(pkg.repo);
  if (!live) throw new Error('gh could not read the repository; is it installed and logged in?');
  const add = pkg.keywords.filter((k) => !live.topics.includes(k));
  const remove = live.topics.filter((t) => !pkg.keywords.includes(t));
  const args = ['repo', 'edit', pkg.repo, '--description', pkg.description, '--homepage', pkg.homepage];
  for (const t of add) args.push('--add-topic', t);
  for (const t of remove) args.push('--remove-topic', t);
  if (gh(args) == null) throw new Error('gh repo edit failed');
  console.log(`Updated ${pkg.repo}: description, website, topics (+${add.length} −${remove.length}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? 'check';
  const pkg = loadPackage();
  if (cmd === 'sync') {
    const local = localProblems(pkg);
    if (local.length) {
      console.error(local.join('\n'));
      process.exit(1);
    }
    sync(pkg);
  } else {
    const problems = localProblems(pkg);
    const live = liveMetadata(pkg.repo);
    if (live) problems.push(...remoteProblems(pkg, live));
    else console.log('(Skipped the GitHub comparison: gh could not reach the repository.)');
    if (problems.length) {
      console.error(problems.join('\n') + '\n\nRun `npm run metadata:sync` once package.json is right and on main.');
      process.exit(1);
    }
    console.log('Metadata is consistent: package.json, CITATION.cff' + (live ? ' and GitHub.' : '.'));
  }
}
