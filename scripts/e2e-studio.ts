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
  check(
    'still signed out after a full page load',
    /access required/i.test(await s.eval<string>(`document.querySelector('main').innerText`)),
  )
}

const tab = await newTab('about:blank')
const s = new Session(tab)
await s.open()
// Pin the viewport. The default headless window is ~780x493, which is below the
// `lg` breakpoint where the sidebar is persistent — the sign-out control then
// lives in a closed mobile drawer with a 0x0 rect, and the click silently did
// nothing. 1280x900 matches the persistent-sidebar layout.
await s.setViewport(1280, 900)
try {
  await testChat(s)
  await testLogin(s)
} finally {
  s.close()
  await closeTab(tab)
}
console.log(`\n${failures.length === 0 ? 'ALL PASS' : 'FAILURES: ' + failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
