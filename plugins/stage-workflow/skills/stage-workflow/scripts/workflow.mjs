#!/usr/bin/env node
// workflow.mjs — reads workflow.yaml and an issue snapshot, and decides whether the issue may move.
//
//   node workflow.mjs validate <workflow.yaml>
//   node workflow.mjs promote  <workflow.yaml> <issue.json>
//
// It never talks to Jira. Claude reads the issue, writes the snapshot, runs this, then does what
// the output says: run the `run` step (if any), then write the printed `labels` as the full set.
//
// Exit codes: 0 ok, 1 gate failed / definition invalid, 2 usage error.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
// A plugin ships no node_modules, so js-yaml 4.3.1's single-file build is vendored (MIT, see vendor/).
import yaml from './vendor/js-yaml.mjs'

/**
 * @typedef {{ key: string, labels: string[] }} Child
 * @typedef {{
 *   key: string, issueType?: string, labels: string[], flagged?: boolean,
 *   openQuestions?: string[], sections?: string[], artifacts?: string[],
 *   pr?: { state: 'draft' | 'ready' | 'merged' }, children?: Child[], facts?: Record<string, unknown>
 * }} Issue
 * @typedef {string | Record<string, any>} CheckSpec
 * @typedef {{ gate?: CheckSpec[], next?: string | { when?: Record<string, unknown>, to: string }[],
 *   finish?: boolean, run?: string, platform?: 'any' | 'code' }} Stage
 * @typedef {{ membership_label: string, stage_prefix: string, done_label?: string,
 *   retired_labels?: string[], start: string, stages: Record<string, Stage> }} Workflow
 * @typedef {{ version: number, workflows: Record<string, Workflow> }} Doc
 */

/** @param {string} text @returns {Doc} */
export function loadWorkflow(text) {
  return /** @type {Doc} */ (yaml.load(text))
}

/**
 * Gate checks. Each returns null when it passes, or a sentence saying what is outstanding.
 * @type {Record<string, (arg: any, issue: Issue, doc: Doc) => string | null>}
 */
export const CHECKS = {
  not_flagged: (_, issue) => (issue.flagged ? 'issue is flagged' : null),
  no_open_questions: (_, issue) =>
    issue.openQuestions?.length
      ? `open questions remain: ${issue.openQuestions.join(', ')}`
      : null,
  has_section: (name, issue) =>
    issue.sections?.includes(name) ? null : `missing section "${name}"`,
  has_artifact: (name, issue) =>
    issue.artifacts?.includes(name) ? null : `missing artifact "${name}"`,
  pr_is: (state, issue) =>
    issue.pr?.state === state
      ? null
      : `PR is ${issue.pr?.state ?? 'missing'}, needs to be ${state}`,
  children_at_least: ({ workflow, stage }, issue, doc) => {
    const children = issue.children ?? []
    if (children.length === 0) return 'issue has no children'
    const wf = doc.workflows[workflow]
    const order = Object.keys(wf.stages)
    const behind = children
      .map(c => ({ key: c.key, at: currentStage(wf, c.labels) }))
      .filter(
        c => !c.at.stage || order.indexOf(c.at.stage) < order.indexOf(stage),
      )
      .map(c => `${c.key} (${c.at.stage ?? c.at.error})`)
    return behind.length
      ? `children not yet at ${stage}: ${behind.join(', ')}`
      : null
  },
}

/** Split `not_flagged` or `{ has_section: X }` into a name and its argument. @param {CheckSpec} spec */
function parseCheck(spec) {
  if (typeof spec === 'string') return { name: spec, arg: undefined }
  const [name, arg] = Object.entries(spec)[0]
  return { name, arg }
}

/**
 * Find the issue's one stage label. Enforces "exactly one" instead of trusting it.
 * @param {Workflow} wf @param {string[]} labels
 * @returns {{ stage?: string, done?: boolean, error?: string }}
 */
export function currentStage(wf, labels) {
  const retired = wf.retired_labels ?? []
  const found = labels
    .filter(l => l.startsWith(wf.stage_prefix) && !retired.includes(l))
    .map(l => l.slice(wf.stage_prefix.length))
  const done = wf.done_label !== undefined && labels.includes(wf.done_label)
  if (done && found.length === 0) return { done: true }
  if (done) return { error: `has ${wf.done_label} and a stage label` }
  if (found.length === 0) return { error: `no ${wf.stage_prefix}* label` }
  if (found.length > 1)
    return { error: `more than one stage label: ${found.join(', ')}` }
  if (!wf.stages[found[0]]) return { error: `unknown stage "${found[0]}"` }
  return { stage: found[0] }
}

/** @param {Stage} stage @param {Issue} issue @returns {string | null} */
export function nextStage(stage, issue) {
  if (stage.next === undefined) return null
  if (typeof stage.next === 'string') return stage.next
  const branch = stage.next.find(
    b =>
      !b.when ||
      Object.entries(b.when).every(
        ([k, v]) => /** @type {any} */ ((issue)[k] ?? issue.facts?.[k]) === v,
      ),
  )
  return branch?.to ?? null
}

/**
 * The full label set to write: keeps unrelated labels, drops every stage and retired label,
 * keeps membership, then adds the new stage label (or the done label when `to` is null).
 * @param {Workflow} wf @param {string[]} labels @param {string | null} to
 */
