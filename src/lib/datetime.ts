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

/**
 * Переводит значение поля <input type="datetime-local"> ("YYYY-MM-DDTHH:mm",
 * иногда с секундами) в UTC ISO для хранения в timestamptz, ТРАКТУЯ ввод как
 * время Алматы (UTC+5, без перехода на летнее время).
 *
 * Зачем: datetime-local отдаёт строку без часового пояса. На сервере (Vercel = UTC)
 * `new Date("2026-06-22T20:00")` понимается как 20:00 UTC, хотя пользователь имел
 * в виду 20:00 по Алматы — отсюда сдвиг +5 часов. Здесь явно добавляем смещение +05:00.
 *
 * Возвращает null для пустого/некорректного значения.
 */
export function almatyLocalToUtcISO(local: string | null | undefined): string | null {
  if (!local) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00+05:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
