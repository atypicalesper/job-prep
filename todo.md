# dev-atlas TODO

## Notebook / rough.js theme

- [ ] Add rough.js as a dependency
- [ ] Implement a "notebook" visual theme using rough.js:
  - Rough-style borders on topic cards (home page)
  - Hand-drawn underlines on section headings
  - Sketch-style boxes for callout/note blocks
  - Keep code blocks and dense prose areas clean (don't apply rough style there)
- [ ] Handle dark/light theme switching — rough.js draws on canvas so stroke colors need to update on theme change
- [ ] Add a toggle (e.g. near the existing ThemeToggle) to switch between the default clean theme and the notebook/rough theme
  - Persist the preference (localStorage or next-themes compatible)
  - Make sure it plays nicely with the existing dark/light toggle
  - Reuse the same GSAP ripple/spin animation pattern from ThemeToggle for a consistent toggle UX

## Minor cleanup

- [ ] Replace inline SVG icons in ThemeToggle (`SunIcon`, `MoonIcon`) with lucide-react `<Sun>` / `<Moon>` — lucide is already installed
