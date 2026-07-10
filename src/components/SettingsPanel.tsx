/**
 * Settings sidebar — theme + BYOM AI provider configuration.
 *
 * Local form state until "Save settings" → ideStore + electron settings file.
 * "Test connection" hits aiService.testConnection without saving.
 */
import { useState } from 'react'import { Check, AlertCircle, Loader2, Sun, Moon, Plug } from 'lucide-react'
import { useIDEStore, defaultSettings, normalizeSettings } from '../store/ideStore'
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
  const [local, setLocal] = useState<AISettings>(() => normalizeSettings(settings))
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
    const next = normalizeSettings(local)
    setLocal(next)
    setSettings(next)
    await window.ontology.settings.save({ ai: next, theme })
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
        </section>

        <section className="pt-3 border-t border-border-subtle space-y-2">
          <p className="text-[10px] text-text-muted leading-relaxed">
            Verify your provider responds, then save to use it in chat.
          </p>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border-default bg-surface-overlay text-[12px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <Loader2 size={13} className="animate-spin shrink-0" />
            ) : (
              <Plug size={13} strokeWidth={1.75} className="shrink-0 opacity-70" />
            )}
            {testing ? 'Checking connection…' : 'Test connection'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[12px] font-medium hover:opacity-90 active:scale-[0.99] transition-all"
          >
            {saved ? <Check size={13} strokeWidth={2.25} /> : null}
            {saved ? 'Saved' : 'Save settings'}
          </button>
        </section>

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
