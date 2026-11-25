#!/usr/bin/env node
// check.mjs — checks a project against standard.yaml. One run is both the survey (failing checks
// are the gap list) and the verification (done = no failing checks among the agreed ones).
//
//   node check.mjs check    <standard.yaml> <project-dir> [--only id,id]
//   node check.mjs validate <standard.yaml>
//
// Reads files only: never writes, installs, or touches the network.
// Exit codes: 0 all pass / valid, 1 a check failed / standard invalid, 2 usage error.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
// A plugin ships no node_modules, so js-yaml 4.3.1's single-file build is vendored (MIT, see vendor/).
import yaml from './vendor/js-yaml.mjs'

/**
 * @typedef {string | { name: string, min?: string }} DevDependency
 * @typedef {{ has?: string[], lacks?: string[], equals?: Record<string, unknown> }} PackageJsonRule
 * @typedef {{
 *   id: string, description?: string, when?: Record<string, unknown>,
 *   file?: string, contains?: string | string[], absent?: string | string[],
 *   devDependencies?: DevDependency[], scripts?: string[], packageJson?: PackageJsonRule
 * }} Check
 * @typedef {{ version: number, checks: Check[] }} Standard
 * @typedef {{ dir: string, pkg: Record<string, any> | null, pkgProblem: string | null }} Context
 */

/** @param {string} text @returns {Standard} */
export function loadStandard(text) {
  return /** @type {Standard} */ (yaml.load(text))
}

/** Facts a `when` can test. inferFacts returns exactly these keys. */
export const FACTS = [
  'packageManager',
  'library',
  'typescript',
  'outDir',
  'testRunner',
  'jiraPrefix',
]

/** @param {string} dir @returns {Context} */
function readContext(dir) {
  const file = path.join(dir, 'package.json')
  if (!existsSync(file))
    return { dir, pkg: null, pkgProblem: 'no package.json' }
  try {
    return {
      dir,
      pkg: JSON.parse(readFileSync(file, 'utf8')),
      pkgProblem: null,
    }
  } catch {
    return { dir, pkg: null, pkgProblem: 'package.json is not valid JSON' }
  }
}

/**
 * Read the project facts from disk. Deterministic: same files, same facts.
 * @param {string} dir
 */
export function inferFacts(dir) {
  const has = (/** @type {string} */ f) => existsSync(path.join(dir, f))
  const { pkg } = readContext(dir)
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  const tsconfig = has('tsconfig.json')
    ? readFileSync(path.join(dir, 'tsconfig.json'), 'utf8')
    : ''
  return {
    packageManager: has('pnpm-lock.yaml')
      ? 'pnpm'
      : has('package-lock.json')
        ? 'npm'
        : has('yarn.lock')
          ? 'yarn'
          : 'none',
    library: pkg ? pkg.private !== true : null,
    typescript: has('tsconfig.json'),
    // A regex, not JSON.parse: tsconfig files allow comments and trailing commas.
    outDir: /"outDir"\s*:\s*"([^"]+)"/.exec(tsconfig)?.[1] ?? null,
    testRunner:
      ['vitest', 'jest', 'mocha'].find(r => r in deps) ??
      (/node --test/.test(pkg?.scripts?.test ?? '') ? 'node:test' : 'none'),
    jiraPrefix:
      /-p\s+([A-Z][A-Z0-9]*)/.exec(pkg?.scripts?.changeset ?? '')?.[1] ?? null,
  }
}

/** First x.y.z in a version or range ("^3.3.2" -> [3, 3, 2]). @param {string} s */
const parseVersion = s => {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(s)
  return m ? m.slice(1).map(Number) : null
}

/** @param {number[]} a @param {number[]} b */
const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** @param {any} obj @param {string} dotted */
const getField = (obj, dotted) =>
  dotted.split('.').reduce((o, k) => o?.[k], obj)

/** @param {string | string[]} v */
const list = v => [v].flat()

/**
 * Assertions. Each returns the reasons it failed; an empty list means it passed.
 * @type {Record<string, (arg: any, ctx: Context, check: Check) => string[]>}
 */
export const ASSERTIONS = {
  file: (rel, ctx) =>
    existsSync(path.join(ctx.dir, rel)) ? [] : [`missing ${rel}`],
  contains: (want, ctx, check) => {
    const file = path.join(ctx.dir, /** @type {string} */ (check.file))
    if (!existsSync(file)) return [] // `file` already reported it missing
    const text = readFileSync(file, 'utf8')
    return list(want)
      .filter(s => !text.includes(s))
      .map(s => `${check.file} does not contain "${s}"`)
  },
  absent: (rels, ctx) =>
    list(rels)
      .filter(r => existsSync(path.join(ctx.dir, r)))
      .map(r => `${r} should not exist`),
  devDependencies: (specs, ctx) => {
    if (!ctx.pkg) return [/** @type {string} */ (ctx.pkgProblem)]
    return /** @type {DevDependency[]} */ (specs).flatMap(spec => {
      const { name, min } =
        typeof spec === 'string' ? { name: spec, min: undefined } : spec
      const range = ctx.pkg?.devDependencies?.[name]
      if (!range) return [`missing devDependency ${name}`]
      if (!min) return []
      const have = parseVersion(range)
      if (!have)
        return [`${name} is "${range}", which can't be compared with ${min}`]
      const need = /** @type {number[]} */ (parseVersion(min))
      return compareVersions(have, need) < 0
        ? [`${name} is ${range}, needs >= ${min}`]
        : []
    })
  },
  scripts: (names, ctx) => {
    if (!ctx.pkg) return [/** @type {string} */ (ctx.pkgProblem)]
    return list(names)
      .filter(n => !ctx.pkg?.scripts?.[n])
      .map(n => `missing script "${n}"`)
  },
  packageJson: (/** @type {PackageJsonRule} */ rule, ctx) => {
    if (!ctx.pkg) return [/** @type {string} */ (ctx.pkgProblem)]
    return [
      ...(rule.has ?? [])
        .filter(f => getField(ctx.pkg, f) === undefined)
        .map(f => `package.json is missing "${f}"`),
      ...(rule.lacks ?? [])
        .filter(f => getField(ctx.pkg, f) !== undefined)
        .map(f => `package.json should not have "${f}"`),
      ...Object.entries(rule.equals ?? {})
        .filter(([f, v]) => getField(ctx.pkg, f) !== v)
        .map(
          ([f, v]) =>
            `package.json "${f}" is ${JSON.stringify(getField(ctx.pkg, f))}, should be ${JSON.stringify(v)}`,
        ),
    ]
  },
}

