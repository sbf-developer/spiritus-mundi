import { useState } from 'react'
import { Check, AlertCircle, Loader2, Sun, Moon } from 'lucide-react'
import { useIDEStore, defaultSettings } from '../store/ideStore'
import { getProviderDefaults, testConnection } from '../services/aiService'
import { useTheme } from '../hooks/useTheme'
import { PanelHeader } from './PanelHeader'
import type { AISettings } from '../vite-env.d'

const PROVIDERS = [
  { id: 'ollama' as const, label: 'Ollama', desc: 'Local models' },
  { id: 'deepseek' as const, label: 'DeepSeek', desc: 'DeepSeek API' },
  { id: 'openai' as const, label: 'OpenAI', desc: 'GPT models' },
  { id: 'custom' as const, label: 'Custom', desc: 'OpenAI-compatible' },
]

export function SettingsPanel() {
  const { settings, setSettings, theme } = useIDEStore()
  const { setTheme } = useTheme()
  const [local, setLocal] = useState<AISettings>(settings)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)

  const update = (patch: Partial<AISettings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    setSaved(false)
    setTestResult(null)
  }

  const handleProviderChange = (provider: AISettings['provider']) => {
    const defaults = getProviderDefaults(provider)
    setLocal((prev) => ({
      ...prev,
      provider,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
    }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSettings(local)
    await window.spiritus.settings.save({ ai: local, theme })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(local)
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PanelHeader title="Settings" />

      <div className="p-3 space-y-6">
        <section>
          <SectionLabel>Appearance</SectionLabel>
          <div className="flex gap-1 mt-2 p-0.5 rounded-lg border border-border-subtle bg-surface-overlay">
            <ThemeOption
              icon={<Moon size={13} strokeWidth={1.5} />}
              label="Dark"
              active={theme === 'dark'}
              onClick={() => setTheme('dark')}
            />
            <ThemeOption
              icon={<Sun size={13} strokeWidth={1.5} />}
              label="Light"
              active={theme === 'light'}
              onClick={() => setTheme('light')}
            />
          </div>
        </section>

        <section>
          <SectionLabel>AI provider</SectionLabel>
          <div className="mt-2 space-y-0.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
                  local.provider === p.id
                    ? 'bg-surface-active text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <div className="text-[12px] font-medium leading-none">{p.label}</div>
                <div className="text-[10px] text-text-muted mt-1">{p.desc}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 pt-1 border-t border-border-subtle">
          {local.provider !== 'ollama' && (
            <Field label="API key">
              <input
                type="password"
                value={local.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="input-field"
              />
            </Field>
          )}

          <Field label="Base URL">
            <input
              type="text"
              value={local.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              className="input-field"
            />
          </Field>

          <Field label="Model">
            <input
              type="text"
              value={local.model}
              onChange={(e) => update({ model: e.target.value })}
              className="input-field"
            />
          </Field>

          <Field label={`Temperature · ${local.temperature}`}>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={local.temperature}
              onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
          </Field>

          <Field label="Max tokens">
            <input
              type="number"
              value={local.maxTokens}
              onChange={(e) => update({ maxTokens: parseInt(e.target.value) || 4096 })}
              className="input-field"
            />
          </Field>
        </section>

        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-ghost flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {testing && <Loader2 size={12} className="animate-spin" />}
            Test
          </button>
          <button
            onClick={handleSave}
            className="btn-soft flex-1 flex items-center justify-center gap-1.5"
          >
            {saved && <Check size={12} strokeWidth={2} />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        {testResult && (
          <div
            className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border ${
              testResult.ok
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
                : 'bg-red-500/5 border-red-500/20 text-red-500'
            }`}
          >
            {testResult.ok ? (
              <Check size={12} className="shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
            )}
            <span className="break-all leading-relaxed">{testResult.message}</span>
          </div>
        )}

        <button
          onClick={() => setLocal(defaultSettings)}
          className="w-full text-[11px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Reset AI defaults
        </button>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-text-muted">
      {children}
    </span>
  )
}

function ThemeOption({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] transition-colors ${
        active
          ? 'bg-surface-raised text-text-primary shadow-sm'
          : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-text-muted mb-1 block">{label}</label>
      {children}
    </div>
  )
}
