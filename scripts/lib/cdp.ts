/**
 * A very small Chrome DevTools Protocol client.
 *
 * Shared by the end-to-end and UI check scripts so both drive the browser the
 * same way. Deliberately dependency-free: Bun has a built-in WebSocket, and a
 * real browser catches what jsdom cannot (hydration, layout, viewport).
 */

export const CDP_HTTP = process.env.CDP_HTTP ?? 'http://127.0.0.1:9222'

export type Tab = { id: string; webSocketDebuggerUrl: string }

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Open a new tab, returning the handle CDP needs to attach to it. */
export async function newTab(url = 'about:blank'): Promise<Tab> {
  const response = await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(
      `could not open a tab (${response.status}). Is Chromium running with ` +
        `--remote-debugging-port=9222? Start it with:\n` +
        `  chromium --headless --no-sandbox --remote-debugging-port=9222 about:blank &`,
    )
  }
  return (await response.json()) as Tab
}

export async function closeTab(tab: Tab): Promise<void> {
  await fetch(`${CDP_HTTP}/json/close/${tab.id}`).catch(() => {})
}

/** A console error / uncaught exception observed on the page. */
export type PageError = { kind: 'console' | 'exception'; text: string }

export class Session {
  private ws!: WebSocket
  private nextId = 0
  private pending = new Map<number, (value: any) => void>()

  /** Errors seen since the last `clearErrors()`, in arrival order. */
  errors: PageError[] = []

  constructor(private tab: Tab) {}

  async open(): Promise<void> {
    this.ws = new WebSocket(this.tab.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve()
      this.ws.onerror = () => reject(new Error('CDP socket failed to open'))
    })

