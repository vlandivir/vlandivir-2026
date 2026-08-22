---
name: home-tool-sketches
description: Draw vlandivir home-page tool sketches — the same chibi girl in pencil/ink, each card a new composition. Use when adding or replacing sketches on `/`, tool tiles, web/home/sketches, or when the user asks for pictures in that sketch style.
---

# Home tool sketches

Pencil-on-paper cards for `web/home/`. One character, many camera setups. The original pose (girl kneeling over a giant open book) is the **style sheet only** — never reuse it as a card.

## Style (copy into the image prompt)

- Medium: black pencil / fine-liner on textured cream paper. Monochrome. No color, no gray wash, no photorealism.
- Line: loose, gestural, uneven weight. Cross-hatching for shade, not fills.
- Character: same girl every time — round face, tiny smile, dot eyes, messy high bun with loose strands, thick sweater, simple pants.
- Mood: cozy, whimsical. A metaphor for the tool should "come alive" (path, pins, papers, captions), not a screenshot of the UI.
- No readable words, logos, or UI chrome.

Reference file (pass to GenerateImage as `reference_image_paths`): [style-reference.webp](style-reference.webp).

## Composition (the actual rule)

**Do not repeat a composition that already exists.** Each new sketch needs a different camera, scale, and pose. Before generating, read this list and add the new entry when you ship.

| Tool | Composition already used |
|---|---|
| Subs | Lying on her stomach, close-up, tall phone with caption bars |
| GPX | Side view, she rides a bicycle along a drawn trail |
| Trip | Standing, camera to her eye, polaroids falling around her |
| Map | Tiny figure walking on a giant unfolded map |
| Files | Climbing a tottering tower of folders, low angle |
| GTD | Side profile at a desk next to a wall of huge checkboxes |
| Diary | Sitting inside a giant calendar, writing on one day's square |
| Email | Running, catching a flock of envelopes / paper airplanes |
| Reels | Sitting cross-legged, filming herself on a phone on a tripod |
| Threads | Over-the-shoulder, typing on a giant phone; stacked speech bubbles rise from the screen |

Forbidden default: girl kneeling in the lower-left, object in the center, magic rising up. If two sketches could be swapped and still "read" the same, regenerate.

## How to make one

1. Write a prompt that starts with the style block, names the girl, then states the **new** composition in one concrete sentence (angle + pose + scale + metaphor). Explicitly list the poses above as "do not repeat".
2. Generate square (`1:1`) with the reference image.
3. Convert into the repo (800px WebP, quality ~82):

```bash
python3 - <<'PY'
from PIL import Image
im = Image.open('src.png').convert('RGB')
im.thumbnail((800, 800), Image.Resampling.LANCZOS)
im.save('web/home/sketches/sketch-{id}.webp', 'WEBP', quality=82, method=6)
PY
```

4. Card markup: `<img class="tool-tile__sketch" src="/home/sketches/sketch-{id}.webp" alt="" data-i18n-attr="alt:{id}Alt" />` plus RU/EN alt keys in `web/home/i18n.js`.
5. Append the new composition to the table in this skill.

Admin-only tiles (diary, email, reels) live in `#admin-tools` and are shown only when `GET /auth/me` returns `isAdmin: true`.
