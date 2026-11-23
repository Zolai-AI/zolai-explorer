/**
 * Role requests — ask for a role you do not hold, and decide the asks others made.
 *
 * **The page states the server's rules; it does not hold them.** Every branch
 * below is a reading of `zolai-core/zolai/api/role_requests_router.py` and the
 * guarded writer in `session_auth.py`, encoded once in `requestActions.ts`:
 *
 * - asking needs a **person** — `_MEMBER_GUARD` plus `_person()`. An API key or
 *   an MCP OAuth token has a role and no account behind it, so both get 403
 *   `session_required` and the read of `/mine` is withheld rather than fired and
 *   refused;
 * - the ladder is `anonymous < member < admin < superadmin`. A rank at or above
 *   the asked role is 409 `role_already_held`, so the select only ever offers
 *   what sits *above* the caller's own rank;
 * - approval is not a status update: it calls `set_user_role`, which runs its
 *   caller/self/last-superadmin guards first and, on success, drops the whole
 *   session cache so the new rank is live on the applicant's next request;
 * - the status flips **after** that writer returns, so a refusal leaves the row
 *   `pending`. The dialog therefore re-reads the queue on failure (`api.ts`)
 *   and quotes the server's sentence instead of classifying the guard itself —
 *   `ApiError` carries a status and prose, not the machine token.
 *
 * The queue section is *inside* a page whose route minimum is `member`, on
 * purpose: the ask must be reachable by exactly the people who need it, so the
 * privilege that reads the queue gates a section (as `/orchestra` does) instead
 * of gating the whole route and hiding the ask behind a wall nobody can pass.
 */

import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Clock, Info, KeyRound, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState, failureDetail } from '../components/ErrorState'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { TruncatedValue } from '../components/TruncatedValue'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '../components/ui/field'
import { Textarea } from '../components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { roleBadge, useAuthMe, type Role } from '../lib/auth'
import { formatCount, formatTimestamp } from '../lib/format'
import { pathOf, signInPath } from '../lib/routes'
import type { RequestableRole, RoleRequest } from '../lib/schemas'
import {
  useCreateRoleRequest,
  useDecideRoleRequest,
  useMyRoleRequests,
  useRoleRequestQueue,
} from '../features/role-requests/api'
import {
  DEFAULT_STATUS_FILTER,
  REASON_MAX,
  askEligibility,
  askErrors,
  canDecide,
  decisionErrors,
  statusBadge,
  statusFilterFromSearch,
  statusSearch,
  type AskEligibility,
  type StatusFilter,
} from '../features/role-requests/requestActions'

/** Preview cap for an applicant's reason — prose, so roomier than a JSON cell. */
const REASON_PREVIEW = 240

/** The four filters the queue offers, in the order a decider reads them. */
const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'Every ask' },
]

const BADGE_VARIANT: Record<ReturnType<typeof statusBadge>['tone'], 'secondary' | 'default' | 'destructive'> = {
  waiting: 'secondary',
  granted: 'default',
  declined: 'destructive',
}

