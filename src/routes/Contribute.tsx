import { useState } from 'react'
import { FileText, Send, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { toast } from 'sonner'
import { apiPost } from '../lib/api'
import { endpointPath } from '../lib/endpoints'
import { Card } from '../components/Card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Field, FieldLabel } from '../components/ui/field'
type ContributionType = 'new_word' | 'improve_meaning' | 'add_usage' | 'fix_typo' | 'add_grammar' | 'other'

interface ContributionFormData {
  type: ContributionType
  word: string
  field: string
  current_value?: string
  suggested_value: string
  context?: string
  source?: string
  email?: string
}

interface ContributionResponse {
  id: number
  status: string
  message: string
}

const CONTRIBUTION_TYPES: { value: ContributionType; label: string; description: string; fields: string[] }[] = [
  {
    value: 'new_word',
    label: 'New Word',
    description: 'Add a completely new word to the dictionary',
    fields: ['zolai', 'english', 'pos', 'myanmar'],
  },
  {
    value: 'improve_meaning',
    label: 'Improve Meaning',
    description: 'Correct or enhance an existing word definition',
    fields: ['english', 'myanmar'],
  },
  {
    value: 'add_usage',
    label: 'Add Usage Example',
    description: 'Provide a sentence showing how the word is used',
    fields: ['zolai_sentence', 'english_sentence'],
  },
  {
    value: 'fix_typo',
    label: 'Fix Typo',
    description: 'Report a spelling error in Zolai or English',
    fields: ['current_value', 'suggested_value'],
  },
  {
    value: 'add_grammar',
    label: 'Add Grammar Note',
    description: 'Add morphology, POS, or syntax information',
    fields: ['pos', 'morphology', 'grammar_note'],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Any other contribution not covered above',
    fields: ['free_text'],
  },
]

const CONTRIBUTION_FIELDS: Record<string, { label: string; placeholder: string; type: 'text' | 'textarea' }> = {
  zolai: { label: 'Zolai Word', placeholder: 'e.g., pasian', type: 'text' },
  english: { label: 'English Meaning', placeholder: 'e.g., God, Creator', type: 'text' },
  pos: { label: 'Part of Speech', placeholder: 'e.g., noun, verb, adjective', type: 'text' },
  myanmar: { label: 'Myanmar Meaning', placeholder: 'e.g., ဘုရားသခင်', type: 'text' },
  zolai_sentence: { label: 'Zolai Sentence', placeholder: 'e.g., Pasian in a tuah.', type: 'text' },
  english_sentence: { label: 'English Translation', placeholder: 'e.g., God created it.', type: 'text' },
  current_value: { label: 'Current (Incorrect) Value', placeholder: 'What is currently wrong?', type: 'text' },
  suggested_value: { label: 'Suggested (Correct) Value', placeholder: 'What should it be?', type: 'text' },
  morphology: { label: 'Morphology', placeholder: 'e.g., root + suffix breakdown', type: 'textarea' },
  grammar_note: { label: 'Grammar Note', placeholder: 'Any grammatical information', type: 'textarea' },
  free_text: { label: 'Details', placeholder: 'Describe your contribution...', type: 'textarea' },
  context: { label: 'Context / Notes', placeholder: 'Where did you see this? Any additional context?', type: 'textarea' },
  source: { label: 'Source', placeholder: 'Bible verse, book, speaker, website, etc.', type: 'text' },
  email: { label: 'Your Email (optional)', placeholder: 'you@example.com — for follow-up', type: 'text' },
}

export function Contribute() {
  const [type, setType] = useState<ContributionType>('new_word')
  const [formData, setFormData] = useState<ContributionFormData>({
    type: 'new_word',
    word: '',
    field: '',
    suggested_value: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; id?: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.word.trim() && type !== 'other') {
      toast.error('Required', { description: 'Please enter the word.' })
      return
    }
    if (!formData.suggested_value.trim()) {
      toast.error('Required', { description: 'Please enter your suggested value.' })
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        type: formData.type,
        word: formData.word,
        field: formData.field,
        current_value: formData.current_value,
        suggested_value: formData.suggested_value,
        context: formData.context,
        source: formData.source,
        email: formData.email,
      }

      const response = await apiPost<ContributionResponse>(endpointPath('contributions.create'), payload)
      setSubmitResult({ success: true, message: 'Thank you! Your contribution has been submitted for review.', id: String(response.id) })
      // Reset form
      setFormData({ type: 'new_word', word: '', field: '', suggested_value: '' })
      setType('new_word')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Submission failed. Please try again.'
      setSubmitResult({ success: false, message })
      toast.error('Submission failed', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getFieldsForType = (t: ContributionType) => {
    const typeInfo = CONTRIBUTION_TYPES.find(x => x.value === t)
    if (!typeInfo) return []
    return typeInfo.fields.map(f => ({ ...CONTRIBUTION_FIELDS[f], key: f }))
  }

  const fields = getFieldsForType(type)

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FileText className="size-5 text-primary" aria-hidden />
          Contribute to the Dictionary
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Help improve the Tedim Zolai (ZVS 2018) dictionary. All submissions are reviewed by the
          editorial team before publication. No account required.
        </p>
      </header>

      {submitResult && (
        <Card tone={submitResult.success ? 'accent' : 'default'} className="border">
          <div className="flex items-center gap-2">
            {submitResult.success ? (
              <CheckCircle className="size-5 text-green-600" aria-hidden />
            ) : (
              <AlertCircle className="size-5 text-destructive" aria-hidden />
            )}
            <span className="text-sm">{submitResult.message}</span>
            {submitResult.id && <span className="text-xs text-muted-foreground ml-auto">Ref: {submitResult.id}</span>}
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type selector */}
          <Field>
            <FieldLabel>Contribution Type <span className="text-destructive">*</span></FieldLabel>
            <Select value={type} onValueChange={setType as (v: ContributionType) => void}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select contribution type…" />
              </SelectTrigger>
              <SelectContent>
                {CONTRIBUTION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Dynamic fields based on type */}
          {fields.length > 0 && (
            <div className="space-y-4">
              {fields.map(({ key, label, placeholder, type: inputType }) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`contrib-${key}`}>{label} <span className="text-destructive">*</span></FieldLabel>
                  {inputType === 'textarea' ? (
                    <Textarea
                      id={`contrib-${key}`}
                      value={formData[key as keyof ContributionFormData] as string || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      rows={3}
                      className="min-h-[80px]"
                    />
                  ) : (
                    <Input
                      id={`contrib-${key}`}
                      value={formData[key as keyof ContributionFormData] as string || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="h-10"
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

          {/* Common fields */}
          <Field>
            <FieldLabel htmlFor="contrib-context">Context / Notes</FieldLabel>
            <Textarea
              id="contrib-context"
              value={formData.context || ''}
              onChange={e => setFormData(prev => ({ ...prev, context: e.target.value }))}
              placeholder="Where did you see this? Any additional context?"
              rows={2}
              className="min-h-[60px]"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="contrib-source">Source</FieldLabel>
            <Input
              id="contrib-source"
              value={formData.source || ''}
              onChange={e => setFormData(prev => ({ ...prev, source: e.target.value }))}
              placeholder="Bible verse, book, speaker, website, etc."
              className="h-10"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="contrib-email">Your Email (optional)</FieldLabel>
            <Input
              id="contrib-email"
              type="email"
              value={formData.email || ''}
              onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="you@example.com — for follow-up if we have questions"
              className="h-10"
            />
          </Field>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting} className="max-lg:h-10">
              {isSubmitting ? 'Submitting…' : 'Submit Contribution'}
              <Send className="size-4 ml-2" aria-hidden />
            </Button>
            <span className="text-xs text-muted-foreground">
              By submitting, you agree your contribution may be edited and published under ZVS 2018.
            </span>
          </div>
        </form>
      </Card>

      {/* Info panel */}
      <Card tone="muted">
        <div className="flex gap-3">
          <Info className="size-5 text-primary shrink-0 mt-0.5" aria-hidden />
          <div className="space-y-2 text-sm">
            <p><strong>ZVS 2018 Orthography:</strong> SOV word order, ergative <code className="px-1 bg-muted">in</code>, <code className="px-1 bg-muted">kei</code> negation.</p>
            <p><strong>Preferred forms:</strong> <code className="px-1 bg-muted">pasian</code> (God), <code className="px-1 bg-muted">gam</code> (place), <code className="px-1 bg-muted">topa</code> (Lord). Avoid deprecated: <code className="px-1 bg-muted">pathian, ram, fapa, bawipa</code>.</p>
            <p><strong>Review process:</strong> Submissions are queued in the editorial review queue. You may be contacted via email if clarification is needed.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
