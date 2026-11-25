// Tests for the ts-standard skill's check.mjs. Run: pnpm test
// Builds throwaway projects in the OS temp dir: one that meets the standard, then variants that
// each break one thing. Lives outside plugins/ so it doesn't ship with the plugin.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inferFacts,
  loadStandard,
  runChecks,
  validate,
} from '../../plugins/ts-standard/skills/ts-standard/scripts/check.mjs'

const here = (/** @type {string} */ f) =>
  fileURLToPath(new URL(f, import.meta.url))
const SKILL = '../../plugins/ts-standard/skills/ts-standard/'
const paths = {
  script: here(SKILL + 'scripts/check.mjs'),
  standard: here(SKILL + 'standard.yaml'),
}
const standard = loadStandard(readFileSync(paths.standard, 'utf8'))

const made = /** @type {string[]} */ ([])
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })))

/** Write a project to a temp dir. Objects are written as JSON. @param {Record<string, unknown>} files */
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ts-standard-'))
  made.push(dir)
  for (const [file, content] of Object.entries(files)) {
    if (content === undefined) continue
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(
      join(dir, file),
      typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    )
  }
  return dir
}

const compliantPackage = {
  name: '@isoftdata/example',
  version: '1.0.0',
  packageManager: 'pnpm@10.0.0',
  prettier: '@isoftdata/prettier-config-base',
  'lint-staged': { '*.{ts,js,json,md}': 'prettier --write' },
  scripts: {
    build: 'tsc',
    lint: 'eslint .',
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
    prepare: 'husky',
    test: 'node --test',
    changeset: 'add-changeset -p DOPS',
  },
  devDependencies: {
    '@isoftdata/eslint-config-typescript': '^3.3.2',
    '@isoftdata/prettier-config-base': '^1.0.3',
    prettier: '^3.6.2',
    husky: '^9.1.7',
    'lint-staged': '^16.0.0',
  },
}

/** A project that passes every check; override files to break one thing. @param {Record<string, unknown>} [over] */
const compliant = (over = {}) =>
  project({
    'package.json': compliantPackage,
    'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    'tsconfig.json':
      '{\n  // comments are allowed here\n  "compilerOptions": { "outDir": "lib" },\n}\n',
    'eslint.config.js': 'export default []\n',
    '.prettierignore': 'lib\n',
    '.husky/pre-commit': 'npx lint-staged\n',
    '.gitattributes': '* text=auto eol=lf\n',
    '.github/workflows/ci.yml': 'on: [push, pull_request]\n',
    '.changeset/config.json': '{}',
    ...over,
  })

/** @param {ReturnType<typeof runChecks>} r @param {string} id */
const result = (r, id) => r.results.find(x => x.id === id)

test('the shipped standard is valid', () => {
  assert.deepEqual(validate(standard), [])
})

test('validate catches unknown keys and facts, duplicate ids, and contains without file', () => {
  const problems = validate({
    version: 1,
    checks: [
      { id: 'a', file: 'x', fiel: 'typo' },
      { id: 'a', contains: 'y', when: { isLibrary: true } },
      { id: 'b' },
    ],
  })
  assert.deepEqual(problems, [
    'a: unknown key "fiel"',
    'a: duplicate id',
    'a: contains needs a file',
    'a: when uses unknown fact "isLibrary"',
    'b: has no assertions',
  ])
})

test('facts are read from disk', () => {
  assert.deepEqual(inferFacts(compliant()), {
    packageManager: 'pnpm',
    library: true,
    typescript: true,
    outDir: 'lib',
    testRunner: 'node:test',
    jiraPrefix: 'DOPS',
  })
  const app = project({
    'package.json': { private: true, devDependencies: { mocha: '^10.0.0' } },
    'package-lock.json': '{}',
  })
  assert.deepEqual(inferFacts(app), {
    packageManager: 'npm',
    library: false,
    typescript: false,
    outDir: null,
    testRunner: 'mocha',
    jiraPrefix: null,
  })
})

