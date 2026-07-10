# Ontology — Codebase Map

Read this first. Each file has a header comment and `// ─── Section ───` dividers explaining its role.

## Architecture (high level)

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron main (electron/main.ts)                               │
│  FS, terminal PTY, grep, git, settings — Node.js privileges     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC
┌───────────────────────────▼─────────────────────────────────────┐
│  Preload bridge (electron/preload.ts) → window.ontology         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  React UI (src/)                                                │
│  App shell → components → Zustand store (ideStore)              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   aiService          contextOntology       agentService
   (LLM API)         (prompt assembly)     (parse + apply edits)
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    agentRunnerService
                    (one agent turn: apply → verify → run)
```

## Agent turn flow (Agent mode)

1. **ChatPanel** — user sends message → `runStream()`
2. **contextOntology** — `gatherContextInputs()` + `assembleContextPrompt()` builds system prompt
3. **aiService** — `streamChat()` streams model response into chat UI
4. **agentRunnerService** — `finishAgentTurn()` after stream completes:
   - **agentService** — parse `<file>`, `<run>`, `<mkdir>` tags → write files, run shell
   - **verifyService** — py_compile / npm typecheck on written files
   - auto-fix retry if verify fails (ChatPanel calls `runStream` again with `fix` phase)
5. Explorer refreshes via `refreshTree` + file watcher

## Suggested reading order

1. This file
2. `App.tsx` → `ChatPanel.tsx` → `EditorArea.tsx`
3. `contextOntology.ts` → `agentService.ts` → `agentRunnerService.ts`
4. `electron/preload.ts` → `electron/main.ts`
5. Other files from the directory guide as needed

## Directory guide

| Path | Purpose |
|------|---------|
| `electron/main.ts` | Electron main process: window, IPC handlers, FS, terminal |
| `electron/preload.ts` | Safe bridge exposed as `window.ontology` |
| `electron/harnessLoader.ts` | Load `.ontology/rules`, skills, AGENTS.md from disk |
| `vite.config.ts` | Vite + Electron build wiring |
| `src/main.tsx` | React entry — theme + Monaco setup |
| `src/App.tsx` | Layout shell: sidebar, editor, terminal, chat |
| `src/store/ideStore.ts` | Global Zustand state (tabs, chat, settings, context) |
| `src/services/aiService.ts` | BYOM providers (Ollama, OpenAI, DeepSeek, custom) |
| `src/services/contextOntology.ts` | Layered prompt assembly (identity → rules → workspace → …) |
| `src/services/contextService.ts` | @-context picker, grep search, attached snippets |
| `src/services/agentService.ts` | Parse agent output tags, apply filesystem edits |
| `src/services/agentRunnerService.ts` | Orchestrate one agent turn (apply + verify + commands) |
| `src/services/harnessService.ts` | Filter rules/skills by globs and user query |
| `src/services/researchService.ts` | Pre-flight grep + manifest before agent runs |
| `src/services/verifyService.ts` | Post-write syntax/lint checks |
| `src/services/chatHistoryService.ts` | Compact long chat for API token limits |
| `src/lib/agentMessageParser.ts` | Split agent messages into UI blocks (file, run, code) |
| `src/lib/files.ts` | openFileAsTab helper |
| `src/lib/theme.ts` | Dark/light theme for DOM, Monaco, xterm |
| `src/hooks/useTheme.ts` | Theme toggle + persistence |
| `src/monacoSetup.ts` | Monaco web workers for Vite |
| `src/components/ChatPanel.tsx` | Chat UI, streaming, agent apply pipeline |
| `src/components/ChatContextBar.tsx` | @ context attachments above chat input |
| `src/components/AgentMessageRenderer.tsx` | Render agent blocks (CodeBox, ActionCard, summary) |
| `src/components/EditorArea.tsx` | Monaco editor + tab bar |
| `src/components/FileExplorer.tsx` | Sidebar file tree |
| `src/components/TerminalPanel.tsx` | xterm.js + PTY shell |
| `src/components/SettingsPanel.tsx` | Theme + AI provider settings |
| `src/components/TitleBar.tsx` | Window chrome, open folder |
| `src/components/CodeBox.tsx` | Collapsible code blocks in chat |
| `src/components/MarkdownMessage.tsx` | Chat prose + inline code fences |
| `src/components/ActionCard.tsx` | RUN/DIR/DEL badges in agent chat |
| `src/components/ChatModeSelector.tsx` | Agent vs Chat toggle |
| `src/components/PlanModeToggle.tsx` | Plan-before-build toggle + approve bar |
| `src/components/ContextMenu.tsx` | Explorer right-click menu |
| `src/components/PanelHeader.tsx` | Shared panel title bar |
| `src/components/IconButton.tsx` | Small icon buttons in panel headers |
| `src/components/ResizeHandle.tsx` | Draggable panel dividers |
| `.ontology/rules/` | Example project rules (`.mdc`) |
| `.ontology/skills/` | Example agent skills (`SKILL.md`) |

## Chat modes

| Mode | Writes files? | Context |
|------|---------------|---------|
| **Chat** | No — read-only assistant | Lighter prompt budget |
| **Agent** | Yes — `<file>` tags + `<run>` commands | Full ontology + harness |
| **Plan** (toggle) | No — produces plan only | User approves → Execute phase |
| **Fix** (auto) | Yes — retry after verify failure | Includes error output |

## Agent output contract

Models should emit structured tags (parsed by `agentService.ts`):

```xml
<file path="src/app.py">…full file contents…</file>
<mkdir path="src" />
<run>pip install pandas</run>
<run>python main.py</run>
```

Fallback: markdown fences with filenames (see `parseMarkdownFileEdits`).

## Context layers (contextOntology.ts)

Applied in order, packed to char budget:

1. **identity** — who the model is (Agent vs Chat, phase)
2. **rules** — `.ontology/rules`, AGENTS.md, .cursor/rules
3. **skills** — matched SKILL.md files
4. **research** — pre-flight grep hits
5. **workspace** — file tree, git status, package.json
6. **session** — open tabs, terminal tail, recent edits
7. **retrieval** — codebase grep for query terms
8. **attached** — user @-context items
9. **history** — compact prior chat

## Electron IPC handlers (`electron/main.ts`)

| Channel | Purpose |
|---------|---------|
| `dialog:openFolder` | Native folder picker → path + tree |
| `fs:readFile` / `fs:readFileBase64` | Load text or image for editor |
| `fs:writeFile` | Save file (agent + Ctrl+S) |
| `fs:createFile` / `fs:createFolder` | Explorer new file/folder |
| `fs:delete` / `fs:rename` / `fs:mkdir` | Agent filesystem ops |
| `fs:refreshTree` / `fs:watch` | Explorer tree sync |
| `fs:grep` | Codebase search |
| `git:context` | Branch, status, diff |
| `harness:load` | Rules + skills bundle |
| `terminal:create` / `input` / `resize` / `kill` | Interactive shell |
| `terminal:exec` | One-shot command (agent, verify) |
| `settings:get` / `settings:save` | Persist AI + theme |
| `window:*` | Minimize, maximize, close, theme sync |

## Preload API (`window.ontology`)

| Method | IPC handler |
|--------|-------------|
| `openFolder()` | `dialog:openFolder` |
| `writeFile` | `fs:writeFile` |
| `refreshTree` / `watchFolder` | `fs:refreshTree` / `fs:watch` |
| `grep` | `fs:grep` |
| `gitContext` | `git:context` |
| `loadHarness` | `harness:load` |
| `terminal.exec` | `terminal:exec` |
| `settings.get/save` | `settings:*` |
