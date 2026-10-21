# HiveForYou V3 — Source documents and authority

**Status:** Working documentation index · **Date:** 2026-10-20.

## V3 authorities

1. `docs/PRODUCT-REQUIREMENTS.md` — **interim working draft** (2026-10-20); promoted when external export was unavailable. Confirmed behavior plus §6 open decisions. Do not silently convert open questions into requirements.
2. `docs/ARCHITECTURE.md` — current *proposal* for meeting requirements, subordinate to the requirements document.
3. `reference/HiveForYou brand guide.pdf` — **unchanged brand authority** for visual system, naming and writing style.

## Brand guide essentials (guide remains authoritative)

- Product name: **HiveForYou**, never “Hive For You” in body text; slogan **“The complicated, made simple.”**
- Tone: calm, exact, plain language; speak about people, not case numbers; no adversarial verdicts.
- Trust: “No source, no claim”; source chips open evidence; name missing information clearly.
- Palette: Cell Blue `#3B7CF6`, Coral `#EF5143`, Honey `#F6B826`, Leaf `#2FA35A`, Ink `#1F2328`, Mist `#F4F6F8`, Paper `#FFFFFF`. Use colors according to the brand guide's semantic roles, not as decoration.
- Type: Outfit for wordmark/headlines, DM Sans for body/UI, Source Serif 4 for document quotes, JetBrains Mono for source chips/references. **Do not redistribute fonts**; reference the type families and license/acquire separately as appropriate.
- The brand guide's domain examples (IEP/Medicaid/Bankruptcy) are historic positioning examples, **not** a V3 restriction; general-purpose grocery analyses are also in scope.

## Historical references (do not treat as binding V3 code plan)

- `reference/HIVE-ARCHITECTURE-V2-PROPOSED.md`: prior proposed architecture; domain-agnostic core and source validation invariants remain relevant.
- `reference/AGENTIC-PLAN.md`: historical agent execution plan and project reasoning.
- `reference/REPO-MAP.md`: historic V2 code organization and phase map.
- `reference/NEXT.md`: prior phase tracker, not V3's active backlog.
- `reference/V3-EARLIER-ARCHITECTURE-DRAFT.md`: first V3 proposal, superseded **for discussion** by the current `docs/ARCHITECTURE.md`; retained to compare tradeoffs.
- `reference/V3-REQUIREMENTS-v0.1.md`: earlier V3 draft (not on disk in v3); superseded by `docs/PRODUCT-REQUIREMENTS.md` when present.
- `docs/HIVEFORYOU-V3-V2-REUSE-INVENTORY.md`: P0.3 verified V2→V3 Milestone 1 reuse tags.
- `docs/HIVEFORYOU-V3-SCREEN-ADOPTION-MATRIX-PROPOSED.md`: Milestone 1 screen/routes (approved with P0.3).
- `reference/prototype/`: read-only HTML prototype exports; full asset bundle in V2 `design-reference/claude-prototype/`.

## Project instructions for future implementation

- Requirements before code. No implementation without explicit approval.
- Hive Core stays domain-agnostic; Domain Packs remain optional and specialized.
- One Hive, one evolving Canonical Study; multiple intents/results.
- One verifiable UI-to-study execution path, no alternative shadow system as an MVP prerequisite.
- Preserve source evidence, uncertainty, older results and attribution.
- Test L001 and a pack-free grocery intent before claiming V3 works.
- Keep legacy materials read-only and do not rewrite branding by inference.
