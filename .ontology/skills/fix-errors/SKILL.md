---
name: fix-errors
description: fix build errors, test failures, syntax errors, and linter issues
---

# Fix errors workflow

1. Read the error output in terminal context or verification summary.
2. Identify the failing file and line from the message.
3. Fix with a complete `<file path="...">` rewrite of the affected file.
4. Do not patch with partial diffs unless the change is trivial.
5. Re-run the same check command in a `<run>` tag after fixing.

Prefer the smallest correct fix over refactors.
