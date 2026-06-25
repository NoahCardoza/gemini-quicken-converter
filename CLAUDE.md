# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite)
npm run build     # production build
npm run preview   # preview production build
npm run lint      # ESLint
```

## Architecture

Single-page React + Vite app deployed as a static site. All processing is client-side — no backend.

**Key files:**
- `src/pages/index.jsx` — the entire conversion logic lives here: CSV parsing (PapaParse), Gemini→Quicken field mapping, localStorage state for tracking last import, and the upload UI
- `src/layouts/root.jsx` — top nav with links to Convert and Security pages
- `src/pages/security.jsx` — static security/privacy explainer page

**Data flow:**
1. User drops a Gemini CSV export onto the upload area
2. PapaParse parses it with `header: true`
3. `filterNewTransactions()` skips rows already seen (tracked by date + reference numbers in `localStorage` under key `gemini-last-import`)
4. `transformCSV()` maps Gemini fields → Quicken fields (negates amounts since Gemini uses negative for debits)
5. Filtered + transformed rows are re-serialized with PapaParse and downloaded as a new CSV

**localStorage schema** (`gemini-last-import`):
```json
{ "date": "2026-06-24", "refNumbers": ["6422785300", "..."] }
```
`date` is ISO format (YYYY-MM-DD) for lexicographic comparison. `refNumbers` are all reference numbers seen on that date (handles multiple same-day transactions).

**Styling:** Tailwind CSS. One custom utility class `.link` defined in `src/index.css`.