    this.ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)!(message)
        this.pending.delete(message.id)
        return
      }
      // Anything else is an event. Only failures are worth keeping: React logs
      // warnings we do not treat as UI defects, but a thrown error or a console
      // error means the page is not actually working.
      if (message.method === 'Runtime.exceptionThrown') {
        const d = message.params?.exceptionDetails
        const text = d?.exception?.description ?? d?.text ?? 'unknown exception'
        this.errors.push({ kind: 'exception', text: String(text).split('\n')[0] })
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const text = (message.params.args ?? [])
          .map((a: any) => a.value ?? a.description ?? a.type)
          .join(' ')
        this.errors.push({ kind: 'console', text: String(text).split('\n')[0] })
      }
    }

    await this.send('Page.enable')
    await this.send('Runtime.enable')
    // A headless tab is not the OS-focused window, so `document.hasFocus()` is
    // false until something asks otherwise; `Input.*` is then routed to
    // whichever tab the browser considers focused. `bringToFront` names this tab
    // and focus emulation makes the renderer treat it as focused — together they
    // are what makes a dispatched click land here rather than nowhere.
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await this.send('Page.bringToFront')
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.nextId
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve) => this.pending.set(id, resolve))
  }

  /** Evaluate an expression in the page and return its value. */
  async eval<T = unknown>(expression: string): Promise<T> {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.result?.exceptionDetails) {
      const d = response.result.exceptionDetails
      throw new Error(`page threw: ${d.exception?.description ?? d.text}`)
    }
    return response.result?.result?.value as T
  }

  /** Poll until the expression is truthy, or give up. */
  async waitFor(expression: string, timeoutMs = 25_000, everyMs = 400): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        if (await this.eval(`!!(${expression})`)) return true
      } catch {
        // A navigation can tear the context mid-poll; keep trying.
      }
      await sleep(everyMs)
    }
    return false
  }

  /** Navigate and wait until the app has actually rendered, not just loaded. */
  async goto(url: string, settleMs = 2_500): Promise<void> {
    this.clearErrors()
    await this.send('Page.navigate', { url })
    await this.waitFor('document.readyState === "complete"', 20_000)
    // React mounts after load; without this the DOM is the empty shell.
    await this.waitFor('document.querySelector("main")', 20_000)
    await sleep(settleMs)
  }

  /** Resize the emulated viewport (does not need a browser window resize). */
  async setViewport(width: number, height: number, scale = 2): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: width < 768,
    })
  }

  /**
   * Click an element the way a user does, and **verify that it landed**.
   *
   * A bare `element.click()` is not equivalent: a control that reacts to the
   * pointer sequence ignores a synthetic click, so a test written with it reports
   * a working button as dead. So the browser-level `Input.*` sequence is always
   * tried first. But that sequence is not dependable either — in this headless
   * Chrome it is sometimes accepted and then dropped, with no error and no DOM
   * event, which reports a working control as clicked while nothing happened.
   * The click is therefore confirmed against a listener in the page and, when
   * the browser dropped it, replayed as the same pointer sequence from inside
   * the page (which is what the Radix controls here listen for).
   *
   * The selector is resolved in the page, and a `text=` prefix may be passed
   * instead of a selector to target by visible text.
   */
  async click(target: string): Promise<boolean> {
    // Resolve the target the same way for measuring and for the fallback below:
    // a `text=` prefix matches visible text case-insensitively as a plain
    // substring (deliberately not a RegExp — building one inside this template
    // literal means two layers of slash-escaping, which silently produced a
    // pattern that matched nothing), otherwise it is a CSS selector.
    const pick = `(() => {
      const sel = ${JSON.stringify(target)};
      const needle = sel.startsWith('text=') ? sel.slice(5).toLowerCase() : '';
      return needle
        ? [...document.querySelectorAll('button, a[href], [role="button"], [role="switch"]')]
            .find(x => (x.innerText || x.textContent || '').toLowerCase().includes(needle)) ?? null
        : document.querySelector(sel);
    })()`

    const measure = (scroll: boolean) => `(() => {
      const el = ${pick};
      if (!el) return null;
      ${scroll ? `el.scrollIntoView({ block: 'center', inline: 'center' });` : ''}
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2, y: r.y + r.height / 2,
        inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      };
    })()`

    let box = await this.eval<{ x: number; y: number; inView: boolean } | null>(measure(false))
    if (!box) return false
    // Scroll only when the control is actually off screen, then **re-measure**.
    // The app shell's sidebar is `position: sticky`, so scrolling it moves the
    // element again after the first measurement — clicking the stale coordinates
    // landed on empty space and the handler never ran.
    if (!box.inView) {
      await this.eval(measure(true))
      await sleep(250)
      box = (await this.eval<typeof box>(measure(false))) ?? box
    }

    await this.send('Page.bringToFront')
    try {
      await this.waitFor('document.hasFocus()', 2_000)
    } catch {
      // Best-effort: dispatch anyway rather than hang the suite.
    }

    // Record whether the input actually reaches the page. In this headless
    // Chrome the `Input.*` sequence is sometimes accepted and then **dropped**:
    // `dispatchMouseEvent` returns an empty result with no error, the page
    // receives no event at all (traced: zero pointerdown/mouseup/click), and a
    // check on top of it reports a working control as clicked while nothing
    // happened. That is what made the sign-out assertions fail intermittently.
    await this.eval(`(() => {
      window.__zolaiClick = 0;
      document.addEventListener('click', () => { window.__zolaiClick++ }, { capture: true, once: true });
    })()`)

    // Move first, then press, then release, with the right `buttons` mask.
    // Press+release alone is accepted by CDP but produces no DOM click at all,
    // so positioning the pointer first gives Chrome a hover target to press on.
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: box.x, y: box.y, buttons: 0,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1,
    })
    await sleep(150)
    if (await this.eval<number>('window.__zolaiClick || 0')) return true

    // The browser-level input was dropped. Drive the same pointer sequence from
    // inside the page instead: pointerover → pointerdown → mousedown →
    // pointerup → mouseup → click. That is the sequence controls which react to
    // the pointer — the Radix primitives in this UI among them — actually listen
    // for; only Chrome's own input layer, the part that is failing, is skipped.
    console.log(`    [click] browser input was dropped; used the in-page pointer sequence for ${target}`)
    return await this.eval<boolean>(`(() => {
      const el = ${pick};
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const init = {
        bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
      };
      el.dispatchEvent(new PointerEvent('pointerover', { ...init, buttons: 0 }));
      el.dispatchEvent(new PointerEvent('pointerdown', init));
      el.dispatchEvent(new MouseEvent('mousedown', init));
      el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      el.click();
      return true;
    })()`)
  }

  async screenshot(): Promise<string> {
    const { result } = await this.send('Page.captureScreenshot', { format: 'png' })
    return result.data as string
  }

  clearErrors(): void {
    this.errors = []
  }

  close(): void {
    try {
      this.ws.close()
    } catch {
      // Already closed — nothing to do.
    }
  }
}

/** Type into a React-controlled input by driving the native value setter. */
export const setReactValue = (selector: string, value: string): string => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'missing:' + ${JSON.stringify(selector)};
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`
