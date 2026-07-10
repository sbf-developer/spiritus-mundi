---
name: plan-and-build
description: plan a multi-file feature before writing code, scaffold, architecture
---

# Plan and build workflow

When the task touches 3+ files or new architecture:

1. If not in plan mode, still output a 3-line plan before file tags.
2. List every file path you will create or modify.
3. Write files in dependency order (config → utils → main).
4. Run verification-friendly commands after writes.

Never skip the file tag step.
