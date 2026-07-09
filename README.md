# Spiritus Mundi

A minimalist, local coding IDE for software engineers. Clean file explorer, Monaco editor, integrated terminal, and AI chat — bring your own model.

![Spiritus Mundi](https://img.shields.io/badge/Electron-IDE-6b8afd)

## Features

- **File Explorer** — Browse, open, create files and folders
- **Code Editor** — Monaco editor with syntax highlighting, tabs, Ctrl+S save
- **Terminal** — Integrated shell (PowerShell on Windows, bash on macOS/Linux)
- **AI Chat** — Streaming chat with context from your open file
- **BYOM (Bring Your Own Model)** — Connect any API:
  - **Ollama** — Local models (Llama, Mistral, etc.)
  - **DeepSeek** — DeepSeek API
  - **OpenAI** — GPT models
  - **Custom** — Any OpenAI-compatible endpoint

## Quick Start

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for production
npm run build
```

## AI Setup

### Ollama (Local — Recommended)

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull llama3.2`
3. In Spiritus Mundi → Settings → select **Ollama**
4. Click **Test Connection** → **Save**

### DeepSeek

1. Get an API key from [DeepSeek](https://platform.deepseek.com)
2. Settings → select **DeepSeek**
3. Paste your API key → Test → Save

### OpenAI / Custom

Settings → select provider → enter API key, base URL, and model name.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open folder |
| `Ctrl+S` | Save current file |
| `Enter` | Send chat message |
| `Shift+Enter` | New line in chat |

## Tech Stack

- Electron + React + TypeScript + Vite
- Monaco Editor
- xterm.js + node-pty
- Tailwind CSS
- Zustand

## License

MIT
