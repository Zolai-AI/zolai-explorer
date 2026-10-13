/**
 * Real-browser end-to-end check for the two surfaces that keep regressing:
 * the assistant composer and the sign-in form.
 *
 * It drives a **real Chromium** over the DevTools Protocol — no test runner, no
 * DOM emulation — so it catches what unit tests cannot: a control that renders
 * but sits below the fold, a button wired to nothing, a page that only breaks
 * once React has hydrated.
 *
 * Usage:
 *   chromium --headless --no-sandbox --remote-debugging-port=9222 about:blank &
 *   STUDIO_URL=https://studio.zolai.space \
 *   STUDIO_USER=you STUDIO_PASS=... bun run scripts/e2e-studio.ts
 *
 * Credentials come from the environment and are never committed; omit them to
 * run the anonymous-assistant half only.
 */
import { closeTab, newTab, Session, setReactValue, sleep } from './lib/cdp'

const STUDIO = (process.env.STUDIO_URL ?? 'https://studio.zolai.space').replace(/\/$/, '')
const USER = process.env.STUDIO_USER
const PASS = process.env.STUDIO_PASS

const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

async function testChat(s: Session) {
  console.log('\n=== /assistant — anonymous visitor chats with no key ===')
  await s.goto(`${STUDIO}/assistant`)

  check('chatbox visible', await s.eval(`!!document.querySelector('#assistant-message')`))
  check('no API-key field demanded', await s.eval(`!document.querySelector('#assistant-api-key')`))

  console.log(await s.eval(setReactValue('#assistant-message', 'What is pasian?')))
  check('send enabled after typing', await s.eval(`!document.querySelector('form button[type=submit]').disabled`))

  await s.eval(`document.querySelector('form button[type=submit]').click()`)
  // Wait for the real answer card, not the "Answer / pending" skeleton.
  const FIND = `(() => {
    const cards = [...document.querySelectorAll('[data-slot=card]')];
    const c = cards.find(c => /^(Answer|Retrieval \\(no model\\))$/.test(c.innerText.trim().split('\\n')[0])
                            && !/^pending/.test(c.innerText.trim().split('\\n')[1] ?? ''));
    return c ? c.innerText.slice(0, 600) : null;
  })()`
  let answer = ''
  for (let i = 0; i < 60; i++) {
    answer = await s.eval<string | null>(FIND) ?? ''
    if (answer) break
    await sleep(1500)
  }
  if (!answer) throw new Error('no answer card appeared within 90s')
  console.log('  answer panel:\n' + answer.split('\n').map((l) => '    ' + l).join('\n'))

  const retrievalOnly = /Retrieval \\(no model\\)|retrieval_only/.test(answer)
  check('answered by a real model (not retrieval_only)', !retrievalOnly,
    retrievalOnly ? 'server fell back to retrieval' : (answer.match(/^[^\n]*·[^\n]*$/m)?.[0] ?? ''))
  check('answer names provider · model', /\w+ · \S+/.test(answer))
  check('citations rendered', /Citations/.test(await s.eval<string>(`document.body.innerText`)))
}

