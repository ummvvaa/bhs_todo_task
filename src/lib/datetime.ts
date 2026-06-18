// Единое детерминированное форматирование дат.
// ВАЖНО: фиксированные локаль и часовой пояс дают ОДИНАКОВЫЙ результат
// на сервере (Node, обычно UTC) и на клиенте (локальный пояс браузера),
// что устраняет ошибку гидратации Next.js.
// Никаких toLocale* без явных locale и timeZone.

export const APP_LOCALE = 'ru-RU'
export const APP_TIME_ZONE = 'Asia/Almaty' // UTC+5, без перехода на летнее время

const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Форматирует дату/время в часовом поясе Алматы (UTC+5).
 * Пример: «18 июня, 21:43». Результат детерминирован: одинаков на сервере и клиенте.
 */
export function formatDateTime(date: string | number | Date): string {
  return dateTimeFormatter.format(new Date(date))
}
