/**
 * Public contribution form.
 *
 * **The field set comes from the server, not from this page.**
 * `POST /contributions` accepts exactly eight columns — `type`, `word`,
 * `field`, `current_value`, `suggested_value`, `context`, `source`, `email` —
 * and `zolai-core/zolai/api/contributions_router.py` marks `word` and
 * `suggested_value` required for **every** type.
 *
 * This form used to render its own invented inputs (`zolai`, `english`,
 * `myanmar`, `pos`, `morphology`, `grammar_note`, `free_text` …) and then sent
 * only the eight real columns, so nothing the visitor typed was ever
 * transmitted, and the two required columns had no input bound to them — every
 * submission failed on "Please enter the word" before a request was made. A
 * contribution type is therefore a *description of those eight columns*, not a
 * list of extra fields: `field` names the column being proposed, and the label
 * on the proposal input says what is being proposed.
 *
 * Validation is inline (`FieldError`) rather than a toast, so a failure is
 * attached to the input it belongs to and announced to a screen reader.
 */

import { useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, FileText, Info, Send } from 'lucide-react'
import { toast } from 'sonner'
import { apiPost, isApiError } from '../lib/api'
import { endpointPath } from '../lib/endpoints'
import { Card } from '../components/Card'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

type ContributionType = 'new_word' | 'improve_meaning' | 'add_usage' | 'fix_typo' | 'add_grammar' | 'other'

/** Exactly the columns `ContributionIn` accepts — nothing else is transmitted. */
type FormState = {
  word: string
  field: string
  current_value: string
  suggested_value: string
  context: string
  source: string
  email: string
}

interface ContributionResponse {
  id: number
  status: string
  message: string
}

type Errors = Partial<Record<keyof FormState, string>>

/**
 * One record per contribution type, describing how the eight columns are filled.
 *
 * - `field` is the value sent as the `field` column — the specific column the
 *   proposal targets, so the editorial queue can group by it. It is derived from
 *   the chosen type, never typed into a box, so a visitor cannot claim a
 *   proposal edits a column it does not.
 * - `proposal` / `proposalPlaceholder` label the `suggested_value` input: "the
 *   proposed English meaning" and "the proposed replacement sentence" are
 *   different asks, and one generic label misdescribes five of them.
 * - `needsCurrentValue` adds the `current_value` input, which only a correction
 *   can honestly state.
 */
const CONTRIBUTION_TYPES: {
  value: ContributionType
  label: string
  description: string
  field: string
  proposal: string
  proposalPlaceholder: string
  needsCurrentValue: boolean
  wordLabel: string
  wordPrompt: string
  wordPlaceholder: string
}[] = [
  {
    value: 'new_word',
    label: 'New word',
    description: 'Propose a word that is not in the dictionary yet',
    field: 'new_entry',
    proposal: 'Proposed entry',
    proposalPlaceholder: 'The headword with its meaning, e.g. "ganafa — great, magnificent"',
    needsCurrentValue: false,
    wordLabel: 'Word to add',
    wordPrompt: 'The new headword, spelled per ZVS 2018.',
    wordPlaceholder: 'e.g. ganafa',
  },
  {
    value: 'improve_meaning',
    label: 'Improve a meaning',
    description: 'Correct or sharpen the English meaning of an existing word',
    field: 'english',
    proposal: 'Corrected English meaning',
    proposalPlaceholder: 'e.g. God, Creator',
    needsCurrentValue: false,
    wordLabel: 'Zolai word',
    wordPrompt: 'The existing headword whose meaning you are correcting.',
    wordPlaceholder: 'e.g. pasian',
  },
  {
    value: 'add_usage',
    label: 'Add a usage example',
    description: 'Give a Zolai sentence and its English translation',
    field: 'usage_example',
    proposal: 'Example with translation',
    proposalPlaceholder: 'The Zolai sentence, then the English on a new line.',
    needsCurrentValue: false,
    wordLabel: 'Zolai word',
    wordPrompt: 'The word the example demonstrates.',
    wordPlaceholder: 'e.g. pasian',
  },
  {
    value: 'fix_typo',
    label: 'Fix a typo',
    description: 'Report a spelling error in the Zolai or English column',
    field: 'spelling',
    proposal: 'Suggested correction',
    proposalPlaceholder: 'What the text should say instead.',
    needsCurrentValue: true,
    wordLabel: 'Zolai word',
    wordPrompt: 'The word whose spelling is wrong.',
    wordPlaceholder: 'e.g. pasian',
  },
  {
    value: 'add_grammar',
    label: 'Add a grammar note',
    description: 'Record POS, morphology or syntax information',
    field: 'grammar_note',
    proposal: 'Grammar note',
    proposalPlaceholder: 'Part of speech, morphology, or the syntax rule this word follows.',
    needsCurrentValue: false,
    wordLabel: 'Zolai word',
    wordPrompt: 'The word the note is about.',
    wordPlaceholder: 'e.g. piangsak',
  },
  {
    value: 'other',
    label: 'Something else',
    description: 'Any other correction or addition',
    field: 'other',
    proposal: 'Details',
    proposalPlaceholder: 'Describe the change you are proposing.',
    needsCurrentValue: false,
    wordLabel: 'Subject or word',
    wordPrompt: 'What the change is about — the server requires a subject for every type.',
    wordPlaceholder: 'e.g. the grammar pattern page',
  },
]