test('a compliant library passes every check', () => {
  const r = runChecks(standard, compliant())
  assert.deepEqual(
    r.results.filter(x => x.status !== 'pass'),
    [],
  )
  assert.equal(r.ok, true)
})

test('an app skips changesets and says why', () => {
  const pkg = { ...compliantPackage, private: true }
  const r = runChecks(
    standard,
    compliant({ 'package.json': pkg, '.changeset/config.json': undefined }),
  )
  assert.deepEqual(result(r, 'changesets'), {
    id: 'changesets',
    status: 'skip',
    reason: 'library is not true',
  })
  assert.equal(r.ok, true)
})

test('a bare npm project: every gap is named', () => {
  const r = runChecks(
    standard,
    project({
      'package.json': { name: 'old', eslintConfig: {} },
      'package-lock.json': '{}',
      '.eslintrc.json': '{}',
    }),
  )
  assert.equal(r.ok, false)
  assert.deepEqual(result(r, 'pnpm')?.failures, [
    'missing pnpm-lock.yaml',
    'package-lock.json should not exist',
    'package.json is missing "packageManager"',
  ])
  assert.deepEqual(result(r, 'eslint-flat-config')?.failures, [
    'missing eslint.config.js',
    '.eslintrc.json should not exist',
    'missing devDependency @isoftdata/eslint-config-typescript',
    'package.json should not have "eslintConfig"',
  ])
  assert.equal(r.summary.pass, 0)
})

test('an old shared ESLint config fails its minimum version', () => {
  const pkg = structuredClone(compliantPackage)
  pkg.devDependencies['@isoftdata/eslint-config-typescript'] = '^2.1.0'
  const r = runChecks(standard, compliant({ 'package.json': pkg }))
  assert.deepEqual(result(r, 'eslint-flat-config')?.failures, [
    '@isoftdata/eslint-config-typescript is ^2.1.0, needs >= 3.0.0',
  ])
})

test('devEngines.packageManager fails the pnpm check', () => {
  const pkg = {
    ...compliantPackage,
    devEngines: { packageManager: { name: 'pnpm' } },
  }
  const r = runChecks(standard, compliant({ 'package.json': pkg }))
  assert.deepEqual(result(r, 'pnpm')?.failures, [
    'package.json should not have "devEngines.packageManager"',
  ])
})

test('a file that exists but lacks its content fails with the missing text', () => {
  const r = runChecks(
    standard,
    compliant({ '.gitattributes': '* text=auto\n' }),
  )
  assert.deepEqual(result(r, 'line-endings')?.failures, [
    '.gitattributes does not contain "* text=auto eol=lf"',
  ])
})

test('invalid package.json is reported, not crashed on', () => {
  const r = runChecks(standard, compliant({ 'package.json': '{ "name": ' }))
  assert.deepEqual(result(r, 'core-scripts')?.failures, [
    'package.json is not valid JSON',
  ])
})

test('--only verifies the agreed checks and skips the rest', () => {
  const r = runChecks(standard, project({ 'package.json': {} }), [
    'core-scripts',
  ])
  assert.equal(r.summary.fail, 1)
  assert.equal(r.summary.skip, standard.checks.length - 1)
})

test('CLI: exit 0 compliant, 1 with gaps, 2 for an unknown --only id or bad usage', () => {
  const run = (/** @type {string[]} */ args) =>
    spawnSync(process.execPath, [paths.script, ...args], { encoding: 'utf8' })
  assert.equal(run(['check', paths.standard, compliant()]).status, 0)
  const gaps = run(['check', paths.standard, project({ 'package.json': {} })])
  assert.equal(gaps.status, 1)
  assert.equal(JSON.parse(gaps.stdout).ok, false) // parsed output proves it finished, not crashed
  assert.equal(
    run(['check', paths.standard, compliant(), '--only', 'nope']).status,
    2,
  )
  assert.equal(run(['validate', paths.standard]).stdout.trim(), 'valid')
  assert.equal(run(['nonsense']).status, 2)
})
