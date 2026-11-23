/**
 * Contribution transports for the **signed-in visitor**.
 *
 * `GET /contributions/mine` is the read-back for the form on `/contribute`: the
 * columns are the server's fixed projection (`MINE_COLUMNS`) and contain no
 * `email`, so what an address was offered *for* never comes back to a browser
 * that only wants to know whether its suggestion is still queued.
 *
 * Whose contributions these are is what the credential proves — there is no
 * `user_id` parameter to pass and therefore nothing to put in a URL. The route
 * needs a person, same as `/role-requests/mine`: an API key gets 403
 * `session_required`, so the page withholds the read rather than rendering that
 * refusal where the honest sentence is "this key is not an account".
 */

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import { queryLimitPath } from '../../lib/endpoints'
import {
  MyContributionListSchema,
  parseOrThrow,
  type MyContributionList,
} from '../../lib/schemas'

/** Exported so a render test seats its payload under the key the hook reads. */
export const CONTRIBUTION_KEYS = {
  mine: (limit: number) => ['contributions', 'mine', limit] as const,
}

/** `/contributions/mine?limit=20` — `limit` is a query parameter, capped server-side. */
export function minePath(limit: number): string {
  return queryLimitPath('contributions.mine', {}, limit)
}

export function useMyContributions(enabled: boolean, limit = 20) {
  return useQuery({
    queryKey: CONTRIBUTION_KEYS.mine(limit),
    enabled,
    queryFn: async ({ signal }): Promise<MyContributionList> =>
      parseOrThrow(
        MyContributionListSchema,
        await apiGet<unknown>(minePath(limit), { signal }),
        'my contributions',
      ),
  })
}
