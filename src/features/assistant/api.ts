/**
 * Endpoint bindings for the assistant chat.
 *
 * Two routes, one transport: `postAssistantChat` picks
 * `POST /assistant/chat` (public — works with **no key**, `rbac.PUBLIC_ROUTES`)
 * or `POST /admin/assistant/chat` (strict admin role + `agent:run` scope) from
 * the caller's mode. Chat is a mutation: it runs on demand, never on mount.
 */

import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  ChatResponseSchema,
  parseOrThrow,
  type ChatResponse,
  type ProviderSelection,
} from '../../lib/schemas'

/** Public mode is anonymous-safe; admin mode needs an admin key. */
export type AssistantMode = 'public' | 'admin'

export const ASSISTANT_TIMEOUT_MS = 60_000

export function assistantChatPath(mode: AssistantMode): string {
  return endpointPath(mode === 'admin' ? 'assistant.chat.admin' : 'assistant.chat.public')
}

/**
 * Body builder — `provider` / `model` are an **optional** per-request override
 * (Phase B): absent when nothing was chosen, so the server keeps its own
 * default resolution, and echoed back by the server as `requested_provider` /
 * `requested_model`.
 */
export function assistantChatBody(
  message: string,
  selection?: ProviderSelection,
): Record<string, unknown> {
  const body: Record<string, unknown> = { message }
  if (selection?.provider) body.provider = selection.provider
  if (selection?.model) body.model = selection.model
  return body
}

export async function postAssistantChat(
  message: string,
  mode: AssistantMode = 'public',
  selection?: ProviderSelection,
): Promise<ChatResponse> {
  return parseOrThrow(
    ChatResponseSchema,
    await apiPost<unknown>(
      assistantChatPath(mode),
      assistantChatBody(message, selection),
      { timeoutMs: ASSISTANT_TIMEOUT_MS },
    ),
    'assistant chat',
  )
}

export function useAssistantChat() {
  return useMutation({
    mutationFn: ({
      message,
      mode = 'public',
      selection,
    }: {
      message: string
      mode?: AssistantMode
      selection?: ProviderSelection
    }): Promise<ChatResponse> => postAssistantChat(message, mode, selection),
  })
}
