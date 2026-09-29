#!/usr/bin/env node
// Attribution check: the server-side layer of the no-attribution rule (CLAUDE.md,
// "Attribution"). Run by .github/workflows/attribution-guard.yml on every pull request event
// and every push to main.
//
// Why a CI layer exists at all: the two client-side layers, the .githooks/commit-msg hook that
// strips trailers from every local commit and the `attribution` block in .claude/settings.json,
// both act on the machine that writes the text. The GitHub integration used to open pull
// requests appends a generated-by footer with a session link to the DESCRIPTION after the text
// has left that machine, so neither layer can see it. Only something that reads the text back
// from GitHub can catch that.
//
// What counts as attribution: a line that, trimmed, IS one of the known shapes (own-line
// rules), or any line carrying a session URL. Anchoring to the line start matters: a commit
// message or PR body that merely DISCUSSES attribution must never trip the check.
//
// Whose commits are checked: this is a fork that syncs from upstream, and upstream history
// already carries commits whose authors credit Claude (Kim2091's atmosphere work on main, for
// one). Those messages are their authors' history, which the rule keeps as it is, so only
// commits AUTHORED by an address in ATTRIBUTION_OWNER_EMAILS fail on attribution lines; anyone
// else's are reported as notices. A Claude or Anthropic author or committer identity fails
// whoever the commit belongs to, since that only happens when a session commits as itself.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// A whole line (trimmed) that is nothing but attribution.
export const ATTRIBUTION_LINE_RULES = [
  { id: 'co-authored-by', re: /^co-authored-by:.*(claude|anthropic|\[bot\]|ai assistant)/i },
  { id: 'claude-session-trailer', re: /^claude-session:/i },
  { id: 'session-link-line', re: /^<?https?:\/\/claude\.ai\/code\/\S*>?$/i },
  { id: 'generated-by-footer', re: /^[*_]*(🤖\s*)?generated (with|by)\s*\[?claude( code)?\]?/i },
  { id: 'robot-generated', re: /^🤖\s*generated with\b/i },
  { id: 'assisted-by', re: /^assisted[- ]by:.*(claude|anthropic)/i },
]
// A session URL anywhere in a line. The generated-by footer carries one, so this also
// catches a footer whose wording changes.
export const SESSION_URL_RE = /https?:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/i
// Author or committer identities that are not a person.
export const IDENTITY_RE = /anthropic\.com|claude\[bot\]/i

// The addresses whose commits are held to the rule (see the header). Empty means everyone's.
export function ownerEmails(value = process.env.ATTRIBUTION_OWNER_EMAILS) {
  return String(value ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

export function emailOf(identity) {
  return (String(identity ?? '').match(/<([^>]*)>\s*$/)?.[1] ?? '').trim().toLowerCase()
}

export function classifyLine(line) {
  const t = line.trim()
  if (t === '') return null
  for (const rule of ATTRIBUTION_LINE_RULES) if (rule.re.test(t)) return rule.id
  if (SESSION_URL_RE.test(t)) return 'session-url'
  return null
}

// Every attribution line in a piece of text, with its 1-based line number.
export function findAttribution(text) {
  const out = []
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    const rule = classifyLine(line)
    if (rule) out.push({ lineNo: i + 1, line: line.trim(), rule })
  })
  return out
}

// Remove attribution from a pull-request description, touching nothing else.
//  1. The tail block: blank lines, OWN-LINE attribution, and the `---` rule that only
//     existed to introduce the footer, popped from the end until real prose is met
//     (a sentence that happens to contain a session URL is prose, and stops the pop).
//  2. Any own-line attribution left mid-body (the robot line above later prose).
// A session URL EMBEDDED in a sentence is reported in `leftover`, never edited — that
// is a human's call, and the sweep prints it rather than guessing.
export function stripAttribution(body) {
  const lines = String(body ?? '').split(/\r?\n/)
  const removed = []
  let i = lines.length - 1
  let sawAttribution = false
  while (i >= 0) {
    const t = lines[i].trim()
    if (t === '') { i--; continue }
    const rule = classifyLine(lines[i])
    if (rule && rule !== 'session-url') { removed.push(t); sawAttribution = true; i--; continue }
    if (t === '---' && sawAttribution) { sawAttribution = false; i--; continue }
    break
  }
  const kept = []
  for (const line of lines.slice(0, i + 1)) {
    const rule = classifyLine(line)
    if (rule && rule !== 'session-url') { removed.push(line.trim()); continue }
    kept.push(line)
  }
  // A removed mid-body line can leave two blank lines touching; keep one.
  const collapsed = kept.filter((l, k) => !(l.trim() === '' && k > 0 && kept[k - 1].trim() === ''))
  const next = collapsed.join('\n').replace(/\s+$/, '')
  const leftover = findAttribution(next)
  return { body: next, removed, leftover, changed: next !== String(body ?? '').replace(/\s+$/, '') }
}

