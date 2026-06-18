'use client'

import { useState } from 'react'

// Показывает код привязки и команду /start <код> с кнопками «Скопировать».
export default function LinkCodeBox({
  code,
  startCommand,
  botUsername,
}: {
  code: string
  startCommand: string
  botUsername: string | null
}) {
  const [copied, setCopied] = useState<'code' | 'cmd' | null>(null)

  async function copy(value: string, which: 'code' | 'cmd') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // буфер обмена недоступен — пользователь скопирует вручную
    }
  }

  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 font-mono text-lg tracking-widest text-slate-900 dark:text-white text-center select-all">
          {code}
        </code>
        <button
          type="button"
          onClick={() => copy(code, 'code')}
          className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {copied === 'code' ? 'Скопировано ✓' : 'Копировать'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 font-mono text-sm text-slate-700 dark:text-slate-200 truncate select-all">
          {startCommand}
        </code>
        <button
          type="button"
          onClick={() => copy(startCommand, 'cmd')}
          className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {copied === 'cmd' ? 'Скопировано ✓' : 'Копировать'}
        </button>
      </div>

      {deepLink && (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Открыть бота и привязать →
        </a>
      )}
    </div>
  )
}
