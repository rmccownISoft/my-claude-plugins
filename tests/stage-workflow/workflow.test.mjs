// Tests for the stage-workflow skill's workflow.mjs. Run: pnpm test
// Lives outside plugins/ so it doesn't ship with the plugin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  loadWorkflow,
  promote,
  validate,
} from '../../plugins/stage-workflow/skills/stage-workflow/scripts/workflow.mjs'

const here = (/** @type {string} */ f) =>
  fileURLToPath(new URL(f, import.meta.url))
const SKILL = '../../plugins/stage-workflow/skills/stage-workflow/'
const paths = {
  script: here(SKILL + 'scripts/workflow.mjs'),
  yaml: here(SKILL + 'workflow.yaml'),
  issue: here('fixtures/issue.example.json'),
}
const doc = loadWorkflow(readFileSync(paths.yaml, 'utf8'))

/** A Story in Refinement that passes every gate; tests override one field at a time. */
const refined = (over = {}) => ({
  key: 'X-1',
  issueType: 'Story',
  labels: ['customer-acme', 'ai-prep', 'ai-prep:refinement'],
  sections: ['Acceptance Criteria'],
  ...over,
})

test('the example definition is valid', () => {
  assert.deepEqual(validate(doc), [])
})

test('validate catches a misspelled next', () => {
  const bad = structuredClone(doc)
  bad.workflows.prep.stages.scouting.next = 'decomposd'
  assert.ok(
    validate(bad).includes('prep.scouting: next "decomposd" is not a stage'),
  )
})

test('validate catches a stage nothing leads to', () => {
  const bad = structuredClone(doc)
  bad.workflows.dev.stages.abandoned = {}
  assert.ok(validate(bad).includes('dev.abandoned: unreachable from start'))
})

test('validate catches an unknown gate check', () => {
  const bad = structuredClone(doc)
  bad.workflows.dev.stages['in-review'].gate.push('has_vibes')
  assert.ok(
    validate(bad).includes('dev.in-review: unknown gate check "has_vibes"'),
  )
})

test('a Story leaves Refinement for Scouting, keeping unrelated labels', () => {
  const r = promote(doc, refined())
  assert.equal(r.ok, true)
  assert.equal(r.to, 'scouting')
  assert.equal(r.run, 'scout-or-reproduce')
  assert.equal(r.platform, 'code')
  assert.deepEqual(r.labels, ['customer-acme', 'ai-prep', 'ai-prep:scouting'])
})

test('a Bug leaves Refinement for Reproduction', () => {
  assert.equal(promote(doc, refined({ issueType: 'Bug' })).to, 'reproduction')
})

test('a one-repo bug skips decomposition', () => {
  const bug = {
    key: 'B-1',
    issueType: 'Bug',
    labels: ['ai-prep', 'ai-prep:reproduction'],
    artifacts: ['reproduction-report'],
    facts: { fixScope: 'one-repo' },
  }
  assert.equal(promote(doc, bug).to, 'in-progress')
  assert.equal(
    promote(doc, { ...bug, facts: { fixScope: 'many-repos' } }).to,
    'decomposed',
  )
})

test('a failed gate lists every reason and returns no labels', () => {
  const r = promote(
    doc,
    refined({ flagged: true, openQuestions: ['Q2'], sections: [] }),
  )
  assert.equal(r.ok, false)
  assert.equal(r.labels, undefined)
  assert.deepEqual(r.failures, [
    'issue is flagged',
    'open questions remain: Q2',
    'missing section "Acceptance Criteria"',
  ])
})

test('two stage labels is an error, not a guess', () => {
  const r = promote(
    doc,
    refined({ labels: ['ai-prep', 'ai-prep:refinement', 'ai-prep:scouting'] }),
  )
  assert.deepEqual(r.failures, [
    'more than one stage label: refinement, scouting',
  ])
})

test('a parent waits for children below in-review, and names them', () => {
  const issue = JSON.parse(readFileSync(paths.issue, 'utf8'))
  const r = promote(doc, issue)
  assert.deepEqual(r.failures, [
    'children not yet at in-review: EEW-631 (in-progress)',
  ])
})

test('finishing Review drops the stage and retired labels, keeps membership, adds done', () => {
  const issue = {
    key: 'X-2',
    labels: ['customer-acme', 'ai-prep', 'ai-prep:review', 'ai-prep:settled'],
    artifacts: ['acceptance-criteria-checked'],
    children: [{ key: 'X-3', labels: ['ai-dev', 'ai-dev:merged'] }],
  }
  const r = promote(doc, issue)
  assert.equal(r.to, 'done')
  assert.deepEqual(r.labels, ['customer-acme', 'ai-prep', 'ai-done'])
})

test('a done issue cannot be promoted', () => {
  assert.deepEqual(
    promote(doc, { key: 'X-4', labels: ['ai-prep', 'ai-done'] }).failures,
    ['issue is done; nothing to promote'],
  )
})

test('CLI: exit 1 and JSON with failures when a gate fails; exit 2 on bad usage', () => {
  const run = (/** @type {string[]} */ args) =>
    spawnSync(process.execPath, [paths.script, ...args], { encoding: 'utf8' })
  const failed = run(['promote', paths.yaml, paths.issue])
  assert.equal(failed.status, 1)
  assert.equal(JSON.parse(failed.stdout).from, 'in-progress') // parsed output proves it finished, not crashed
  assert.equal(run(['validate', paths.yaml]).stdout.trim(), 'valid')
  assert.equal(run(['nonsense']).status, 2)
})
