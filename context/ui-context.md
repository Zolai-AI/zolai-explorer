# UI Context

## Theme

Class-based theme: `.dark` on `<html>`, with preference `system | light | dark`
persisted under `zolai.theme`. Tokens are CSS-first: `@theme inline`,
`@custom-variant dark`, and `:root` / `.dark` blocks in HEAD `src/index.css`.
The blocking script in `index.html` must stay in sync with `src/lib/theme.ts`
to avoid a flash of the wrong theme. Source: AGENTS.md, src/index.css.

## Colors

Real shadcn token values from HEAD `src/index.css`. Light values are from `:root`,
dark values from `.dark`; never introduce a literal color in markup.

| Role | CSS Variable | Light value | Dark value | Source |
|------|--------------|-------------|------------|--------|
| Page background | `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | src/index.css |
| Card surface | `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | src/index.css |
| Primary text | `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | src/index.css |
| Muted text | `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.8 0 0)` | src/index.css |
| Primary brand accent | `--primary` | `oklch(0.508 0.131 163.224)` | `oklch(0.765 0.177 163.223)` | src/index.css |
| Border | `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | src/index.css |
| Destructive | `--destructive` | `oklch(0.52 0.23 27.325)` | `oklch(0.704 0.191 22.216)` | src/index.css |
| Chart series 1 | `--chart-1` | `oklch(0.55 0.135 163.2)` | `oklch(0.74 0.15 163.2)` | src/index.css |
| Chart series 2 | `--chart-2` | `oklch(0.58 0.135 243)` | `oklch(0.7 0.13 243)` | src/index.css |
| Chart series 3 | `--chart-3` | `oklch(0.7 0.15 68)` | `oklch(0.8 0.14 78)` | src/index.css |
| Chart series 4 | `--chart-4` | `oklch(0.55 0.185 300)` | `oklch(0.71 0.16 300)` | src/index.css |
| Chart series 5 | `--chart-5` | `oklch(0.6 0.19 12)` | `oklch(0.72 0.17 15)` | src/index.css |

## Typography

| Role | Font | Variable | Source |
|------|------|----------|--------|
| Body / UI text | Geist Variable, self-hosted via `@fontsource-variable/geist` | `--font-sans` | package.json, src/index.css, AGENTS.md |
| Display / headings | Cormorant Garamond Variable, self-hosted via `@fontsource-variable/cormorant-garamond` | `--font-heading` | package.json, src/index.css, AGENTS.md |
| Code/mono | System monospace stack declared in `@theme` | `--font-mono` | src/index.css |

Use the `cn-font-heading` utility for the display face; do not place a font literal in
markup (source: AGENTS.md, src/index.css).

## Border Radius

| Context | Class / Rule | Value | Source |
|---------|--------------|-------|--------|
| Base radius token | `--radius` | `0.625rem` | src/index.css |
| Small | `--radius-sm` | `calc(var(--radius) * 0.6)` | src/index.css |
| Medium | `--radius-md` | `calc(var(--radius) * 0.8)` | src/index.css |
| Large | `--radius-lg` | `var(--radius)` | src/index.css |
| Extra large | `--radius-xl` | `calc(var(--radius) * 1.4)` | src/index.css |

## Component Library

shadcn/ui is the committed UI kit (`components.json`, style recorded in AGENTS.md);
primitives are vendored copies in `src/components/ui/` and are owned by this repo.
Add primitives with the shadcn CLI and never hand-write or fork one under a new name.
App-level composition lives in `src/components/`, including the shared `Notice`,
`PageHeader`, `StatGrid`, `MetaList`, `DataFreshness`, `CopyValue` and `ErrorState`
components. Source: AGENTS.md, git ls-tree -r HEAD -- src.

## Layout Patterns

- AppShell with a Sheet navigation drawer below `lg` and a persistent sidebar from `lg` (source: README.md, AGENTS.md).
- Mobile-first base classes with `sm:` / `md:` / `lg:` scaling and 40px+ touch targets on interactive controls (source: AGENTS.md).
- Semantic cards, tables and grids with a collapsible raw JSON disclosure; tables use `hideBelow` priority plus a scrolling container and are usable at 375px (source: README.md, AGENTS.md).
- Elevation ladders are theme-aware through `--shadow-card`, `--shadow-popover` and `--shadow-modal` (source: src/index.css, AGENTS.md).

## Icons

Lucide React, as declared in `package.json` and used throughout the committed component tree.

## Skills (UI / UX)

Use these installed skills when designing or implementing UI. They complement
`web-design-guidelines` and `shadcn` (Agent Skills) — do not replace them.

| Skill | When to use |
| ----- | ----------- |
| `ui-ux-pro-max` | Product/page UI reasoning, stack-aware patterns, UX guidelines; optional `search.py` (Python 3) for CSV design data |
| `brand` | Logo, voice, color/type identity, brand guideline sync |
| `design-system` | Tokens, component specs, Tailwind integration; hierarchical pages via `design-system/MASTER.md` when needed |
| `ui-styling` | Tailwind/shadcn theming, responsive utilities, canvas fonts |
| `web-design-master` | Page/section/layout design, color systems, typography scale, accessibility, design QA review |

**Persist → this file:** When a skill (or `--persist` / design-system output) produces tokens,
colors, typography, or component conventions, write the durable choices into
`context/ui-context.md` (project source of truth). Keep long hierarchical design
docs in `design-system/` only when the project needs multi-page token trees.
