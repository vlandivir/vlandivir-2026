# Design system

The visual foundation for every page is `web/shared/site-theme.css`. Static
pages load it before `site-header.css` and their own layout stylesheet. The GTD
React app mirrors the same semantic contract in `telegram-app/src/theme.ts`.

## Themes

The public site follows `prefers-color-scheme`; there is no manual override.
Light values live in `:root`, and dark values override the same tokens inside
`@media (prefers-color-scheme: dark)`. Components must never detect the theme or
choose palette values themselves.

`/gtd` follows the system theme. `/mini-app` uses Telegram `colorScheme` and
`themeParams`, applies them before React renders, and updates on
`themeChanged`. Every Telegram value has a tested light/dark fallback so the UI
remains usable when a client omits optional parameters.

## Semantic tokens

Use only these sources in new UI:

| Purpose | Token |
|---|---|
| Page | `hsl(var(--background))`, `hsl(var(--foreground))` |
| Card | `hsl(var(--card))`, `hsl(var(--card-foreground))` |
| Menu/dialog | `hsl(var(--popover))`, `hsl(var(--popover-foreground))` |
| Quiet surface/text | `hsl(var(--shadcn-muted))`, `hsl(var(--shadcn-muted-foreground))` |
| Border/input/focus | `--shadcn-border`, `--shadcn-input`, `--shadcn-ring` |
| Primary action | `--primary`, `--primary-foreground` |
| Destructive action | `--destructive`, `--destructive-foreground` |
| Successful action | `--success`, `--success-foreground` |
| Spacing/radius/shadow | `--v-space-*`, `--radius`, `--v-shadow` |

Token names contain HSL components, so consume them through `hsl(var(--token))`.
Do not restore legacy aliases such as `--ink`, `--paper`, `--green`, or
`--line`.

## Components

- Use `.primary-btn` for the principal action and `.ghost-btn`, `.mini-btn`, or
  `.tool-link` for secondary actions. Icon-only controls also get `.icon-btn`.
- Use existing card classes (`.editor-card`, `.tool-block`, `.workflow-step`,
  `.archive-section`) before adding a new panel shell.
- Native inputs, selects, and textareas inherit their chrome from the shared
  theme. Page CSS may only add layout properties such as width or grid position.
- Use `.badge` or `.meta-chip` for compact metadata. Errors use destructive
  tokens; successful states use success tokens.
- Focus must remain visible in both themes. Body text targets WCAG AA 4.5:1;
  large controls, state indicators, and meaningful borders target 3:1.

## Page CSS and exceptions

Page styles own layout, responsive behavior, and genuinely page-specific
visualization. Hardcoded colors are limited to literal user-selected data,
media letterboxing/overlays, brand artwork such as Instagram, and the subtitle
editor's dark video workbench. Transparency checkerboards in color controls are
also literal data previews.

When changing a stylesheet, update its `?v=YYYYMMDD-N` cache key in every HTML
entrypoint that loads it. Validate both system themes and mobile/desktop sizes.

