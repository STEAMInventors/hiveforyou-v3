# HiveForYou brand guide — short version

**Name:** HiveForYou (one word). Never "Hive" alone. Paid tier: **HiveForYou Pro**.
**Slogan:** The complicated, made simple.

## Which file, where

| Situation | Use | Notes |
|---|---|---|
| App header (desktop) | `hiveforyou-logo.svg` | Mark + wordmark. `HiveAppLogo` in `@/components/HiveWordmark`, ~28 px height. |
| App header (phone, < 400 px wide) | `hiveforyou-mark.svg` | Same component switches at 400 px. |
| Dark background | `hiveforyou-mark.svg` + wordmark in white/`#C9CED6` | The colour mark works on dark; don't use the light-background logo file. |
| One colour only (print, stamps, fax) | `hiveforyou-mark-mono.svg` | Ink `#1F2328` or white. Inlined in HTML it takes the CSS `color`. |
| Text-only placement (footer line, partner list) | `hiveforyou-wordmark.svg` | When the mark already appears nearby or space is very wide and short. |
| Pro view header, pricing, upgrade screens | `hiveforyou-pro.svg` | Write "HiveForYou Pro", tag reads "Pro" — never "PRO". Price or "Free for now" goes beside it, not in it. |
| Browser tab, bookmarks | `favicon.ico` + `favicon.svg` | Masters in `apps/web/public/brand/`; **copies at site root** (`public/`). Wired in `apps/web/src/app/layout.tsx`. |
| iPhone home screen | `apple-touch-icon.png` | 180 px, opaque. Root copy + master in `brand/`. |
| Link previews (Slack, LinkedIn, X, iMessage) | `og-image.png` | 1200×630. Root `/og-image.png`; metadata in `layout.tsx`. |
| App opening, website hero | `hiveforyou-motion.svg` | Plays once, then holds. |
| "Building your hive" progress (processing active) | `HoneycombActivity` (web component, same geometry) | **Living Hive** — approved design `reference/prototype/Living-Hive-Motion-Approved.html`. The mark stays exactly as drawn; motion is light moving through it (a white sheen and a lift of at most ~10 %, transforms and opacity only). **Relay** (loops only while a run is active): one point of light hops clockwise, 0.65 s per cell; after reading, two opposite lights on a 3.2 s lap. **Deposit** (one newly observed finished document, 1050 ms once): the arriving cell blooms with a ring in its colour, then its neighbours, then the opposite cell; the counter lifts in that colour. **Swarm** (several documents in one update, 1150 ms once): one clockwise wave across all four cells and the counter shows the real `+N` — never one event per document. **Sync** (reading ends while the run is active, 1500 ms once): all cells pulse together twice, then two lights. **Hold** (success, 900 ms): one soft glow, then still with a check at the centre. **Rest** (failure, 700 ms): colours fade to quiet greys, no flashing or red. **Still** (`prefers-reduced-motion`, cancelled, queued): no motion; counts, statuses and the spoken status line still update. Motion is driven only by recorded statuses and durable counts, never timers; never replays on page load, reopen, reconnect or after a hidden tab. Never loop anywhere else in the product. No recolouring, reordering, rotation, outlines or stretching. *(Amended 2026-10-25, UX-DOC-1; replaces the earlier breathe/snap/seal amendment. The authoritative PDF guide still says "never loop" and has no Living Hive amendment — PDF synchronization pending, brand owner.)* |
| Explaining the rules to a designer or vendor | `clear-space.png` | Send with this guide. |

## Rules that apply to every file

- **Clear space:** one cell's height around the logo on every side.
- **Minimum size:** mark 16 px · logo 120 px wide.
- **Backgrounds:** white, Mist `#F4F6F8` or Ink `#1F2328` only. Never on photos or coloured fills.
- **Never:** recolour or reorder the cells, rotate, outline, stretch, add a bee or mascot, or retype the wordmark in another font.
- **Cell order (clockwise from top):** Blue `#3B7CF6` · Coral `#EF5143` · Honey `#F6B826` · Leaf `#2FA35A`.

## Typing the name in HTML (no image)

Outfit — "Hive" 600, "ForYou" 400, letter-spacing −0.03em. Colours: `#1F2328` / `#4A525C` on light, `#FFFFFF` / `#C9CED6` on dark. With `hiveforyou.css`:

```html
<span class="hfy-wordmark">Hive<span>ForYou</span></span>
```

## Head tags

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="https://YOUR-DOMAIN/og-image.png">
<meta name="twitter:card" content="summary_large_image">
```

When in doubt: use `hiveforyou-logo.svg` on white, and leave it plenty of room.