export function nextLabels(wf, labels, to) {
  const kept = labels.filter(
    l =>
      !l.startsWith(wf.stage_prefix) && !(wf.retired_labels ?? []).includes(l),
  )
  const added = to
    ? wf.stage_prefix + to
    : /** @type {string} */ (wf.done_label)
  return [...new Set([...kept, wf.membership_label, added])]
}

/** Pick the workflow by its membership label. @param {Doc} doc @param {Issue} issue */
function workflowFor(doc, issue) {
  const names = Object.keys(doc.workflows).filter(n =>
    issue.labels.includes(doc.workflows[n].membership_label),
  )
  if (names.length === 1) return { name: names[0] }
  return {
    error: names.length
      ? `in more than one workflow: ${names.join(', ')}`
      : 'not in any workflow',
  }
}

/**
 * Decide one promotion. Pure: reads the definition and snapshot, writes nothing.
 * @param {Doc} doc @param {Issue} issue
 */
export function promote(doc, issue) {
  const pick = workflowFor(doc, issue)
  if (!pick.name) return { ok: false, failures: [pick.error] }
  const wf = doc.workflows[pick.name]
  const at = currentStage(wf, issue.labels)
  if (at.done)
    return {
      ok: false,
      workflow: pick.name,
      failures: ['issue is done; nothing to promote'],
    }
  if (!at.stage) return { ok: false, workflow: pick.name, failures: [at.error] }

  const stage = wf.stages[at.stage]
  const failures = (stage.gate ?? [])
    .map(spec => {
      const { name, arg } = parseCheck(spec)
      return CHECKS[name](arg, issue, doc)
    })
    .filter(f => f !== null)
  const to = stage.finish ? null : nextStage(stage, issue)
  if (!stage.finish && !to)
    failures.push(`stage "${at.stage}" has no next stage`)
  if (failures.length)
    return { ok: false, workflow: pick.name, from: at.stage, failures }

  return {
    ok: true,
    workflow: pick.name,
    from: at.stage,
    to: to ?? 'done',
    run: stage.run ?? null,
    platform: stage.platform ?? 'any',
    labels: nextLabels(wf, issue.labels, to),
  }
}

/**
 * Check the definition itself: every reference resolves and every stage is reachable.
 * @param {Doc} doc @returns {string[]} problems, empty when valid
 */
export function validate(doc) {
  const problems = []
  for (const [wname, wf] of Object.entries(doc.workflows ?? {})) {
    const at = (/** @type {string} */ s) => `${wname}.${s}`
    for (const key of ['membership_label', 'stage_prefix', 'start', 'stages']) {
      if (!(/** @type {any} */ (wf)[key]))
        problems.push(`${wname}: missing ${key}`)
    }
    if (!wf.stages) continue
    if (!wf.stages[wf.start])
      problems.push(`${wname}: start "${wf.start}" is not a stage`)

    for (const [sid, stage] of Object.entries(wf.stages)) {
      const branches =
        typeof stage.next === 'string'
          ? [{ to: stage.next }]
          : (stage.next ?? [])
      for (const b of branches) {
        if (!wf.stages[b.to])
          problems.push(`${at(sid)}: next "${b.to}" is not a stage`)
      }
      if (branches.length && /** @type {any} */ (branches.at(-1)).when) {
        problems.push(
          `${at(sid)}: last next branch has a "when", so some issues have nowhere to go`,
        )
      }
      if (stage.finish && branches.length)
        problems.push(`${at(sid)}: has both finish and next`)
      if (stage.finish && !wf.done_label)
        problems.push(`${at(sid)}: finish needs a done_label`)

      for (const spec of stage.gate ?? []) {
        const { name, arg } = parseCheck(spec)
        if (!CHECKS[name])
          problems.push(`${at(sid)}: unknown gate check "${name}"`)
        if (
          name === 'children_at_least' &&
          !doc.workflows[arg?.workflow]?.stages?.[arg?.stage]
        ) {
          problems.push(
            `${at(sid)}: children_at_least points at missing ${arg?.workflow}.${arg?.stage}`,
          )
        }
      }
    }

    const seen = new Set([wf.start])
    for (const sid of seen) {
      const next = wf.stages[sid]?.next
      for (const b of typeof next === 'string' ? [{ to: next }] : (next ?? []))
        seen.add(b.to)
    }
    for (const sid of Object.keys(wf.stages)) {
      if (!seen.has(sid)) problems.push(`${at(sid)}: unreachable from start`)
    }
  }
  return problems
}

/** @param {string[]} argv @returns {number} exit code */
function main(argv) {
  const [command, wfPath, issuePath] = argv
  const usage =
    'usage: workflow.mjs validate <workflow.yaml> | promote <workflow.yaml> <issue.json>'
  if (command === 'validate' && wfPath) {
    const problems = validate(loadWorkflow(readFileSync(wfPath, 'utf8')))
    problems.forEach(p => console.log(`problem: ${p}`))
    console.log(
      problems.length ? `invalid: ${problems.length} problem(s)` : 'valid',
    )
    return problems.length ? 1 : 0
  }
  if (command === 'promote' && wfPath && issuePath) {
    const doc = loadWorkflow(readFileSync(wfPath, 'utf8'))
    const result = promote(doc, JSON.parse(readFileSync(issuePath, 'utf8')))
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }
  console.error(usage)
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2))
