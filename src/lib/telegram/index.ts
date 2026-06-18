// Серверный модуль Telegram Bot API.
// ВНИМАНИЕ: использовать ТОЛЬКО на сервере — TELEGRAM_BOT_TOKEN не должен попасть в браузер.
//
// Односторонние уведомления: приложение шлёт сообщения сотрудникам, которые
// ранее привязали свой Telegram через /start <код> (см. /api/telegram/webhook).

import { randomBytes } from 'crypto'

const API_BASE = 'https://api.telegram.org'
const TIMEOUT_MS = 10_000

/** Inline-клавиатура Telegram (массив рядов кнопок). */
export type InlineKeyboard = { text: string; callback_data: string }[][]

/** Низкоуровневый вызов метода Bot API. Best-effort: не бросает, возвращает bool. */
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error(`[telegram] TELEGRAM_BOT_TOKEN не задан — ${method} не выполнен`)
    return false
  }
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[telegram] ${method} HTTP ${res.status}: ${body}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[telegram] ${method} failed:`, e)
    return false
  }
}

/**
 * Отправляет текстовое сообщение в чат Telegram через метод sendMessage.
 * Best-effort: при любой ошибке возвращает false и не бросает исключение —
 * чтобы сбой уведомления не ломал основную операцию (назначение задачи и т.п.).
 * keyboard — необязательная inline-клавиатура (например, кнопки Да/Нет).
 */
export async function sendTelegram(
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<boolean> {
  if (!chatId) return false
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  })
}

/**
 * Отправляет сообщение с inline-кнопками (обёртка над sendMessage с reply_markup).
 * Best-effort: при ошибке возвращает false и не бросает.
 */
export async function sendTelegramButtons(
  chatId: string,
  text: string,
  buttons: InlineKeyboard,
): Promise<boolean> {
  return sendTelegram(chatId, text, buttons)
}

/**
 * Подтверждает нажатие inline-кнопки (убирает «часики» у пользователя).
 * Telegram требует ответить на callback_query, иначе кнопка «висит».
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  return callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  })
}

/** Короткий псевдоним answerCallbackQuery (по терминологии командной фичи). */
export const answerCallback = answerCallbackQuery

/**
 * Меняет текст ранее отправленного сообщения. Reply_markup не передаётся,
 * поэтому inline-кнопки у сообщения убираются (нельзя ответить повторно).
 */
export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
): Promise<boolean> {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  })
}

/**
 * Убирает inline-кнопки у ранее отправленного сообщения (после ответа сотрудника),
 * чтобы по одному вопросу нельзя было нажать кнопку повторно.
 */
export async function removeInlineKeyboard(chatId: string, messageId: number): Promise<boolean> {
  return callTelegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  })
}

/**
 * Генерирует короткий человекочитаемый код привязки (8 hex-символов).
 * Уникальность гарантируется уникальным индексом в БД + повтором при коллизии.
 */
export function generateLinkCode(): string {
  return randomBytes(4).toString('hex')
}