async function testLogin(s: Session) {
  console.log('\n=== /login — password sign-in with the eye toggle ===')
  if (!USER || !PASS) {
    console.log('  SKIP  no STUDIO_USER/STUDIO_PASS in the environment')
    return
  }
  await s.goto(`${STUDIO}/login`)

  check('password field present by default', await s.eval(`!!document.querySelector('#login-password')`))
  check('password starts masked', await s.eval(`document.querySelector('#login-password').type === 'password'`))

  await s.eval(`document.querySelector('[aria-label="Show password"]').click()`)
  check('eye toggle reveals the password', await s.eval(`document.querySelector('#login-password').type === 'text'`))
  check('toggle relabels to Hide', await s.eval(`!!document.querySelector('[aria-label="Hide password"]')`))
  await s.eval(`document.querySelector('[aria-label="Hide password"]').click()`)
  check('eye toggle re-masks', await s.eval(`document.querySelector('#login-password').type === 'password'`))

  console.log(await s.eval(setReactValue('#login-username', USER!)))
  console.log(await s.eval(setReactValue('#login-password', PASS!)))
  await s.eval(`[...document.querySelectorAll('button[type=submit]')].find(b => /Sign in/.test(b.innerText)).click()`)

  await s.waitFor(`location.pathname !== '/login'`, 30_000)
  const path = await s.eval<string>(`location.pathname`)
  check('signed in and redirected off /login', path !== '/login', `→ ${path}`)

  // The real proof the session works is a *gated* page after a full page load.
  // An earlier version of this check grepped for "/admin/assistant/chat", which
  // also appears in the copy every anonymous visitor sees — it passed while the
  // session was in fact dead on the second page.
  await s.goto(`${STUDIO}/review`)
  const review = await s.eval<string>(`document.querySelector('main').innerText`)
  check('session survives a page load (no anonymous downgrade)', !/currently anonymous/i.test(review))
  check('gated /review renders its content, not an access gate', !/access required/i.test(review))

  await s.goto(`${STUDIO}/assistant`)
  // The role-gated affordances render once /auth/me answers; reading the page
  // immediately races that and reports a missing control that is about to appear.
  await s.waitFor(`/Admin mode/.test(document.querySelector('main').innerText)`, 15_000)
  const assistant = await s.eval<string>(`document.querySelector('main').innerText`)
  check(
    'admin-only assistant toggle appears for an admin',
    /Admin mode/.test(assistant),
    /Admin mode/.test(assistant) ? '' : 'the switch renders only for an admin role',
  )

  // --- sign out must actually end the session ---------------------------
  // This used to clear only the stored API key, so a password session survived
  // it: the toast said "the stored API key is gone", the token stayed in
  // sessionStorage and the app kept reporting admin.
  await s.goto(`${STUDIO}/settings`)
  check(
    'signed in: /settings shows its content',
    !/access required/i.test(await s.eval<string>(`document.querySelector('main').innerText`)),
  )

  // The control appears only once the identity query has resolved, and this API
  // answers /auth/me in seconds — a click issued at the fixed settle delay
  // raced the render and reported a control that is about to appear as missing.
  // 40s, matching the mobile half. `/auth/login` on this deployment measures
  // anywhere between 2.5s and 11.5s, so a 25s budget intermittently expired on
  // a slow response and reported a working control as missing.
  await s.waitFor(
    `[...document.querySelectorAll('button, a[href]')].some(x => (x.innerText || '').toLowerCase().includes('sign out'))`,
    40_000,
  )
  const clicked = await s.click('text=sign out')
  check('sign-out control was found and clicked', clicked)
  // Wait on the condition, not a fixed sleep: the logout round-trip plus the
  // cache refetch is over a second and varies.
  let cleared = await s.waitFor(`!sessionStorage.getItem('zolai.session')`, 10_000)
  // A dispatched real mouse event occasionally lands without the page acting on
  // it (the click is proven good by the retry). Re-click once rather than fail
  // the suite on a harness artefact — the app behaviour is what is under test,
  // and it is also covered by the unit tests in `session.test.ts`.
  if (!cleared) {
    await s.click('text=sign out')
    cleared = await s.waitFor(`!sessionStorage.getItem('zolai.session')`, 15_000)
  }
  check('sign-out cleared the session', cleared,
    cleared ? '' : `session still: ${(await s.eval<string | null>(`sessionStorage.getItem('zolai.session')`) ?? 'none').slice(0, 24)}`)

  check(
    'sign out removes the session token',
    !(await s.eval<string | null>(`sessionStorage.getItem('zolai.session')`)),
  )
  // The gate now shows a skeleton while the identity query re-fetches rather
  // than flashing "you are anonymous", so wait for the wall to actually appear.
  await s.waitFor(`/access required/i.test(document.querySelector('main').innerText)`, 20_000)
  const after = await s.eval<string>(`document.querySelector('main').innerText`)
  check('sign out re-gates /settings', /access required/i.test(after))
  check('sign out drops the admin role', /currently anonymous/i.test(after))

  await s.goto(`${STUDIO}/settings`)
  // Wait on the condition: the gate renders a skeleton while the identity
  // query re-fetches, so a snapshot taken at the fixed settle delay sometimes
  // caught the skeleton and reported a signed-out user as still signed in.
  const stillOut = await s.waitFor(
    `/access required/i.test(document.querySelector('main').innerText)`,
    20_000,
  )
  check(
    'still signed out after a full page load',
    stillOut,
    stillOut ? '' : `main: ${(await s.eval<string>(`document.querySelector('main').innerText`)).slice(0, 60)}`,
  )

  // --- the mobile half of sign-out ---------------------------------------
  // Below `lg` the sidebar is a closed drawer, so the TopBar's icon-only control
  // is the only way out. It has render guards in `TopBar.test.tsx` but no
  // browser proof until this ran. The sidebar's own "Sign out" is `display:none`
  // at this width, so the control is targeted by its accessible name rather than
  // by text — a text match would resolve the hidden sidebar button at a 0x0 rect.
  await s.setViewport(390, 844)
  await s.goto(`${STUDIO}/login`)
  await s.eval(setReactValue('#login-username', USER!))
  await s.eval(setReactValue('#login-password', PASS!))
  await s.eval(`[...document.querySelectorAll('button[type=submit]')].find(b => /Sign in/.test(b.innerText)).click()`)
  // Sign-in is awaited as its own check. This deployment answers `/auth/login`
  // in 4-12s, so a slow login used to spend the control's whole budget and was
  // then reported as "the sign-out control is missing" — a different bug wearing
  // this test's name.
  const mobileSignedIn = await s.waitFor(`!!sessionStorage.getItem('zolai.session')`, 60_000)
  check('mobile: signed in at 390px', mobileSignedIn)
  if (!mobileSignedIn) return
  await s.goto(`${STUDIO}/settings`)

  const MOBILE_OUT = 'header [aria-label="Sign out"]'
  check(
    'mobile: the icon-only sign-out is reachable below lg',
    await s.waitFor(`!!document.querySelector('${MOBILE_OUT}')`, 40_000),
  )
  check('mobile: sign-out control was found and clicked', await s.click(MOBILE_OUT))
  const mobileCleared = await s.waitFor(`!sessionStorage.getItem('zolai.session')`, 15_000)
  check('mobile: sign-out cleared the session', mobileCleared, mobileCleared ? '' : 'session survived the click')
  await s.setViewport(1280, 900)
}

