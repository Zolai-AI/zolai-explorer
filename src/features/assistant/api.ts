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
import { ChatResponseSchema, parseOrThrow, type ChatResponse } from '../../lib/schemas'

/** Public mode is anonymous-safe; admin mode needs an admin key. */
export type AssistantMode = 'public' | 'admin'

export const ASSISTANT_TIMEOUT_MS = 60_000

export function assistantChatPath(mode: AssistantMode): string {
  return endpointPath(mode === 'admin' ? 'assistant.chat.admin' : 'assistant.chat.public')
}

export async function postAssistantChat(
  message: string,
  mode: AssistantMode = 'public',
): Promise<ChatResponse> {
  return parseOrThrow(
    ChatResponseSchema,
    await apiPost<unknown>(
      assistantChatPath(mode),
      { message },
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
    }: {
      message: string
      mode?: AssistantMode
    }): Promise<ChatResponse> => postAssistantChat(message, mode),
  })
}
