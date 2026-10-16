# graphic-generator

Overlay Maker: a single-page tool for making caption overlays for vertical (9:16) videos: transparent PNGs with small white text and a soft dark halo, ready to drop onto a video editor timeline.

Everything renders in the browser. No server, no uploads, and it works offline once loaded. Built mobile-first so it can be used straight from a phone.

## Templates

| Template | Fields |
|---|---|
| Intro | episode, date, subtitle |
| Moment | time, text |
| Food | time, name, ingredients, calories, protein |
| Exercise | name, sets (`12x12.5`, `8, 6, 5`, `45 sec`), weight, note |
| Workout | session name, duration, volume, PRs |
| Weight | value, label |
| Day total | calories, protein, targets |
| Text | free lines, each "main" or "small" |

Output is 2160×3840 PNG (2× a 1080×1920 timeline), either full-frame or cropped to the text.

## Paste mode

You can add many graphics at once as text blocks:

```
[moment]
time: 7:00 am
text: Morning walk

[exercise]
name: Pull-ups
sets: 8, 6, 5
```

## Prefilling fields from the URL

Any field can be prefilled with `?<template>.<field>=<value>`, for example:

```
https://example.com/?intro.title=My%20Show
```

Prefilled values come back after each "Add to list".

## Deploy

Serve the `dist/` folder over HTTPS. HTTPS is required for the iOS share sheet ("Save to Photos"). Any static host works, e.g. Cloudflare Pages, GitHub Pages, Netlify or nginx.

On iPhone, open the URL in Safari, then Share → **Add to Home Screen**.

## Build

```bash
pip install pillow
python3 build.py        # -> dist/index.html (fonts + JS inlined) + dist/apple-touch-icon.png
```

- `src/render.js`: drawing + templates
- `src/app.html`: UI
- `fonts/`: Open Sans (SIL Open Font License)
