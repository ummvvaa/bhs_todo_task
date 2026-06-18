import AssistantChat from './assistant-chat'

// Экран «ИИ-ассистент»: начальник задаёт вопросы о задачах и сотрудниках
// обычными словами, ответы строятся по текущему срезу данных.
// Авторизация и проверка роли admin — в src/app/admin/layout.tsx.

export default function AssistantPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          ИИ-ассистент
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Спросите о задачах и сотрудниках обычными словами — ответ по текущим данным.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <AssistantChat />
      </div>
    </div>
  )
}
