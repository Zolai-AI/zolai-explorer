/**
 * UI check — responsive layout, shadcn/ui usage and above-the-fold reachability
 * for every Studio route, at four viewports.
 *
 * This complements `e2e-studio.ts`: that one proves a flow *works*, this one
 * proves every page is *usable* at every size. The failures it targets are the
 * ones that read as "the page is broken" even though the code is fine:
 *
 *   - horizontal overflow — a container wider than the viewport, so the whole
 *     page drifts sideways on a phone;
 *   - controls below the fold — the composer rendered fine, 900px down, which
 *     is exactly the "there is no chatbox" report;
 *   - collapsed controls — a button or input squeezed to zero height;
 *   - clipped text — a label whose content is wider than its box and cannot
 *     scroll, so half the sentence disappears;
 *   - console errors — a React error boundary or a failed request;
 *   - missing shadcn primitives — a page that drifted back to raw markup.
 *
 * Usage:
 *   chromium --headless --no-sandbox --remote-debugging-port=9222 about:blank &
 *   STUDIO_URL=https://studio.zolai.space bun run scripts/ui-check.ts
 *
 * Set SCREENSHOT_DIR to also write a PNG per route × viewport for eyeballing.
 * Credentials are optional; when present, the gated pages are checked signed-in.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { closeTab, newTab, Session, setReactValue, type PageError } from './lib/cdp'

const STUDIO = (process.env.STUDIO_URL ?? 'https://studio.zolai.space').replace(/\/$/, '')
const USER = process.env.STUDIO_USER
const PASS = process.env.STUDIO_PASS
const SHOTS = process.env.SCREENSHOT_DIR

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
]

/** Pages that exist for every role; the rest need a signed-in admin. */
const PUBLIC_ROUTES = ['/', '/word', '/analyze', '/search', '/rag', '/assistant', '/data', '/links', '/login']
const ADMIN_ROUTES = ['/settings', '/review', '/agent']

/** Controls that must be reachable without scrolling on the page named. */
const ABOVE_THE_FOLD: Record<string, string[]> = {
  '/assistant': ['#assistant-message', 'form button[type="submit"]'],
  '/login': ['#login-password', '[aria-label="Show password"]'],
}

/** A single defect found on one page at one size. */
type Defect = { route: string; viewport: string; check: string; detail: string }

/**
 * Runs in the page. Returns every layout defect for the current viewport in one
 * round trip — walking the DOM once is much cheaper than a query per element.
 */
const PROBE = `(() => {
  const vw = window.innerWidth;
  const problems = [];
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').trim().slice(0, 40);
    return tag + id + cls + (text ? ' "' + text + '"' : '');
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Screen-reader-only text is 1x1px *on purpose* — it is not clipped content,
  // it is content for assistive tech only. Same for aria-hidden decoration.
  const srOnly = (el) =>
    el.classList.contains('sr-only') ||
    el.closest('.sr-only') !== null ||
    el.getAttribute('aria-hidden') === 'true';
  // A link-variant button is a text affordance sized by its own text, not a
  // control: WCAG 2.5.8 exempts inline text links from the target-size minimum.
  // "Back to dashboard" at 20px is the same thing. Real controls — default,
  // outline, ghost, secondary, destructive — and every form field are held to it.
  const isTextAffordance = (el) =>
    el.getAttribute('data-variant') === 'link' ||
    // An anchor only counts as a control when it was rendered *as* one. A bare
    // <Link class="underline"> sitting in a sentence is prose, whatever the
    // flexbox did to its computed display.
    (el.tagName === 'A' && el.getAttribute('data-slot') !== 'button');
  // An element is allowed to be wider than the viewport only if some ancestor
  // deliberately scrolls sideways — that is a table or carousel, not a bug.
  const scrollableAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  // 1. the document itself must not scroll sideways
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push({ check: 'horizontal-overflow',
      detail: 'document scrollWidth ' + document.documentElement.scrollWidth + ' > viewport ' + vw });
  }

  // 2. no visible element sticking out past the right edge
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el) || scrollableAncestor(el) || srOnly(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      problems.push({ check: 'overflows-viewport',
        detail: label(el) + ' spans ' + Math.round(r.left) + '..' + Math.round(r.right) + ' in ' + vw + 'px' });
    }
    if (problems.length > 40) break;
  }

  // The box a control is *drawn* in is not the box you can *hit*. shadcn's
  // Switch is 32x18 by design and widens its target with an absolutely
  // positioned ::after overlay (after:-inset-y-2 => ~34px tall). Measuring the
  // element alone reports a working control as broken, so the effective rect
  // grows by any negative ::after/::before insets.
  const hitRect = (el) => {
    const r = el.getBoundingClientRect();
    let top = r.top, left = r.left, right = r.right, bottom = r.bottom;
    for (const pseudo of ['::after', '::before']) {
      const st = getComputedStyle(el, pseudo);
      if (!st || st.position !== 'absolute' || st.content === 'none') continue;
      const num = (v) => (v === 'auto' || !v ? 0 : parseFloat(v) || 0);
      const t = num(st.top), b = num(st.bottom), l = num(st.left), rr = num(st.right);
      if (t < 0) top += t;   if (b < 0) bottom -= b;
      if (l < 0) left += l;   if (rr < 0) right -= rr;
    }
    return { width: right - left, height: bottom - top };
  };

  // 3. Real controls must have real size and be tappable on a phone; text
  // affordances are exempt (see isTextAffordance above).
  const minTap = vw < 768 ? 32 : 24;
  for (const el of document.querySelectorAll(
    'button, a[href], input, textarea, select, [role="button"], [role="combobox"], [role="switch"]')) {
    if (!visible(el) || srOnly(el) || isTextAffordance(el)) continue;
    const r = hitRect(el);
    if (r.height < minTap || r.width < 16) {
      problems.push({ check: 'collapsed-control',
        detail: label(el) + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' (min ' + minTap + 'px tall)' });
    }
  }

  // 4. text that cannot scroll must not be clipped
  for (const el of document.querySelectorAll('p, span, label, h1, h2, h3, td, th, li')) {
    if (!visible(el) || srOnly(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.children.length === 0) {
      problems.push({ check: 'clipped-text',
        detail: label(el) + ' needs ' + el.scrollWidth + 'px in ' + el.clientWidth + 'px' });
    }
    if (problems.length > 60) break;
  }

  return {
    problems,
    shadcn: document.querySelectorAll('[data-slot]').length,
    renderError: /Something went wrong|Application error|Cannot read propert/i.test(document.body.innerText),
  };
})()`

