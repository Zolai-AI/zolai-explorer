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
const CDP_HTTP = process.env.CDP_HTTP ?? 'http://127.0.0.1:9222'
const STUDIO = (process.env.STUDIO_URL ?? 'https://studio.zolai.space').replace(/\/$/, '')
const USER = process.env.STUDIO_USER
const PASS = process.env.STUDIO_PASS

type Tab = { id: string; webSocketDebuggerUrl: string }

async function newTab(url: string): Promise<Tab> {
  const r = await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  return (await r.json()) as Tab
}

class Session {
  private ws!: WebSocket
  private id = 0
  private pending = new Map<number, (v: any) => void>()
  constructor(private tab: Tab) {}
  async open() {
    this.ws = new WebSocket(this.tab.webSocketDebuggerUrl)
    await new Promise<void>((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = rej })
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data))
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id) }
    }
    await this.send('Page.enable')
    await this.send('Runtime.enable')
  }
  send(method: string, params: any = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise<any>((res) => this.pending.set(id, res))
  }
  async goto(url: string) {
    await this.send('Page.navigate', { url })
    await this.waitFor('document.readyState === "complete"', 20_000)
    await sleep(2500) // let react-query settle
  }
  async eval<T = string>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
    return r.result?.result?.value as T
  }
  async waitFor(expr: string, ms = 25_000) {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      try { if (await this.eval(`!!(${expr})`)) return true } catch {}
      await sleep(400)
    }
    throw new Error(`timeout waiting for: ${expr}`)
  }
  close() { this.ws.close() }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// React-controlled inputs need the native setter, then an input event.
const setReactValue = (sel: string, value: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return 'missing:' + ${JSON.stringify(sel)};
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`

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

  await s.goto(`${STUDIO}/assistant`)
  const txt = await s.eval<string>(`document.body.innerText`)
  check('admin route unlocks for the signed-in admin', /\/admin\/assistant\/chat/.test(txt))
}

const tab = await newTab('about:blank')
const s = new Session(tab)
await s.open()
try {
  await testChat(s)
  await testLogin(s)
} finally {
  s.close()
  await fetch(`${CDP_HTTP}/json/close/${tab.id}`)
}
console.log(`\n${failures.length === 0 ? 'ALL PASS' : 'FAILURES: ' + failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