/**
 * `/contribute` — the public contribution form.
 *
 * The form shipped unable to submit at all: it rendered inputs for invented
 * columns (`zolai`, `english`, `myanmar`, …) that were never transmitted, and
 * the two columns `ContributionIn` marks required on **every** type — `word`
 * and `suggested_value` — had no input bound to them, so every attempt stopped
 * on "Please enter the word" before a request was made.
 *
 * These checks are deliberately **non-writing**: `POST /contributions` stores a
 * real row in the editorial queue, so an automated run must not create one on
 * every pass. They assert the mapping and the inline validation instead, which
 * is exactly the part that used to be wrong; the real POST was verified once by
 * hand and the resulting row was deleted.
 */
async function testContribute(s: Session) {
  console.log('\n=== /contribute — public contribution form (anonymous) ===')
  await s.goto(`${STUDIO}/contribute`)

  check(
    'the form is reachable with no credential',
    await s.eval(`!!document.querySelector('form')`),
  )
  // The two columns the server requires, by id. If either disappears the form
  // goes back to being unable to submit.
  check(
    'it binds the two columns the server marks required',
    await s.eval(
      `!!document.querySelector('#contrib-word') && !!document.querySelector('#contrib-suggested')`,
    ),
  )
  check(
    'no API-key field is demanded of a contributor',
    await s.eval(`!document.querySelector('#contrib-api-key')`),
  )

  // Submitting empty must surface **inline** errors attached to those two inputs,
  // not a toast that leaves the form looking fine.
  await s.eval(`document.querySelector('form button[type=submit]').click()`)
  const errors = await s.waitFor(
    `document.querySelectorAll('[data-slot=field-error]').length >= 2`,
    10_000,
  )
  check('an empty submit reports the required fields inline', errors)
  check(
    'the required fields are marked invalid for assistive tech',
    await s.eval(
      `!!document.querySelector('#contrib-word[aria-invalid="true"]') && !!document.querySelector('#contrib-suggested[aria-invalid="true"]')`,
    ),
  )
  check(
    'nothing was sent — the form still holds its fields',
    await s.eval(`!document.querySelector('#contrib-word').value`),
  )
}

const tab = await newTab('about:blank')
const s = new Session(tab)
await s.open()
// Pin the viewport to the persistent-sidebar layout. The default headless
// window is ~780x493, which is below the `lg` breakpoint; the desktop checks
// (and the sidebar sign-out they used to depend on) assume the sidebar is on
// screen. The mobile half of the sign-out check re-pins to 390x844 itself.
await s.setViewport(1280, 900)
try {
  await testChat(s)
  await testContribute(s)
  await testLogin(s)
} finally {
  s.close()
  await closeTab(tab)
}
console.log(`\n${failures.length === 0 ? 'ALL PASS' : 'FAILURES: ' + failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