type Probe = {
  problems: { check: string; detail: string }[]
  shadcn: number
  renderError: boolean
}

const results: Defect[] = []
const notes: string[] = []

function record(route: string, viewport: string, problems: Probe['problems']): void {
  for (const p of problems) results.push({ route, viewport, check: p.check, detail: p.detail })
}

async function checkPage(
  s: Session,
  route: string,
  viewport: { name: string; width: number; height: number },
  /**
   * Set when the caller is signed in and the page is role-gated. A gated page
   * showing its access wall still has perfect layout, so without this the check
   * passes while the page is functionally dead — which is exactly what happened.
   */
  expectUnlocked = false,
) {
  await s.setViewport(viewport.width, viewport.height)
  await s.goto(`${STUDIO}${route}`)

  const probe = (await s.eval<Probe>(PROBE)) ?? { problems: [], shadcn: 0, renderError: false }
  record(route, viewport.name, probe.problems)

  if (probe.renderError) {
    results.push({ route, viewport: viewport.name, check: 'render-error', detail: 'error boundary text on the page' })
  }
  for (const err of s.errors as PageError[]) {
    results.push({
      route,
      viewport: viewport.name,
      check: `console-${err.kind}`,
      detail: err.text.slice(0, 160),
    })
  }

  // A role-gated page must actually open when the role is held.
  if (expectUnlocked) {
    // A gated route renders a skeleton until `/auth/me` answers, so wait for
    // the page to settle before judging it — otherwise a correctly-behaving
    // page is reported as an empty panel.
    await s.waitFor(
      `(() => {
         const m = document.querySelector('main');
         if (!m) return false;
         if (m.querySelector('[aria-busy="true"]')) return false;              // still loading
         if (m.querySelector('[data-slot=card], tbody tr, table')) return true; // rendered
         return /access required/i.test(m.innerText);                           // or walled
       })()`,
      15_000,
    )
    const mainText = await s.eval<string>(`document.querySelector('main')?.innerText ?? ''`)
    const walled = /access required|currently anonymous/i.test(mainText)
    // Only failures are recorded — a passing probe must not count as a defect.
    if (walled) {
      results.push({
        route,
        viewport: viewport.name,
        check: 'still-walled',
        detail: `signed in, but the page showed an access wall: "${mainText.replace(/\s+/g, ' ').slice(0, 90)}"`,
      })
    }
    const content = await s.eval<number>(`document.querySelectorAll('main [data-slot=card], main tbody tr, main table').length`)
    if (content === 0) {
      results.push({
        route,
        viewport: viewport.name,
        check: 'empty-panel',
        detail: 'no cards, rows or tables rendered',
      })
    }
  }

  // Controls that must be reachable without scrolling.
  const required = ABOVE_THE_FOLD[route] ?? []
  if (required.length > 0) {
    const below = await s.eval<string[]>(`(() => {
      const bad = [];
      for (const sel of ${JSON.stringify(required)}) {
        const el = document.querySelector(sel);
        if (!el) { bad.push(sel + ' — not rendered'); continue; }
        const r = el.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom < 0) {
          bad.push(sel + ' — off screen at top=' + Math.round(r.top));
        }
      }
      return bad;
    })()`)
    for (const detail of below ?? []) {
      results.push({ route, viewport: viewport.name, check: 'below-the-fold', detail })
    }
  }

  if (SHOTS) {
    const png = await s.screenshot()
    await writeFile(`${SHOTS}/${viewport.name}-${route.replace(/\W+/g, '_') || 'root'}.png`, Buffer.from(png, 'base64'))
  }

  const ok = probe.problems.length === 0 && !probe.renderError && s.errors.length === 0
  const extra = required.length > 0 ? ` · ${required.length} fold-checked` : ''
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${route.padEnd(11)} ${viewport.name.padEnd(7)} ` +
      `shadcn=${String(probe.shadcn).padStart(3)}${extra}` +
      `${ok ? '' : `  (${probe.problems.length + s.errors.length} issue(s))`}`,
  )
}

async function signIn(s: Session) {
  if (!USER || !PASS) return false
  console.log(`\n  signing in as ${USER} to reach the role-gated pages…`)
  await s.setViewport(1280, 900)
  await s.goto(`${STUDIO}/login`)
  await s.eval(setReactValue('#login-username', USER))
  await s.eval(setReactValue('#login-password', PASS))
  await s.eval(`[...document.querySelectorAll('button[type=submit]')].find(b => /Sign in/.test(b.innerText)).click()`)
  // Wait on the **token**, not the pathname. A successful login writes
  // `zolai.session` immediately, while the redirect off `/login` waits on
  // `/auth/me`; this deployment answers that in seconds, so a 30s pathname wait
  // reported every role-gated page as "checked signed-out" — including /review,
  // which is exactly the page that most needs checking signed in.
  const ok = await s.waitFor(`!!sessionStorage.getItem('zolai.session')`, 60_000)
  if (!ok) {
    notes.push('sign-in did not complete — role-gated pages were checked signed-out')
    return false
  }
  // Still let the app finish its own redirect, but do not fail the run on it.
  await s.waitFor(`location.pathname !== '/login'`, 20_000)
  console.log('  signed in.')
  return true
}

const tab = await newTab()
const session = new Session(tab)
await session.open()

if (SHOTS) {
  await mkdir(SHOTS, { recursive: true })
  console.log(`  screenshots → ${SHOTS}`)
}

try {
  console.log(`\nUI CHECK — ${STUDIO}\n`)
  for (const viewport of VIEWPORTS) {
    console.log(`  --- ${viewport.name} (${viewport.width}x${viewport.height}) ---`)
    for (const route of PUBLIC_ROUTES) await checkPage(session, route, viewport)
  }

  const authed = await signIn(session)
  if (authed) {
    for (const viewport of VIEWPORTS) {
      console.log(`  --- ${viewport.name} (${viewport.width}x${viewport.height}) — signed in ---`)
      for (const route of ADMIN_ROUTES) await checkPage(session, route, viewport, true)
    }
  }
} finally {
  session.close()
  await closeTab(tab)
}

console.log(`\n${'='.repeat(64)}`)
const functional = results.filter((r) => r.check === 'still-walled' || r.check === 'empty-panel')
if (results.length === 0) {
  console.log(`UI CHECK PASSED — no layout defects across ${VIEWPORTS.length} viewports.`)
} else {
  const byCheck = new Map<string, Defect[]>()
  for (const r of results) {
    if (!byCheck.has(r.check)) byCheck.set(r.check, [])
    byCheck.get(r.check)!.push(r)
  }
  console.log(`UI CHECK FAILED — ${results.length} defect(s) in ${byCheck.size} categor(ies):\n`)
  for (const [check, list] of [...byCheck].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${check}  (${list.length})`)
    // Collapse repeats of the same cause across viewports.
    const seen = new Map<string, string[]>()
    for (const d of list) {
      const key = `${d.route}|${d.detail.replace(/\d+px/g, 'Npx').replace(/\d+/g, 'N')}`
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(d.viewport)
    }
    for (const [key, viewports] of seen) {
      const [route] = key.split('|')
      const sample = list.find((d) => `${d.route}|${d.detail.replace(/\d+px/g, 'Npx').replace(/\d+/g, 'N')}` === key)
      console.log(`    ${route.padEnd(11)} ${viewports.join(',').padEnd(26)} ${sample?.detail ?? key.split('|')[1]}`)
    }
    console.log()
  }
}
for (const note of notes) console.log(`note: ${note}`)
if (functional.length > 0) {
  console.log(`\n${functional.length} page(s) rendered an access wall or an empty panel while signed in.`)
}
process.exit(results.length === 0 ? 0 : 1)
