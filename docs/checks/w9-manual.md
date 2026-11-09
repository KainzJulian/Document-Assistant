# W9 manual checks

## W9.1 Performance

- Run `w9-performance.py` (see its header).
- Library page with 1,000 documents: open it in the browser; the first 200 rows appear in under a second, "Mehr anzeigen" adds more.
- First answer token under 3 seconds with a cloud model: open the browser dev tools, Network tab, send a question, note when the first `token` event arrives.
- While the worker indexes a 200-page PDF (`make-big-pdf.py`), click through library, settings and a chat: the UI stays responsive.

## W9.2 Edge cases

Go through `w9-edge-cases.md`.

## W9.3 Accessibility

1. `make check`: Storybook's a11y addon is set to `error` (`frontend/.storybook/preview.ts`); fix any violation it reports or lower the setting for that story with a comment.
2. Keyboard only, no mouse: log in, Tab to the skip link ("Zum Inhalt springen"), upload a file, open "Neuer Chat", pick a document, ask a question, open a citation, search chats, open settings. Every step must be reachable and the focus must be visible.
3. Phone width: "Menü" moves the focus into the drawer, Esc or "Schließen" returns it to the menu button.
4. Screen reader (NVDA or VoiceOver): a finished answer is read once, not token by token; errors are announced; dialogs announce their title.

## W9.4 Documentation

- `make docs` writes `docs/reference/api` (pdoc) and `docs/reference/web` (Compodoc).
- "Zero docstring findings": `make check` (ruff `D`, eslint `jsdoc/require-jsdoc`) has no findings.
- Read `docs/user-guide.de.md` and the in-app "Hilfe"; fix what is wrong for your household.
