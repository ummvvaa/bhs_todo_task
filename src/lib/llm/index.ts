// Провайдер-независимый клиент LLM в формате OpenAI Chat Completions.
// Адрес, ключ и модель берутся из .env (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL).
// Сейчас провайдер — Groq (https://api.groq.com/openai/v1), совместимый с OpenAI.
// Переход на OpenAI = смена только этих трёх переменных, код не меняется.
//
// ВНИМАНИЕ: использовать ТОЛЬКО на сервере — ключ LLM_API_KEY не должен попасть в браузер.

export class LlmError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LlmError'
    this.status = status
  }
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const TIMEOUT_MS = 60_000

export type ChatOptions = {
  temperature?: number
  /** Попросить модель вернуть строго JSON (OpenAI-совместимый response_format). */
  json?: boolean
}

/**
 * Вызывает LLM через OpenAI-совместимый эндпоинт /chat/completions.
 * Бросает LlmError с понятным русским сообщением при любой проблеме
 * (нет настроек, таймаут, 401/403, лимит 429, не-JSON, пустой ответ).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL

  if (!baseUrl || !apiKey || !model) {
    throw new LlmError(
      'ИИ-отчёты не настроены: задайте LLM_BASE_URL, LLM_API_KEY и LLM_MODEL в .env.local',
    )
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new LlmError('Превышено время ожидания ответа LLM (60 с). Повторите позже.')
    }
    throw new LlmError('Не удалось связаться с LLM-сервисом. Проверьте LLM_BASE_URL и сеть.')
  }

  if (res.status === 429) {
    throw new LlmError(
      'Достигнут лимит запросов LLM (429). Подождите немного и повторите.',
      429,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new LlmError('LLM отклонил ключ доступа — проверьте LLM_API_KEY.', res.status)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new LlmError(`LLM вернул не-JSON ответ (HTTP ${res.status}).`, res.status)
  }

  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`
    throw new LlmError(`Ошибка LLM: ${msg}`, res.status)
  }

  const content = (data as {
    choices?: { message?: { content?: string } }[]
  })?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmError('LLM вернул пустой ответ.')
  }

  return content.trim()
}
