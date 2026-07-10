---
name: create-project
description: scaffold a new project with files, dependencies, and verification
---

# Create project workflow

1. Confirm the workspace folder is the project root (no extra wrapper directory).
2. Plan files in 2–3 sentences.
3. Write all files with `<file path="...">` tags:
   - Entry point (index.html, main.py, or src/main.ts)
   - Dependencies manifest (package.json, requirements.txt, etc.)
   - README only if the user asked
4. Use `<mkdir path="...">` only when subfolders are required.
5. Install deps with separate `<run>` tags (one command each).
6. Run a smoke command if applicable (e.g. `python -m py_compile main.py`).

Do not claim success without emitting the file tags.