// ---------- GitHub REST, native fetch, paginated (no gh, no npm) ----------
export async function ghFetchAll(path, token = process.env.GITHUB_TOKEN) {
  const all = []
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`https://api.github.com/${path}${sep}per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'dxvk-remix-attribution-check' },
    })
    if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`)
    const batch = await res.json()
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

// ---------- CLI ----------
function annotate(findings, where) {
  for (const f of findings) {
    console.log(`::error title=Claude attribution::${where}${f.lineNo ? ` line ${f.lineNo}` : ''} [${f.rule}]: ${f.line}`)
  }
}
function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  console.log(text)
}
const FIX = 'Fix: a pull-request DESCRIPTION or COMMENT is edited in place (remove the footer or link line, then this check re-runs on the edit). A COMMIT MESSAGE cannot be edited without rewriting published history, which CLAUDE.md forbids: raise it with Joe. Background: CLAUDE.md, "Attribution".'

function checkPr() {
  const f = [
    ...findAttribution(process.env.PR_TITLE).map((x) => ({ ...x, lineNo: 0 })).map((x) => (annotate([x], 'PR title'), x)),
    ...findAttribution(process.env.PR_BODY).map((x) => (annotate([x], 'PR description'), x)),
  ]
  if (f.length) { summary(`❌ Attribution guard: ${f.length} attribution line(s) in the pull request title or description.\n\n${FIX}`); return 1 }
  summary('✅ Attribution guard: pull request title and description clean.'); return 0
}

async function checkComments(prNumber) {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo || !process.env.GITHUB_TOKEN) { console.log('comments: GITHUB_REPOSITORY/GITHUB_TOKEN unset, skipping'); return 0 }
  const issue = await ghFetchAll(`repos/${repo}/issues/${prNumber}/comments`)
  const review = await ghFetchAll(`repos/${repo}/pulls/${prNumber}/comments`)
  let n = 0
  for (const c of [...issue, ...review]) {
    const f = findAttribution(c.body)
    if (f.length) { n += f.length; annotate(f, `comment ${c.html_url}`) }
  }
  if (n) { summary(`❌ Attribution guard: ${n} attribution line(s) in ${issue.length + review.length} comment(s) on PR #${prNumber}.\n\n${FIX}`); return 1 }
  summary(`✅ Attribution guard: ${issue.length + review.length} comment(s) on PR #${prNumber} clean.`); return 0
}

function git(args) { return execFileSync('git', args, { encoding: 'utf8' }) }
function checkCommits(from, to) {
  let range
  if (!from || /^0+$/.test(from)) range = `${to} -1` // a brand-new ref: just the tip
  else {
    try { execFileSync('git', ['fetch', '--no-tags', '--quiet', 'origin', from, to], { stdio: 'ignore' }) } catch { /* already present, or offline in tests */ }
    range = `${from}..${to}`
  }
  const raw = git(['log', '--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01', ...range.split(' ')])
  const commits = raw.split('\x01').map((s) => s.replace(/^\s+/, '')).filter(Boolean)
  const owners = ownerEmails()
  let n = 0
  let others = 0
  for (const c of commits) {
    const [sha, author, committer, message] = c.split('\x00')
    const lines = findAttribution(message)
    const own = owners.length === 0 || owners.includes(emailOf(author))
    const f = own ? lines : []
    if (!own && lines.length) {
      others += lines.length
      for (const x of lines) console.log(`::notice title=Attribution in another author's commit::commit ${sha.slice(0, 10)} by ${author} [${x.rule}]: ${x.line}`)
    }
    for (const who of [author, committer]) if (IDENTITY_RE.test(who)) f.push({ lineNo: 0, line: who, rule: 'identity' })
    if (f.length) { n += f.length; annotate(f, `commit ${sha.slice(0, 10)}`) }
  }
  if (others) summary(`ℹ️ ${others} attribution line(s) in other authors' commits in ${range}: their history, left as it is.`)
  if (n) { summary(`❌ Attribution guard: ${n} attribution line(s) across ${commits.length} commit(s) in ${range}.\n\n${FIX}`); return 1 }
  summary(`✅ Attribution guard: ${commits.length} commit(s) in ${range} clean.`); return 0
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const [mode, a, b] = process.argv.slice(2)
  let code = 2
  if (mode === 'pr') code = checkPr()
  else if (mode === 'comments') code = await checkComments(a)
  else if (mode === 'commits') code = checkCommits(a, b)
  else console.error('usage: attribution-check.mjs pr | comments <pr-number> | commits <from-sha> <to-sha>  (pr reads PR_TITLE/PR_BODY from the environment)')
  process.exit(code)
}
