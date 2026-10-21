# HiveForYou — brand essentials (v1.0)

Master files live here. **Deploy copies** at site root (keep in sync when replacing assets):

| Root file | Source |
|---|---|
| `/favicon.ico` | `brand/favicon.ico` |
| `/favicon.svg` | `brand/favicon.svg` |
| `/apple-touch-icon.png` | `brand/apple-touch-icon.png` |
| `/og-image.png` | `brand/og-image.png` |

App code imports paths from `apps/web/src/lib/brand/paths.ts`. Narrative rules: `brain/HiveForYou-brand-guide.md`.

| File | What it is |
|---|---|
| `hiveforyou-mark.svg` | Hex mark, full colour (four cells) |
| `hiveforyou-mark-mono.svg` | Hex mark, single colour — inherits CSS `color` when inlined; renders black as an `<img>` |
| `hiveforyou-wordmark.svg` | Wordmark "Hive" + "ForYou" (text outlined) |
| `hiveforyou-logo.svg` | Mark + wordmark — app header (via `HiveAppLogo`) |
| `hiveforyou-pro.svg` | "HiveForYou Pro" lockup — Pro workspace header |
| `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` | Browser tab + iOS home screen |
| `og-image.png` | Link preview, 1200×630 |
| `clear-space.png` | Clear-space diagram |
| `hiveforyou-motion.svg` | Animated mark — assembles once (~1.2 s), then holds |

## Wordmark spec
Outfit — "Hive" 600, "ForYou" 400, letter-spacing −0.03em, no space between.
Colours: Hive #1F2328, ForYou #4A525C (on dark: #FFFFFF / #C9CED6).

## Head tags (Next.js `layout.tsx` metadata uses these paths)
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="https://YOUR-DOMAIN/og-image.png">
<meta name="twitter:card" content="summary_large_image">
```

## Pro
Always "HiveForYou Pro", never "Hive Pro". The tag reads "Pro" (not "PRO").
