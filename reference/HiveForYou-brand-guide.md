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
| App opening, "Building your hive", website hero | `hiveforyou-motion.svg` | Plays once, then holds. Never loop it inside the product. |
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