const ASSERTION_KEYS = Object.keys(ASSERTIONS)

/**
 * Run every check (or only the listed ids) against a project.
 * @param {Standard} standard @param {string} dir @param {string[]} [only]
 */
export function runChecks(standard, dir, only) {
  const ctx = readContext(dir)
  const facts = inferFacts(dir)
  const results = standard.checks.map(check => {
    if (only && !only.includes(check.id)) {
      return { id: check.id, status: 'skip', reason: 'not in --only' }
    }
    const unmet = Object.entries(check.when ?? {}).filter(
      ([k, v]) => /** @type {any} */ (facts)[k] !== v,
    )
    if (unmet.length) {
      return {
        id: check.id,
        status: 'skip',
        reason: unmet
          .map(([k, v]) => `${k} is not ${JSON.stringify(v)}`)
          .join(', '),
      }
    }
    const failures = [
      ...new Set(
        ASSERTION_KEYS.filter(k => k in check).flatMap(k =>
          ASSERTIONS[k](/** @type {any} */ (check)[k], ctx, check),
        ),
      ),
    ]
    return failures.length
      ? { id: check.id, status: 'fail', failures }
      : { id: check.id, status: 'pass' }
  })
  const count = (/** @type {string} */ s) =>
    results.filter(r => r.status === s).length
  const summary = {
    pass: count('pass'),
    fail: count('fail'),
    skip: count('skip'),
  }
  return { ok: summary.fail === 0, facts, summary, results }
}

/**
 * Check the standard itself, so a typo fails here instead of silently never matching.
 * @param {Standard} standard @returns {string[]} problems, empty when valid
 */
export function validate(standard) {
  if (!Array.isArray(standard?.checks) || standard.checks.length === 0) {
    return ['standard has no checks']
  }
  const problems = []
  const allowed = new Set(['id', 'description', 'when', ...ASSERTION_KEYS])
  const seen = new Set()
  for (const [i, check] of standard.checks.entries()) {
    const at = check.id ?? `checks[${i}]`
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(check.id ?? ''))
      problems.push(`${at}: id must be kebab-case`)
    if (seen.has(check.id)) problems.push(`${at}: duplicate id`)
    seen.add(check.id)
    for (const key of Object.keys(check)) {
      if (!allowed.has(key)) problems.push(`${at}: unknown key "${key}"`)
    }
    if (!ASSERTION_KEYS.some(k => k in check))
      problems.push(`${at}: has no assertions`)
    if ('contains' in check && !check.file)
      problems.push(`${at}: contains needs a file`)
    for (const fact of Object.keys(check.when ?? {})) {
      if (!FACTS.includes(fact))
        problems.push(`${at}: when uses unknown fact "${fact}"`)
    }
    for (const spec of check.devDependencies ?? []) {
      if (
        typeof spec === 'object' &&
        spec.min !== undefined &&
        !parseVersion(spec.min)
      ) {
        problems.push(`${at}: ${spec.name} min "${spec.min}" is not x.y.z`)
      }
    }
  }
  return problems
}

/** @param {string[]} argv @returns {number} exit code */
function main(argv) {
  const usage =
    'usage: check.mjs check <standard.yaml> <project-dir> [--only id,id] | validate <standard.yaml>'
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { only: { type: 'string' } },
    })
  } catch (error) {
    console.error(`${/** @type {Error} */ (error).message}\n${usage}`)
    return 2
  }
  const [command, standardPath, dir] = parsed.positionals
  if (!standardPath || !existsSync(standardPath)) {
    console.error(usage)
    return 2
  }
  const standard = loadStandard(readFileSync(standardPath, 'utf8'))

  if (command === 'validate') {
    const problems = validate(standard)
    problems.forEach(p => console.log(`problem: ${p}`))
    console.log(
      problems.length ? `invalid: ${problems.length} problem(s)` : 'valid',
    )
    return problems.length ? 1 : 0
  }
  if (command === 'check' && dir && existsSync(dir)) {
    const only = parsed.values.only?.split(',').map(s => s.trim())
    const unknown =
      only?.filter(id => !standard.checks.some(c => c.id === id)) ?? []
    if (unknown.length) {
      console.error(`unknown check id(s) in --only: ${unknown.join(', ')}`)
      return 2
    }
    const result = runChecks(standard, dir, only)
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }
  console.error(usage)
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
