#!/usr/bin/env node
// Guard against SKILL.md `description:` fields that span more than one physical
// line. Some skill loaders read only the first physical line of the description,
// so a multi-line value (a YAML block scalar `>-` / `|`, or a quoted string that
// a formatter wrapped) silently truncates the trigger text Claude sees.
//
// This is dependency-free on purpose: copy it into any repo and run with node.
//
// Usage:
//   node scripts/check-skill-descriptions.mjs [dir-or-glob-root ...]
//
// Defaults to scanning the current working directory recursively for SKILL.md.
// Exits 1 if any description is multi-line, 0 otherwise.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const roots = process.argv.slice(2)
roots.length || roots.push(process.cwd())

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next'])

function findSkillFiles(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) findSkillFiles(full, out)
    } else if (e.name === 'SKILL.md') {
      out.push(full)
    }
  }
  return out
}

// Returns { ok, reason, lineNo } for the description in one SKILL.md.
function checkFile(path) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/)

  if (lines[0]?.trim() !== '---') {
    return { ok: true, skipped: 'no frontmatter' }
  }

  // Find the frontmatter bounds and the description line.
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end === -1) return { ok: true, skipped: 'unterminated frontmatter' }

  let descIdx = -1
  for (let i = 1; i < end; i++) {
    // Top-level key (no indentation) named description.
    if (/^description\s*:/.test(lines[i])) {
      descIdx = i
      break
    }
  }
  if (descIdx === -1) return { ok: true, skipped: 'no description key' }

  const value = lines[descIdx].replace(/^description\s*:/, '').trim()

  // Case 1: block scalar indicator (>, >-, |, |+, etc.) => guaranteed multi-line.
  if (/^[|>][+-]?\d*\s*$/.test(value)) {
    return {
      ok: false,
      lineNo: descIdx + 1,
      reason: `block scalar ('${value}') — value is on following indented lines`,
    }
  }

  // Case 2: empty value with content on following lines.
  if (value === '') {
    return {
      ok: false,
      lineNo: descIdx + 1,
      reason: 'empty inline value — description continues on following lines',
    }
  }

  // Case 3: inline value, but a formatter wrapped it. A continuation line is one
  // that is indented (part of the scalar) rather than the next `key:` or `---`.
  const next = lines[descIdx + 1]
  if (next !== undefined && descIdx + 1 < end) {
    const isIndentedContinuation = /^\s+\S/.test(next) && !/^\s+\S+\s*:/.test(next)
    if (isIndentedContinuation) {
      return {
        ok: false,
        lineNo: descIdx + 1,
        reason: 'inline value wrapped onto following indented line(s)',
      }
    }
  }

  return { ok: true }
}

const files = []
for (const r of roots) {
  try {
    if (statSync(r).isDirectory()) findSkillFiles(r, files)
    else files.push(r)
  } catch {
    console.error(`skip (not found): ${r}`)
  }
}

let failures = 0
let checked = 0
for (const f of files) {
  const res = checkFile(f)
  if (res.skipped) continue
  checked++
  const rel = relative(process.cwd(), f) || f
  if (res.ok) {
    console.log(`ok    ${rel}`)
  } else {
    failures++
    console.log(`FAIL  ${rel}:${res.lineNo} — ${res.reason}`)
  }
}

console.log(`\n${checked} description(s) checked, ${failures} multi-line.`)
process.exit(failures ? 1 : 0)
