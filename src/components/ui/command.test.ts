import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('command.ui source guard (regression)', () => {
  const srcPath = resolve(__dirname, 'command.tsx')
  const source = readFileSync(srcPath, 'utf8')

  it('CommandDialog wraps children in <Command> inside DialogContent', () => {
    // Ensure CommandDialog's DialogContent contains a <Command ...> that renders {children}
    const re = /<Command[^>]*>\s*\{children\}\s*<\/Command>/
    expect(source).toMatch(re)
  })

  it('DialogTitle and DialogDescription appear within DialogContent (header not between Dialog and DialogContent)', () => {
    // Header (DialogTitle/DialogDescription) must be inside DialogContent, not between Dialog and DialogContent
    expect(source).toMatch(/<DialogContent[^>]*>[\s\S]*<DialogHeader[\s\S]*<DialogTitle/)
    expect(source).toMatch(/<DialogContent[^>]*>[\s\S]*<DialogDescription/)
    // Negative-like check: no DialogHeader immediately after <Dialog> and before <DialogContent>
    expect(source).not.toMatch(/<Dialog[^>]*>\s*<DialogHeader[\s\S]*<DialogContent/)
  })
})
