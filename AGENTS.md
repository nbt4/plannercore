# PlannerCore Agent Rules

## Mandatory suite design contract

- Before any UI work, read `../docs/DESIGN_SYSTEM.md` and `../theme/README.md` in the `cores` umbrella, or the canonical documents in `github.com/nbt4/cores` for standalone work.
- `web/src/cores-theme.css` and `web/src/lib/cores-design.ts` are generated. Never edit them directly; update and sync the umbrella sources.
- Planner-specific task, label and chart colors may communicate data, but shell, typography, forms, tables, dropdowns, scrollbars, cards, sidebar and dashboard hierarchy must use the shared suite tokens.
- Dashboard greetings must use `suiteGreeting()`. The desktop sidebar is 256/80 px and must retain the shared responsive shell behavior.
- Run the umbrella design check, frontend build and Go tests before release; document visible behavior changes in the README.
