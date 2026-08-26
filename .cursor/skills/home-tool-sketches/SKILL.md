---
name: home-tool-sketches
description: Draw vlandivir home-page tool sketches — the same chibi girl in pencil/ink, each card a new composition. Use when adding or replacing sketches on `/`, tool tiles, web/home/sketches, or when the user asks for pictures in that sketch style.
---

# Home tool sketches

Pencil-on-paper cards for `web/home/`. One character, many camera setups. The original pose (girl kneeling over a giant open book) is the **style sheet only** — never reuse it as a card.

## Style (copy into the image prompt)

- Medium: black pencil / fine-liner on textured cream paper. The default is monochrome with no gray wash or photorealism. When a paired color version is requested, keep the same line-art character and add only restrained watercolor accents taken from the character reference.
- Line: loose, gestural, uneven weight. Cross-hatching for shade, not fills.
- Character: keep one character within a set. The original girl has a round face, tiny smile, dot eyes, messy high bun with loose strands, thick sweater, and simple pants. The current home-page set uses the witch doll reference: floppy black pointed hat, mustard yarn hair, round cloth face with dot eyes and a stitched smile, rosy cheek patches, lavender/purple striped dress, and oversized black shoes with lilac bows.
- Mood: cozy, whimsical. A metaphor for the tool should "come alive" (path, pins, papers, captions), not a screenshot of the UI.
- No readable words, logos, or UI chrome.

Reference file (pass to GenerateImage as `reference_image_paths`): [style-reference.webp](style-reference.webp).

Witch character reference (pass before the style reference): [references/witch-reference.jpg](references/witch-reference.jpg). Treat it as the character/wardrobe reference, not as a pose or background reference.

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

### Witch compositions already used

| Tool | Composition already used |
|---|---|
| Subs | Bird's-eye view, sitting inside a spiral filmstrip and arranging blank subtitle ribbons |
| GPX | High aerial three-quarter view, flying on a broom above a pinned winding route |
| Trip | Low-angle view, riding an open suitcase with blank photo prints streaming behind |
| Map | Balancing on a giant compass needle and looking through a spyglass at a miniature world |
| Files | Diagonal side view, ziplining on a giant paperclip between floating folders |
| GTD | Tightrope balancing act with checked task cards while a broom sweeps completed cards |
| Diary | Cutaway inside a giant hourglass, arranging falling note cards |
| Email | Side view, riding a giant envelope down a curved trail of smaller envelopes |
| Reels | Rear three-quarter view, sitting in a director's chair facing a portrait projection screen while blank vertical film frames arc around it |
| Threads | Top-down craft-table view, sewing blank speech bubbles into a yarn chain |

### Quote illustrations already used

| Post | Composition already used |
|---|---|
| Free coding help | Eye-level frontal three-quarter view, cyber-warlock seated on a low stool beside a circular question-well, selecting one floating comment bubble and turning its tangled thread into a clear solution path |

Forbidden default: girl kneeling in the lower-left, object in the center, magic rising up. If two sketches could be swapped and still "read" the same, regenerate.

## How to make one

1. Write a prompt that starts with the style block, names the chosen character, then states the **new** composition in one concrete sentence (angle + pose + scale + metaphor). Explicitly list the poses above as "do not repeat".
2. Generate square (`1:1`) with the matching character reference and the style reference.
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