const EMPTY: FormState = {
  word: '',
  field: CONTRIBUTION_TYPES[0].field,
  current_value: '',
  suggested_value: '',
  context: '',
  source: '',
  email: '',
}

function typeOf(value: ContributionType) {
  return CONTRIBUTION_TYPES.find((entry) => entry.value === value) ?? CONTRIBUTION_TYPES[0]
}

/**
 * Pure validation, so it is unit-testable and so the reason the rules exist is
 * in one place: `word` and `suggested_value` are required on **every** type
 * server-side (`min_length=1`), so a form that skipped them would only earn a
 * 422.
 */
export function validateContribution(state: FormState, type: ContributionType): Errors {
  const errors: Errors = {}
  if (state.word.trim() === '') errors.word = `Enter ${typeOf(type).wordLabel.toLowerCase()}.`
  if (state.suggested_value.trim() === '') errors.suggested_value = 'Enter what you are proposing.'
  if (state.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) {
    errors.email = 'That does not look like an email address.'
  }
  return errors
}

export function Contribute() {
  const [type, setType] = useState<ContributionType>('new_word')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; id?: number } | null>(null)

  const spec = typeOf(type)

  const changeType = (next: ContributionType) => {
    setType(next)
    setErrors({})
    setResult(null)
    // The previous type owned `field` and possibly `current_value`; leaving them
    // behind would submit one type's payload under another type's label.
    setForm((previous) => ({ ...previous, field: typeOf(next).field, current_value: '' }))
  }

  const set = (key: keyof FormState) => (value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }))
    // Clear this field's error as soon as the visitor starts fixing it.
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validateContribution(form, type)
    setErrors(found)
    const first = Object.values(found)[0]
    if (first) {
      toast.error('Check the highlighted fields', { description: first })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await apiPost<ContributionResponse>(endpointPath('contributions.create'), {
        type,
        word: form.word.trim(),
        field: spec.field,
        current_value: form.current_value.trim(),
        suggested_value: form.suggested_value.trim(),
        context: form.context.trim(),
        source: form.source.trim(),
        email: form.email.trim(),
      })
      setResult({ success: true, message: response.message, id: response.id })
      toast.success('Contribution submitted', { description: `Reference ${response.id}` })
      setForm({ ...EMPTY, field: spec.field })
      setErrors({})
    } catch (error: unknown) {
      const message = isApiError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Submission failed. Please try again.'
      setResult({ success: false, message })
      toast.error('Submission failed', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FileText className="size-5 text-primary" aria-hidden />
          Contribute to the dictionary
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Help improve the Tedim Zolai (ZVS 2018) dictionary. Submissions go to the editorial review
          queue before publication. No account required.
        </p>
      </header>

      {result && (
        <Alert variant={result.success ? 'default' : 'destructive'}>
          {result.success ? <CheckCircle2 aria-hidden /> : <AlertCircle aria-hidden />}
          <AlertTitle>{result.success ? 'Received' : 'Not submitted'}</AlertTitle>
          <AlertDescription>
            {result.message}
            {result.id !== undefined && <span className="ml-1 font-mono text-xs">Ref: {result.id}</span>}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <Field>
            <FieldLabel htmlFor="contrib-type">
              Contribution type <span className="text-destructive">*</span>
            </FieldLabel>
            <Select value={type} onValueChange={(value) => changeType(value as ContributionType)}>
              <SelectTrigger id="contrib-type" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              {/* `position="popper"` gives the panel the trigger's width and a real
                  min-width, so the two-line items (label + description) are not
                  squeezed. `max-h-[22rem]` is the Radix scroll container — six items
                  fit on a laptop, and a short viewport scrolls instead of clipping. */}
              <SelectContent
                position="popper"
                align="start"
                className="max-h-[22rem] w-[var(--radix-select-trigger-width)] min-w-[20rem]"
              >
                {CONTRIBUTION_TYPES.map((entry) => (
                  <SelectItem
                    key={entry.value}
                    value={entry.value}
                    className="items-start py-2 pr-9 pl-2.5"
                  >
                    <span className="flex flex-col gap-0.5 text-left">
                      <span className="font-medium leading-tight">{entry.label}</span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {entry.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Sets which column the proposal targets — sent as{' '}
              <code className="font-mono">{spec.field}</code>.
            </FieldDescription>
          </Field>

          <Field data-invalid={errors.word ? 'true' : undefined}>
            <FieldLabel htmlFor="contrib-word">
              {spec.wordLabel} <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="contrib-word"
              value={form.word}
              onChange={(event) => set('word')(event.target.value)}
              placeholder={spec.wordPlaceholder}
              aria-invalid={errors.word ? true : undefined}
              aria-describedby={errors.word ? 'contrib-word-error' : 'contrib-word-hint'}
              autoComplete="off"
              spellCheck={false}
              className="h-10"
            />
            {errors.word ? (
              <FieldError id="contrib-word-error">{errors.word}</FieldError>
            ) : (
              <FieldDescription id="contrib-word-hint">{spec.wordPrompt}</FieldDescription>
            )}
          </Field>

          {spec.needsCurrentValue && (
            <Field>
              <FieldLabel htmlFor="contrib-current">Current (incorrect) value</FieldLabel>
              <Textarea
                id="contrib-current"
                value={form.current_value}
                onChange={(event) => set('current_value')(event.target.value)}
                placeholder="What is on the entry today?"
                rows={2}
                className="min-h-[60px]"
              />
              <FieldDescription>
                Shown next to your correction so a reviewer can see what changed.
              </FieldDescription>
            </Field>
          )}

          <Field data-invalid={errors.suggested_value ? 'true' : undefined}>
            <FieldLabel htmlFor="contrib-suggested">
              {spec.proposal} <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="contrib-suggested"
              value={form.suggested_value}
              onChange={(event) => set('suggested_value')(event.target.value)}
              placeholder={spec.proposalPlaceholder}
              aria-invalid={errors.suggested_value ? true : undefined}
              aria-describedby={errors.suggested_value ? 'contrib-suggested-error' : 'contrib-suggested-hint'}
              rows={3}
              className="min-h-[88px]"
            />
            {errors.suggested_value ? (
              <FieldError id="contrib-suggested-error">{errors.suggested_value}</FieldError>
            ) : (
              <FieldDescription id="contrib-suggested-hint">
                This is the text an editor reads before anything reaches the dictionary.
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="contrib-context">Context / notes</FieldLabel>
            <Textarea
              id="contrib-context"
              value={form.context}
              onChange={(event) => set('context')(event.target.value)}
              placeholder="Where did you see this? Anything that supports the change?"
              rows={2}
              className="min-h-[60px]"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="contrib-source">Source</FieldLabel>
            <Input
              id="contrib-source"
              value={form.source}
              onChange={(event) => set('source')(event.target.value)}
              placeholder="Bible verse, book, a speaker, or a website"
              className="h-10"
            />
          </Field>

          <Field data-invalid={errors.email ? 'true' : undefined}>
            <FieldLabel htmlFor="contrib-email">Your email (optional)</FieldLabel>
            <Input
              id="contrib-email"
              type="email"
              value={form.email}
              onChange={(event) => set('email')(event.target.value)}
              placeholder="Only used if an editor needs to ask you something"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'contrib-email-error' : undefined}
              autoComplete="email"
              className="h-10"
            />
            {errors.email && <FieldError id="contrib-email-error">{errors.email}</FieldError>}
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting} className="h-10">
              <Send aria-hidden />
              {isSubmitting ? 'Submitting…' : 'Submit contribution'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Submitted text may be edited and published under ZVS 2018.
            </p>
          </div>
        </form>
      </Card>

      <Card tone="muted">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="space-y-2 text-sm">
            <p>
              <strong>ZVS 2018 orthography:</strong> SOV word order, ergative{' '}
              <code className="bg-muted px-1">in</code>, <code className="bg-muted px-1">kei</code>{' '}
              negation in all persons.
            </p>
            <p>
              <strong>Preferred forms:</strong> <code className="bg-muted px-1">pasian</code> (God),{' '}
              <code className="bg-muted px-1">gam</code> (place),{' '}
              <code className="bg-muted px-1">topa</code> (Lord). Deprecated spellings such as{' '}
              <code className="bg-muted px-1">pathian</code>,{' '}
              <code className="bg-muted px-1">ram</code>, <code className="bg-muted px-1">fapa</code>{' '}
              are rejected by the 2018 standard.
            </p>
            <p>
              <strong>Review:</strong> submissions queue for an editor. Nothing here writes the
              dictionary directly.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