export function Requests() {
  // The server's answer to "who am I", never the stored key: this page decides
  // what to offer from `role` **and** `auth_source`, because two credentials with
  // the same role get different answers from `/role-requests`.
  const me = useAuthMe()
  const eligibility = askEligibility({ role: me.role, authSource: me.auth_source })
  const isSession = me.auth_source === 'session'
  const decides = canDecide(me.role)

  /**
   * The queue filter lives in the URL, not in state — `?status=approved` opens
   * that view on a paste or a reload, through the same pure codec the rest of the
   * app uses (`replace`, so filtering is one page being re-read, not a history of
   * clicks).
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const status = statusFilterFromSearch(searchParams.toString())
  const setStatus = (next: StatusFilter) =>
    setSearchParams(new URLSearchParams(statusSearch(next)), { replace: true })

  const mine = useMyRoleRequests(isSession)
  const queue = useRoleRequestQueue(status, decides)
  const [decisionFor, setDecisionFor] = useState<RoleRequest | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Requests"
        icon={<ShieldCheck className="size-5" aria-hidden />}
        description="Ask for a role your account does not hold, and — for a superadmin — decide the asks other accounts have made."
        meta="A role is granted by a person, never by a form: this page records the ask, and a superadmin applies it through the one guarded role writer."
      />

      {/* The one thing a visitor is most likely to have gotten wrong: that
          contributing is gated. It is not, and saying so here keeps "request a
          role" from reading as the price of submitting a word. */}
      <Notice tone="info" icon={<Info className="size-4" aria-hidden />} title="Contributing needs no role">
        Anyone can submit a word, a gloss fix, or a usage note from{' '}
        <Link to={pathOf('contribute')} className="underline underline-offset-2">
          Contribute
        </Link>{' '}
        — no account, no approval, no waiting. A role changes what the API lets your *account*
        read and write. Asking here is for that, not for contributing.
      </Notice>

      <AskCard role={me.role} eligibility={eligibility} />

      {isSession ? <MyAsksCard query={mine} /> : null}

      {decides ? (
        <QueueCard
          query={queue}
          status={status}
          onStatus={setStatus}
          onDecide={setDecisionFor}
        />
      ) : null}

      {/* `key` on the row: a fresh dialog per ask starts with an empty note, so a
          note typed for one applicant can never travel to another. */}
      <DecisionDialog
        key={decisionFor?.id ?? 'closed'}
        request={decisionFor}
        onClose={() => setDecisionFor(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ the ask */

function AskCard({ role, eligibility }: { role: Role; eligibility: AskEligibility }) {
  if (!eligibility.canAsk) {
    // Nothing above the caller's rank is a *good* reason, not a failure — it is
    // said plainly. A credential with no account behind it needs the sign-in
    // route, so that one gets the link.
    if (eligibility.kind === 'top-of-ladder') {
      return (
        <Card title="Ask for a role" subtitle="POST /role-requests">
          <Notice tone="info" title="Nothing left to ask for">
            {eligibility.reason}
          </Notice>
        </Card>
      )
    }
    return (
      <Card title="Ask for a role" subtitle="POST /role-requests · needs a password sign-in">
        <Empty title="This credential cannot ask" hint={eligibility.reason}>
          <Button asChild className="mt-2 h-10">
            <Link to={signInPath(pathOf('requests'))}>
              <KeyRound aria-hidden />
              Sign in with the account…
            </Link>
          </Button>
        </Empty>
      </Card>
    )
  }

  return (
    <Card title="Ask for a role" subtitle="POST /role-requests · 5 asks per minute per account">
      <AskForm role={role} roles={eligibility.roles} />
    </Card>
  )
}

function AskForm({ role, roles }: { role: Role; roles: RequestableRole[] }) {
  const create = useCreateRoleRequest()
  const [requestedRole, setRequestedRole] = useState<RequestableRole>(roles[0])
  const [reason, setReason] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const errors = askErrors({ requestedRole, reason, role })
  const invalid = Object.keys(errors).length > 0
  const trimmed = reason.trim()
  const badge = roleBadge(requestedRole)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    // Blocked here, not caught on the server: `/role-requests` counts five asks
    // per minute per account, so an empty submit spends the applicant's budget on
    // a request that was never going to be recorded.
    if (invalid) return
    create.mutate(
      { requested_role: requestedRole, reason: trimmed },
      {
        onSuccess: (receipt) => {
          setReason('')
          setShowErrors(false)
          // The server's own sentence, which names the queue it went to.
          toast.success(receipt.message)
        },
        onError: (error) => toast.error(failureDetail(error)),
      },
    )
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor="ask-role">Role you are asking for</FieldLabel>
        {/* Only the ranks *above* the caller's own — `askEligibility` derived the
            list from the server's answer, so the form cannot offer a 409. */}
        <Select
          value={requestedRole}
          onValueChange={(value) => setRequestedRole(value as RequestableRole)}
        >
          <SelectTrigger id="ask-role" className="h-10 w-full sm:w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((value) => (
              <SelectItem key={value} value={value}>
                {roleBadge(value).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{badge.hint}</FieldDescription>
        {showErrors && errors.requested_role ? (
          <FieldError>{errors.requested_role}</FieldError>
        ) : null}
      </Field>

      <Field data-invalid={showErrors && errors.reason ? 'true' : undefined}>
        <FieldLabel htmlFor="ask-reason">
          Why do you need it? <span className="text-destructive">*</span>
        </FieldLabel>
        <Textarea
          id="ask-reason"
          rows={4}
          className="min-h-[96px]"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setShowErrors(true)}
          aria-invalid={showErrors && errors.reason ? true : undefined}
          aria-describedby={showErrors && errors.reason ? 'ask-reason-error' : 'ask-reason-help'}
          placeholder="What you will do with it, and for how long — a superadmin reads this before deciding."
        />
        {showErrors && errors.reason ? (
          <FieldError id="ask-reason-error">{errors.reason}</FieldError>
        ) : (
          <FieldDescription id="ask-reason-help">
            {trimmed.length}/{REASON_MAX} characters. Stored verbatim and shown to the decider;
            it is required, not advisory.
          </FieldDescription>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="max-lg:h-10" disabled={create.isPending || (showErrors && invalid)}>
          <Check aria-hidden />
          {create.isPending ? 'Sending…' : 'Send the ask'}
        </Button>
        {/* Not a disabled button with no explanation: the reason the control is
            off is the sentence a screen reader should have heard already. */}
        <p className="text-xs text-muted-foreground">
          A superadmin decides. Nothing changes until they do.
        </p>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ the rows */

function StatusBadge({ status }: { status: RoleRequest['status'] }) {
  const badge = statusBadge(status)
  return <Badge variant={BADGE_VARIANT[badge.tone]}>{badge.label}</Badge>
}

/** One ask, read or decidable, in both lists. */
function AskRow({
  request,
  showApplicant,
  onDecide,
}: {
  request: RoleRequest
  /** The queue names whose ask it is; `/mine` does not need to. */
  showApplicant?: boolean
  onDecide?: (request: RoleRequest) => void
}) {
  const decided = request.status !== 'pending'
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {showApplicant ? (
          <span className="font-medium">{request.username}</span>
        ) : null}
        {/* The role is printed as the row holds it. `requested_role` is verbatim
            server text that this client is not allowed to re-derive — dressing an
            unrecognised word up as a known rank is how a queue starts lying about
            what someone asked for. */}
        <Badge variant="outline">asking {request.requested_role}</Badge>
        <StatusBadge status={request.status} />
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
          {formatTimestamp(request.created_at)}
        </span>
      </div>

      <p className="max-w-prose text-sm break-words whitespace-pre-wrap text-card-foreground">
        <TruncatedValue text={request.reason} limit={REASON_PREVIEW} />
      </p>

      {decided ? (
        <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <p>
            {request.status === 'approved' ? 'Granted' : 'Rejected'}{' '}
            {formatTimestamp(request.decided_at)}
            {request.decided_by ? ` by ${request.decided_by}` : ''}.
          </p>
          {/* An approval may be silent — the role is the answer — so there is
              often nothing to show here, and that is stated rather than hidden. */}
          {request.note ? (
            <p className="max-w-prose break-words whitespace-pre-wrap">
              <span className="font-medium">Note:</span> {request.note}
            </p>
          ) : (
            request.status === 'approved' && <p>No note was left with the decision.</p>
          )}
        </div>
      ) : onDecide ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-2">
          <Button size="sm" className="max-lg:h-10" onClick={() => onDecide(request)}>
            <ShieldCheck aria-hidden />
            Decide
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            waiting since {formatTimestamp(request.created_at)}
          </span>
        </div>
      ) : null}
    </li>
  )
}

function MyAsksCard({ query }: { query: ReturnType<typeof useMyRoleRequests> }) {
  const items = query.data?.items ?? []
  return (
    <Card
      title="Your asks"
      subtitle={`GET /role-requests/mine · ${formatCount(items.length)} shown`}
      bodyClassName="flex flex-col gap-3"
    >
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <span className="sr-only">Loading your asks…</span>
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} compact onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="You have not asked for a role"
          hint="Asks you send appear here with whatever a superadmin decided, including the note they left if they rejected it."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((request) => (
            <AskRow key={request.id} request={request} />
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- the queue */

function QueueCard({
  query,
  status,
  onStatus,
  onDecide,
}: {
  query: ReturnType<typeof useRoleRequestQueue>
  status: StatusFilter
  onStatus: (next: StatusFilter) => void
  onDecide: (request: RoleRequest) => void
}) {
  const items = query.data?.items ?? []
  const label = STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Pending'

  return (
    <Card
      title="Decision queue"
      subtitle={`GET /role-requests · role:manage + superadmin · ${formatCount(items.length)} ${
        status === 'all' ? 'asks' : `${label.toLowerCase()} asks`
      } fetched`}
      bodyClassName="flex flex-col gap-3"
      actions={
        <Select value={status} onValueChange={(value) => onStatus(value as StatusFilter)}>
          <SelectTrigger
            className="h-10 w-[172px]"
            aria-label="Filter the queue by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <span className="sr-only">Loading the queue…</span>
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} compact onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title={status === 'pending' ? 'Nothing is waiting' : `No ${status} asks`}
          hint={
            status === DEFAULT_STATUS_FILTER
              ? 'New asks land here the moment they are sent. An account can ask once per role while a previous ask for it is still pending.'
              : 'The filter above goes back to Pending, where the work is.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((request) => (
            <AskRow key={request.id} request={request} showApplicant onDecide={onDecide} />
          ))}
        </ul>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- the decide */

function DecisionDialog({ request, onClose }: { request: RoleRequest | null; onClose: () => void }) {
  const decide = useDecideRoleRequest()
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve')
  const [note, setNote] = useState('')
  if (!request) return null

  const errors = decisionErrors({ decision, note })
  const label = request.requested_role

  const submit = () => {
    if (Object.keys(errors).length > 0) return
    decide.mutate(
      { requestId: request.id, decision, note },
      {
        onSuccess: (result) => {
          toast.success(result.message)
          onClose()
        },
        // The server's sentence names the guard that refused; the queue has
        // already been re-read by `onError`, so the row is shown as the server
        // has it — a refused approve is still Pending, and the panel says so.
        onError: (error) => toast.error(failureDetail(error)),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {decision === 'approve' ? 'Grant' : 'Reject'} the ask —{' '}
            <span className="font-mono">{request.username}</span>
          </DialogTitle>
          <DialogDescription>
            {decision === 'approve' ? (
              <>
                <span className="font-medium">{request.username}</span> becomes{' '}
                <span className="font-medium">{label}</span> through the one guarded role writer.
                The server then drops its session cache, so the new rank applies on their next
                request rather than at TTL expiry — and if that writer refuses (their own account,
                or the last enabled superadmin), the ask stays <span className="font-medium">Pending</span>.
              </>
            ) : (
              <>
                Nothing about the account changes. The ask is recorded as{' '}
                <span className="font-medium">Rejected</span> with your note, which{' '}
                <span className="font-medium">{request.username}</span> reads on this page.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Their reason
            </p>
            <p className="mt-1 max-w-prose text-sm break-words whitespace-pre-wrap">
              {request.reason}
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="decision-choice">Decision</FieldLabel>
            <Select
              value={decision}
              onValueChange={(value) => setDecision(value as 'approve' | 'reject')}
            >
              <SelectTrigger id="decision-choice" className="h-10 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={errors.note ? 'true' : undefined}>
            <FieldLabel htmlFor="decision-note">
              Note {decision === 'reject' ? <span className="text-destructive">*</span> : '(optional)'}
            </FieldLabel>
            <Textarea
              id="decision-note"
              rows={3}
              className="min-h-[80px]"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? 'decision-note-error' : 'decision-note-help'}
              placeholder={
                decision === 'reject'
                  ? 'Why it is declined — they read this and decide whether to ask again.'
                  : 'Anything they should know about the grant.'
              }
            />
            {errors.note ? (
              <FieldError id="decision-note-error">{errors.note}</FieldError>
            ) : (
              <FieldDescription id="decision-note-help">
                {decision === 'reject'
                  ? 'Required. A rejection with no reason is not an answer the applicant can act on.'
                  : 'An approval may be silent — the role itself is the answer.'}
              </FieldDescription>
            )}
          </Field>

          {/* The refusal, in the server's own words. There is no retry button: the
              queue has already been re-read underneath, and a second attempt at a
              guarded write meets the same guard. */}
          {decide.isError ? <ErrorState error={decide.error} compact /> : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="max-lg:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="max-lg:h-10"
              variant={decision === 'reject' ? 'outline' : 'default'}
              disabled={decide.isPending || Object.keys(errors).length > 0}
            >
              {decision === 'reject' ? <X aria-hidden /> : <Check aria-hidden />}
              {decide.isPending ? 'Sending…' : decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
