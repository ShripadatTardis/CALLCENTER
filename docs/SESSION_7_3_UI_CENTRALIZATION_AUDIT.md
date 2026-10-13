# Session 7.3 — UI Centralization & KATON Design Standards Audit

**Mode: READ-ONLY.** No code, configuration, dependency, or deployment changes were made while producing this document. This is an architecture and code audit only.

**Methodology note:** the Call Centre side of this audit (Tasks 2–3) was performed by a dedicated read-only investigation pass over the current repository (not historical session summaries), using `grep`/file reads with explicit denominators stated per finding. The KATON side (Task 1) was first drafted from three screenshots, which turned out to be an incomplete capture of page `12.1 Foundations: type, colour, spacing` (the Colour/Spacing sections and 3 of 9 type-ramp rows were below the screenshot's scroll fold). The user then supplied the complete KATON prototype pages as three `.mhtml` archives (full page source, not a viewport capture); this revision decodes those archives (quoted-printable → HTML → stripped text, with inline style/hex values preserved) and replaces every previously-UNKNOWN field below with the real value found in the source. Every value in §B is now sourced from the `.mhtml` archives unless explicitly marked otherwise.

---

## A. Executive findings and centralization maturity assessment

The Call Centre application has a **real but narrow** centralization layer, and a **large, consistent gap** between what that layer offers and what individual screens actually use.

1. **The foundation is sound.** `tailwind.config.ts` + `src/index.css` give one genuine source of truth for neutral/primary/destructive color roles (19 CSS custom properties, light + dark), and the shadcn/Radix primitive library in `src/components/ui/` (47 components) is itself clean — every spot-checked primitive consumes those tokens exclusively, with zero hardcoded hex/rgb found. `Button` and `Badge` already have documented `cva` variant systems, and `Badge` specifically already ships `positive`/`warning`/`escalated` semantic variants built for exactly this kind of status-color need (`docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md`, Session 11.1).
2. **Adoption of that foundation is the actual problem, not its absence.** Of 54 files that render a status/classification color outside `components/ui`, only 3 (one feature, Session 15) use Badge's built-in semantic variants. The remaining 51 — including this project's newest code (`QaCalibration.tsx`, committed this week) — hand-type their own `border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400`-style class strings per page. Changing "what green means" today requires editing dozens of files, not one.
3. **Two foundational layers are simply missing**, not just under-adopted: there is **no success/warning/info CSS token** (only `--primary`/`--destructive`/neutral exist) and **no typography or spacing scale** defined in Tailwind config at all — font sizes are 312 hand-typed arbitrary-pixel values (`text-[11px]` etc.) across 37 files, consistent by convention but not by mechanism.
4. **Tables are the weakest structural area**: the shared `Table` primitive is used by 4 of 16 pages with tabular UI; the other 12 hand-roll `<table>`/`<thead>`/`<tr>` with page-local header/row classes.
5. **KATON's actual design language, now confirmed from the full source, is deliberately quieter and more Tailwind-default-leaning than Call Centre's current styling**: 8 of KATON's 9 type-ramp sizes are stock Tailwind classes (only 13px is custom), its spacing scale is Tailwind's own default steps, and its status colors are muted/low-chroma (`#A33A2F` rejected, `#8A5A0B` attention) rather than saturated defaults — versus Call Centre's 312 arbitrary-pixel type sizes (including sizes as small as 9–10px, below KATON's 13px floor) and un-matched saturated Tailwind palette classes (`red-600`, `amber-500`, etc.) for status color. The gap here is not "KATON needs features Call Centre lacks" so much as "Call Centre has drifted into more custom, denser, more saturated styling than a disciplined Tailwind-defaults approach — closing the gap is as much about *removing* custom values as adding new tokens (§H Phase 5, §I).
6. **Net effect**: the architecture is **PARTIALLY CENTRALIZED, trending decentralized at the page level** — closer to "a design system exists and is bypassed" than "no design system exists." This is a materially better starting position for a KATON dual-skin than a greenfield decentralized codebase would be (see §G), but it means the real work is *consolidation and adoption*, not *invention* of new tokens/components in most categories.

---

## B. KATON design-element inventory (Task 1)

Transcribed from the three KATON `.mhtml` source pages (superseding the initial screenshot-only draft — see Methodology note above). Any field still absent from the full page source is marked **UNKNOWN** — not inferred, not assumed to match Tailwind defaults even where the source's own caption says "values not shown here are Tailwind defaults" (that caption describes KATON's own documentation convention, not something this audit independently verified beyond what the source pages themselves enumerate).

### B.1 Typefaces (12.1)

| Role | Family | Notes |
|---|---|---|
| Interface | **Roboto** | Apache 2.0 licence, release 2.138, bundled with the application. Weights 400, 500, 700 (600 uses Medium). Tabular figures everywhere. |
| Book and learning objects | **Roboto Slab** | Apache 2.0 licence, bundled. Used only for text that comes from the book (i.e. content-sourced text, not UI chrome). |

### B.2 Type ramp (12.1) — complete (corrected)

Caption: *"Nine sizes. Only 13 px is a custom token; the rest are Tailwind defaults."* All nine rows, confirmed from the full page source:

| Size / line | Weight | Tailwind class | Used for |
|---|---|---|---|
| 13 / 18 | 400 | `text-xs` | Metadata, timestamps, tags |
| 14 / 20 | 400 | `text-sm` | Tables, form fields, dense body |
| 14 / 20 | 500 | `text-sm font-medium` | Buttons, labels, table headers, tabs |
| 16 / 24 | 400 | `text-base` | Explanations, notices, form help |
| 16 / 26 | 400 | `text-base font-book` | Book pages and learning objects (Roboto Slab body text — `font-book` is a custom font-family utility, confirming Roboto Slab is applied via a dedicated class, not inline styling) |
| 18 / 26 | 600 | `text-lg` | Panel headings |
| 20 / 28 | 600 | `text-xl` | Section title, focused views |
| 24 / 32 | 600 | `text-2xl` | Page titles |
| 30 / 36 | 600 | `text-3xl` | Report figures |

Only **13px** (`text-xs`) is the one genuine custom token — every other row maps onto a stock Tailwind class name at Tailwind's own default size for that step. This is a materially useful finding for §H/Phase 5: KATON's ramp is almost entirely "use Tailwind's defaults, don't invent," which is the *opposite* problem from Call Centre's 312 arbitrary-pixel values — remediation is about **removing** Call Centre's custom values to converge on stock classes, not building a new scale from nothing.

### B.3 Colour (12.1) — complete (corrected)

Full token table, with exact hex values and (where stated) contrast ratios, from the KATON source:

**Brand and action colours**

| Role | Hex | Used for | Contrast note |
|---|---|---|---|
| Katon navy | `#121B54` | Top bar, headings | — |
| Katon blue | `#0C8FD9` | Accents only | 3.5:1 — "never small text" (explicit KATON usage restriction) |
| Action | `#0A67C7` | Buttons, links | 5.6:1 on white |
| Action pressed | `#095DB5` | Pressed state | — |
| Selected | `#C0DDEE` | Current row or tab | — |
| Highlight | `#E6F3FB` | Source passage | — |

**Neutrals**

| Role | Hex | Used for | Contrast note |
|---|---|---|---|
| Ground | `#EEF3F7` | Page background | — |
| Subtle | `#F7F9FB` | Table headers, panels | — |
| Divider | `#EDF1F5` | Inside panels | — |
| Border | `#D5DFE8` | Panel edges | — |
| Field border | `#7E89A2` | Inputs | 3.5:1 on white |
| Secondary text | `#4F5878` | Labels and help | 7.4:1 on white |

**Status colours** — note KATON pairs each status with a separate, lighter **fill** color meant to sit *behind* text in that status, rather than reusing the text color at reduced opacity:

| Role | Hex | Used for |
|---|---|---|
| Confirmed | `#2E6B3F` | Approved, signed |
| Confirmed fill | `#E3F0E6` | Behind confirmed text |
| Rejected | `#A33A2F` | Rejected, danger |
| Rejected fill | `#F6E3E1` | Behind rejected text |
| Attention | `#8A5A0B` | Needs a decision |
| Attention fill | `#FDF1DC` | Behind attention text |

Note KATON's naming: there is no literal "Success"/"Warning"/"Error" role name — the closest equivalents are **Confirmed** (≈ success), **Attention** (≈ warning — "needs a decision," not necessarily an error), and **Rejected** (≈ error/danger, explicitly also labeled "danger" in the source). This is a meaningfully different semantic framing than the generic success/warning/error triad assumed in the first draft of this audit (§F below is corrected accordingly) — KATON's vocabulary is oriented around a *review/moderation workflow* (confirmed/rejected/attention), not generic UI feedback polarity.

**Previously-inferred colors, now confirmed exact**: the first draft of this audit inferred "navy/red/green/amber/gray" roles purely from rendered screenshots. The real hex values above confirm those inferences were directionally correct but refines them precisely — e.g. "Danger" is `#A33A2F` (a muted brick-red, not a saturated red), "Warning/Attention" is `#8A5A0B` (a dark gold/brown, not bright amber), both deliberately muted/low-chroma relative to typical default Tailwind `red-600`/`amber-500` — a real design decision Call Centre's current hand-typed `red-`/`amber-` Tailwind classes do not match and should not be assumed equivalent to.

### B.4 Spacing, borders, radii, surfaces, heights, icons, shadow (12.1) — complete (corrected)

**Spacing** — caption: *"Tailwind steps in px."* Scale: **4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48px** — this is exactly Tailwind's own default spacing scale (4px increments at the low end, matching `space-1`=4px through roughly `space-12`=48px), confirming KATON spacing is "use Tailwind defaults," not a custom scale — directly consistent with Call Centre's own near-zero arbitrary-spacing finding (§E.6) being already compatible.

**Corners and borders (radii)**:

| Radius | Used for |
|---|---|
| 4px | Tags |
| 6px | Buttons, fields |
| 8px | Panels |
| 10px | Cards |
| full (pill) | — (implied: pill-shaped controls, e.g. the segmented toggle in 12.2) |

**Borders**: 1px solid on panels and fields; 2px around the pane in focus (i.e. the double-ring focus treatment observed in 12.2 is specifically a 2px border, not a box-shadow ring); 1px **dashed** specifically for "ready to assign" (section-stage 3) and "system-added content" (the "Added by the system" tag) — confirming §B.8/B.9's observation that dashed-border is a deliberate, reused semantic marker for "not yet human-confirmed," not a one-off.

**Control heights**:

| Element | Height |
|---|---|
| Primary task action | 44px |
| Everything else (buttons) | 36px |
| Field in a form | 40px |
| Field in a filter bar | 36px |
| Top bar | 56px |
| Side navigation (width) | 224px |

**Icons**: Lucide icon set, ISC licence, stroke width 1.75, round caps. Sizes: 14, 16, 18, 20, 24px — 20px is the default; 14–16px specifically inside buttons and table headers. **Lucide is already the exact icon library this codebase uses** (`lucide-react`, confirmed throughout every page audited in this session and prior sessions) — this is a zero-migration-cost match, worth calling out explicitly since it's one of the only KATON foundations requiring no change at all.

**Shadow**: one shadow only, used on menus, panels-over-content, and page previews; everything else is flat (no shadow). No elevation/shadow scale beyond this single value.

### B.5 Buttons — variants and states (12.2)

**Variants**: Primary (filled, navy), Secondary (outlined, navy border/text), Quiet (plain/ghost, minimal border), Danger (outlined, red/orange).

**States**, shown identically across all four variants: Default, Hover (slightly deepened fill/border), Focus (a distinct double-ring focus indicator in dark navy around the button, additive to whatever the variant's own border is), Pressed (deepened fill, visually close to Hover), Disabled (desaturated/reduced-opacity, text and border both faded), Busy (spinner icon + "Saving" label, same base color as the variant — i.e. Busy is a content-replacement state, not a separate color).

### B.6 Form fields — variants and states (12.2)

Default (placeholder text, light gray, thin border), Focus (blue/navy border highlight, visible text cursor), Filled (black text, same border as default), Error (red border, red input text, plus a separate error-message line below the field with a warning icon: *"Enter a full email address"*), Disabled (grayed background, placeholder-style "Not editable" text, border de-emphasized or removed).

### B.7 Selection controls, tabs (12.2)

- **Checkboxes**: Unticked (empty box, gray border), Ticked (solid dark-navy fill, white checkmark), Disabled (grayed box, no interaction affordance).
- **Segmented/pill toggle**: shown as two example pills — "Not faithful to the book" (solid navy fill, selected state) and "Duplicate" (outline only, unselected state). Confirmed complete from the full page source (the Selection section ends immediately after these two examples, before the page's own nav footer) — KATON's documented example genuinely shows only these two states, not a truncation artifact.
- **Tabs**: "Current tab" (bold dark text, underline indicator) vs "Other tab" (plain gray text, no underline). Confirmed complete, same basis as above — no further tab state exists in the source.

### B.8 Tags / badges / status indicators (12.3)

Seven example tags shown, each a distinct visual treatment rather than one component with a color prop alone:
- **Suggested** — neutral gray outline.
- **Confirmed** — green outline.
- **Corrected** — blue outline.
- **Rejected** — red/pink outline.
- **"From the book"** — solid black border, bold text (a provenance marker, distinct from the status tags).
- **"Added by the system"** — dashed border outline (a second provenance marker, using line-style rather than color to carry meaning).
- **"Needs a new look"** — amber/yellow fill or outline (a flagged/needs-attention state).

This is a **richer tag vocabulary than Badge's current 3-variant semantic set** (`positive`/`warning`/`escalated`) — KATON additionally encodes *provenance* (from-the-book vs added-by-system) via border style (solid vs dashed) rather than color, which the current `Badge` component has no equivalent mechanism for (see §F).

### B.9 Progress / workflow stages (12.3)

A 6-step numbered stage indicator, caption: *"Processing, passages to resolve, ready to assign (dashed), with moderator, signed and packaged (ticked)."*

| Step | Visual | Meaning |
|---|---|---|
| 1 | Plain gray number | Processing |
| 2 | Amber/orange outline | Passages to resolve |
| 3 | Dashed green border | Ready to assign |
| 4 | Blue outline, "AO" initials | With moderator |
| 5 | Green filled, checkmark + "AO" | Signed |
| 6 | Green filled, checkmark + "AO" | Signed and packaged (the source caption — *"...with moderator, signed and packaged (ticked)"* — maps its 5 comma-separated phrases onto 6 numbered stages by treating 5 and 6 as two sequential sub-states, "signed" then "packaged," sharing one visual treatment; no further independent distinction between them is documented) |

Encodes stage via a combination of color, border style (solid/dashed), an icon (checkmark), and inline initials — not color alone.

### B.10 Feedback — success, warning, error (12.3)

Three banner/toast examples, each pairing a colored background, a leading icon, and a two-part message (bold lead sentence + plain-text follow-up):
- **Success** (green background, checkmark icon): *"**Correction saved.** The next object is open."*
- **Warning** (amber background, warning-triangle/circle icon): *"**3 passages have no learning object.** Check them before signing."*
- **Error** (red/pink background, warning icon): *"**Signing failed.** Nothing was lost. Try again, or tell your operator."*

### B.11 Tables — headers, rows, selection, loading (12.3)

- **Header row**: sortable columns indicated with a sort-direction icon (e.g. "Due ↑", currently sorted ascending); "Section" and "Objects" show an unselected sort affordance (double-arrow icon).
- **Row states**: Default (plain white/background row), Hover (light gray/blue background), Selected (light blue background, visually distinct from hover — a persistent rather than transient highlight), Loading (skeleton/shimmer placeholder bars in place of cell text, shown per-column with a shorter bar for narrower columns).
- Example data columns: Section (text), Objects (numeric), Due (date) — not itself a KATON specification, just the screenshot's sample content.

### B.12 Other identifiable elements

- Top app bar: product mark ("KATON | Curriculum"), a save-status indicator ("All work saved" with a cloud/sync icon), and a user menu (avatar initials + name + role, "Abena Owusu / Moderator").
- Bottom-left persistent navigation strip: "All screens" button + prev/next arrows + current-screen label — this is KATON's own documentation-tool chrome, not part of the design system being documented, and is excluded from the inventory above.

---

## C. Existing central configuration points and file references (Task 2)

| Configuration point | File | What it controls | Coverage |
|---|---|---|---|
| Color tokens | `tailwind.config.ts` (`theme.extend.colors`) + `src/index.css` (`:root` / `.dark`, lines 8–92) | 19 semantic HSL custom properties: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, plus 7 `--sidebar-*` tokens. Both light and dark values defined. | Centralized for the roles it covers; **no success/warning/info role exists**. |
| Border radius | `tailwind.config.ts` (`theme.extend.borderRadius`) | 3 tokens derived from `--radius` | Centralized. |
| Typography scale | — (absent) | Nothing — no `fontSize`/`fontFamily`/`fontWeight`/`lineHeight` extension exists in `tailwind.config.ts` | **Absent as a mechanism** (consistent by convention only — see §E). |
| Spacing scale | — (absent, Tailwind defaults used as-is) | Stock Tailwind spacing scale, unextended | Centralized **by convention** (negligible arbitrary-value usage, see §E) — not because a custom scale was defined, but because the default scale is consistently used. |
| Shared UI primitives | `src/components/ui/*` (47 files: button, badge, input, select, dialog, table, tabs, tooltip, checkbox, alert, etc.) | Every primitive consumes the token layer above exclusively — confirmed zero hardcoded hex/rgb in the files spot-checked (`table.tsx`, `tooltip.tsx`, `tabs.tsx`, `alert.tsx`, `button.tsx`, `badge.tsx`, `select.tsx`, `dialog.tsx`, `input.tsx`). | Centralized. |
| Button variants | `src/components/ui/button.tsx` (`cva`) | `variant`: `default\|destructive\|outline\|secondary\|ghost\|link`; `size`: `default\|sm\|xs\|lg\|icon`. The `xs` size's own code comment documents a prior, deliberate centralization effort: *"VoiceForce design system (Phase 2B)... formalizes the dense operational button height that was already in de facto use as a bespoke `h-7` override on ~10+ pages."* | Centralized mechanism; **partial adoption** (24 of 37 pages import it — see §E). |
| Badge variants | `src/components/ui/badge.tsx` (`cva`) | `variant`: `default\|secondary\|destructive\|outline` **plus three semantic status variants: `positive`\|`warning`\|`escalated`**, per `docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md` (Session 11.1 — *"corporate semantic status language... reserving `destructive`... for genuine technical failure... only"*). | Centralized mechanism; **adoption is the clearest gap found in this audit** — only 3 of 54 status-color-bearing files use it (§E). |
| One-off status-color map | `src/lib/automatedQaStatusBadge.ts` | A single `Record<status, string>` of Tailwind classes, 2 consumers (`AutomatedQaInspector.tsx`, `AutomatedQaPanel.tsx`) | A real but isolated, feature-local centralization — not reused elsewhere, and itself duplicates what `Badge`'s variants already do. |
| Layout/chrome | `src/components/layout/Layout.tsx` | App shell every authenticated page renders inside | Centralized — 34 of 37 top-level pages import it; the 3 exceptions (`Index.tsx`, `ResetPassword.tsx`, `WhatsAppAuthenticate.tsx`) are legitimately standalone pre-auth screens, not a gap. |
| Sidebar navigation | `src/components/layout/pillarNav.ts` | The seven-pillar nav structure | Centralized — single file; confirmed directly this session (adding "QA Calibration" required exactly one edit here). |
| Error banner | `src/components/common/QueryErrorBanner.tsx` | A shared fetch-error display | Partially centralized — reused by 10 of 37 pages (mostly earlier-session "operational data" pages: `CallLogs`, `CampaignDetailPage`, `ChatLogs`, `CustomerDetail`, `Customers`, `Dashboard`, `InitiateCall`, `LiveView`, `OutboundCampaigns`, `QAReview`); newer admin/QA-era pages were not wired to it. |
| Shared Table primitive | `src/components/ui/table.tsx` | Styled `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>` wrappers | Weakly adopted — 4 of 16 pages with any tabular UI (`AgentDetail.tsx`, `AIAgents.tsx`, `LiveView.tsx`, `QAReview.tsx`); the other 12 hand-roll raw markup. |
| Shared Alert component | `src/components/ui/alert.tsx` | `default`/`destructive` banner styling | Scoped adoption — 7 files, concentrated in auth/form-validation flows; **no `warning`/`success` Alert variant exists** today. |

---

## D. Screen-by-screen centralization coverage (Task 3)

Exhaustively re-verifying every one of the 37 top-level pages against every one of the ~10 KATON element categories individually (≈370 cells) was not performed as a literal cell-by-cell manual pass; that scale of verification was instead done **in aggregate** (§E's file-count evidence, denominators stated). What follows is a representative matrix across pages spanning old and new sessions and multiple pillars, each cell backed by the specific evidence already cited in §C/§E rather than estimated.

Legend: ✅ uses the shared mechanism · ⚠️ partial/local-override · ❌ bypasses entirely (hand-rolled) · — not applicable to this screen.

| Screen | Layout/nav | Buttons (shared `Button`) | Tables | Status/badge color | Error feedback |
|---|---|---|---|---|---|
| `Dashboard.tsx` | ✅ | ⚠️ (mixed `Button` + raw buttons) | — | ⚠️ | ✅ `QueryErrorBanner` |
| `CallLogs.tsx` | ✅ | ⚠️ | ❌ hand-rolled | ⚠️ | ✅ `QueryErrorBanner` |
| `QAReview.tsx` | ✅ | ⚠️ | ✅ shared `Table` | ⚠️ (own `Badge` usage mixed with ad hoc classes) | ✅ `QueryErrorBanner` |
| `AutomatedQaInspector.tsx` | ✅ | ⚠️ | ❌ hand-rolled | ❌ own `AUTOMATED_QA_STATUS_BADGE` map, not `Badge` variants | ❌ hand-rolled red div, not `Alert` |
| `QaCalibration.tsx` (this session, newest) | ✅ | ⚠️ (many raw `<button type="button">`, e.g. `PairListItem`, tab-adjacent filter triggers) | ❌ hand-rolled matrix/insight tables | ❌ own `CLASSIFICATION_BADGE` map, not `Badge` variants | — (no error-fetch banner used) |
| `AgentDetail.tsx` | ✅ | ⚠️ | ✅ shared `Table` | ⚠️ | — |
| `ActionRequired.tsx` / `ActionItemDetailDialog.tsx` / `ActionRequiredCard.tsx` | ✅ | ⚠️ | — | ✅ **the only `Badge` `positive`/`warning`/`escalated` consumers found** | — |
| `UserManagement.tsx` | ✅ | ⚠️ | ❌ hand-rolled | ⚠️ | — |
| `RoleManagement.tsx` | ✅ | ⚠️ | ❌ hand-rolled | ⚠️ | — |
| `Analytics.tsx` | ✅ | ⚠️ | — | — | — |
| `ResetPassword.tsx` | — (standalone by design) | ✅ | — | — | ✅ `Alert` |

**Aggregate denominators behind the ⚠️/❌ pattern above** (full population, not sampled):

| Metric | Count | Denominator | Method |
|---|---|---|---|
| Pages importing shared `Button` | 24 | 37 page files | `grep -rl "from '@/components/ui/button'" src/pages/` |
| Raw `<button type="...">` elements across pages | 32 occurrences | — | `grep -rc "type=\"button\""` summed across `src/pages/*.tsx` |
| Pages importing shared `Input` | 13 | 37 page files | `grep -rl "from '@/components/ui/input'" src/pages/` |
| Pages importing shared `Checkbox` | 1 | 37 page files | `grep -rl "from '@/components/ui/checkbox'" src/pages/` |
| Pages importing shared `Tabs` | 4 | 37 page files | `grep -rl "from '@/components/ui/tabs'" src/pages/` |
| Pages using shared `Table` | 4 | 16 pages with any tabular UI | manual file identification, confirmed by fork investigation |
| Files with raw status-color classes outside `components/ui` | 54 | 221 total `.tsx` files | `grep -rlE "emerald-[0-9]|amber-[0-9]|red-[0-9]"`, excluding `src/components/ui/*` |
| Of those, using `Badge`'s semantic variants | 3 | same 54-file population | manual confirmation (`ActionRequired*` files only) |
| Arbitrary `text-[Npx]` occurrences / distinct values / files | 312 / 8 / 37 | 221 total `.tsx` files | `grep -rohE "text-\[[0-9]+px\]"` |
| Arbitrary pixel spacing occurrences | 3 | 221 total `.tsx` files | `grep -rohE` for `[pmg]-\[[0-9]+px\]` patterns |
| Pages using `QueryErrorBanner` | 10 | 37 pages | `grep -rl` |
| Files using `Alert` | 7 | 221 total `.tsx` files | `grep -rl`, concentrated in auth/forms |

**What "Buttons" ⚠️ means in practice**: every page that imports `Button` at all gets its variant styling for free from the centralized `cva` definition (confirmed zero per-page overrides of `Button`'s own internals) — the ⚠️ marks pages that *also* contain raw `<button>` elements for secondary/inline actions (filter chips, row-click targets, icon-only triggers) that bypass the shared component and its Focus/Disabled/Busy state handling entirely. This is the single most consistent per-page pattern found: **every page sampled mixes both approaches**, never purely one or the other.

---

## E. Hardcoded styling and duplication findings

Consolidated from §C/§D's evidence, stated once here as the findings record:

1. **Status color duplication (most significant finding)**: 51 of 54 files that render a status/classification color do so via a locally-defined, hand-typed Tailwind class string rather than `Badge`'s existing `positive`/`warning`/`escalated` variants. The pattern repeats near-verbatim across files — e.g. `QaCalibration.tsx`'s `CLASSIFICATION_BADGE` constant and `AutomatedQaInspector.tsx`'s imported-but-separate `AUTOMATED_QA_STATUS_BADGE` both independently encode "green border + green text, light/dark pair" for a positive state, in different files, with different exact class strings.
2. **Typography has no mechanism, only convention**: 312 arbitrary-pixel `text-[Npx]` occurrences across 37 files, using 8 distinct values consistently enough that a de facto scale clearly exists in practice — but nothing defines it centrally, so KATON's "13px is a custom token, rest are Tailwind defaults" model has no direct equivalent to migrate onto; Call Centre would need to introduce the scale as a first step (§H).
3. **Tables are the most-bypassed structural component**: 12 of 16 tabular pages hand-roll markup, each with its own header-row class string (`h-7 bg-card text-[10px] uppercase tracking-wide text-muted-foreground` appears, hand-typed, in both `QaCalibration.tsx` and `AutomatedQaInspector.tsx` — two different files independently typing the identical class string).
4. **Error/feedback presentation is split 3 ways**: `QueryErrorBanner` (10 pages), `Alert` component (7 files, auth-scoped), and ad hoc inline `<div className="rounded-md border border-red-500/40 bg-red-500/10 p-3">`-style banners (at least `AutomatedQaInspector.tsx`, confirmed directly) — three different error-presentation mechanisms live in the same codebase simultaneously.
5. **No duplication found in the primitive layer itself** — `src/components/ui/*` was the one area with zero hardcoded-value findings across every file spot-checked.
6. **Spacing is a non-issue** — only 3 arbitrary-pixel spacing occurrences exist in the entire codebase; this axis does not need remediation.

---

## F. KATON compatibility / gap matrix

| KATON element (§B) | Call Centre equivalent exists? | Centrally controlled? | Gap to close |
|---|---|---|---|
| Roboto (interface) / Roboto Slab (book content, via a `font-book` utility class) | Partial — no font-family token found in `tailwind.config.ts` during this audit (confirmed no `fontFamily` extension under `theme.extend`); Call Centre has no "book content" concept at all (it displays transcripts/call data, not book passages) | Absent | Need to add a `fontFamily` token (Roboto as the interface family — confirm it's not already the system default being relied on implicitly). KATON's "book" role has no Call Centre analog and would not be adopted; "interface" is the only relevant role. |
| Nine-size type ramp — confirmed complete: 13/18 `text-xs`, 14/20 `text-sm`, 14/20·500 `text-sm font-medium`, 16/24 `text-base`, 16/26 `text-base font-book`, 18/26 `text-lg`, 20/28 `text-xl`, 24/32 `text-2xl`, 30/36 `text-3xl` — 8 of 9 are literally stock Tailwind defaults, only 13px is custom | Call Centre's 312 observed arbitrary-pixel occurrences (8 distinct values, none matching KATON's ramp exactly) are a *different, undocumented* scale | Absent (mechanism), present (convention) | Define the type-scale token (in practice: adopt stock Tailwind size classes directly per KATON's own approach, plus one custom `text-xs`-at-13px override); remap the 312 existing arbitrary-pixel call sites onto it. Call Centre's current smallest sizes (9/10/11px) are *below* KATON's 13px floor — this is a real density mismatch to resolve explicitly (see §I), not just a mechanical class swap. |
| Colour roles — KATON uses **Confirmed** (`#2E6B3F`/fill `#E3F0E6`), **Attention** (`#8A5A0B`/fill `#FDF1DC`), **Rejected** (`#A33A2F`/fill `#F6E3E1`), plus **Katon navy** `#121B54` / **Katon blue** `#0C8FD9` / **Action** `#0A67C7` / **Action pressed** `#095DB5` / **Selected** `#C0DDEE` / **Highlight** `#E6F3FB`, and 6 neutral steps (`#EEF3F7`→`#4F5878`) | `--destructive` exists (generic) but is not color-matched to KATON's `#A33A2F` Rejected tone; Call Centre has **no success/warning/info tokens at all**, and no fill/background-behind-text companion color for any status (KATON's two-tone text+fill pairing has no Call Centre equivalent — current status colors use one color at two opacities via Tailwind's `/10` modifier, not a true second design token) | Partially (Danger-equivalent only, and not color-matched) | Add `--confirmed`/`--attention`/`--rejected` (or success/warning/danger-named equivalents) **as exact-hex-matched** CSS custom properties, each with its own fill companion token, light+dark; then point `Badge`/`Alert` variants at them. Also add the brand/action blue scale (`--katon-navy`/`--katon-blue`/`--action`/`--action-pressed`/`--selected`/`--highlight`) alongside the existing `--primary` if KATON's exact brand palette (not just its role structure) is the target. |
| Button variants (Primary/Secondary/Quiet/Danger) × states (Default/Hover/Focus/Pressed/Disabled/Busy) | Close match — `Button`'s `variant` prop (`default/destructive/outline/secondary/ghost/link`) covers the same shapes (`default`≈Primary, `outline`≈Secondary, `ghost`≈Quiet, `destructive`≈Danger); Hover/Disabled exist via Tailwind/Radix state variants; **Busy (spinner+label content swap) and the distinct double-ring Focus treatment were not confirmed present** in `button.tsx` during this audit | Centralized mechanism, states need verification/possibly addition | Confirm/add a `loading`/`busy` prop to `Button` (content swap + spinner) if absent; confirm the Focus ring visually matches KATON's double-ring style or adjust `--ring`. |
| Form field states (Default/Focus/Filled/Error/Disabled) | `Input` primitive exists and is token-driven; Error state (red border + below-field message) was not confirmed as a built-in `Input` feature vs. something each form implements itself | Centralized mechanism (styling), Error-state wiring unconfirmed | Confirm whether `Input`/`Form` (both exist in `components/ui`) already expose an error/validation-message pattern; if not, this is the clearest "build once, reuse everywhere" opportunity given only 13/37 pages currently import `Input` at all. |
| Checkboxes, segmented pills, tabs | `Checkbox` and `Tabs` primitives exist; segmented-pill toggle has **no obvious Call Centre equivalent component** (Call Centre's filter chips in `QaCalibration.tsx`/`QAReview.tsx` use `Select` dropdowns, not pill toggles) | Partial | Pill-toggle is a net-new component if KATON's exact interaction is required; Checkbox/Tabs adoption is low (1 and 4 pages respectively) regardless of the component existing. |
| Tags with provenance encoding (solid/dashed border, not just color) | **No equivalent** — `Badge`'s variant system is color-only; no Call Centre component encodes meaning via border-style (solid vs dashed) | Absent | Net-new `Badge` variant(s) or a border-style prop; genuinely new design-system surface, not just adoption. |
| 6-step workflow/progress stage indicator (color + border-style + icon + inline text combined) | **No equivalent found.** Call Centre has status pipelines (e.g. campaign target status, action-item status) rendered as plain `Badge`s, never as a connected multi-step stage track | Absent | Net-new component — the single largest genuinely new build identified in this audit, not a reuse/adoption question. |
| Feedback banners (success/warning/error, icon + bold-lead + detail text) | `Alert` exists (`default`/`destructive` only — no `success`/`warning`), `QueryErrorBanner` exists (error-only) | Partial | Extend `Alert` with `success`/`warning` variants (straightforward once the color tokens from above exist); the bold-lead/detail-text two-part message structure was not confirmed present in current `Alert` usage and may need a content convention, not a code change. |
| Table rows with Default/Hover/Selected/Loading states, sortable headers | `Table` primitive exists; sortable-header affordance and a distinct (non-hover) Selected row state were not confirmed present in `table.tsx` itself during this audit — likely implemented per-page where they exist at all, given only 4/37 pages use `Table` to begin with | Mechanism partial, adoption weak | Confirm/add sort-indicator and selected-row styling to the shared `Table` (or a `DataTable` wrapper around it); this compounds with the pre-existing 12-page table-bypass problem (§E.3) — centralizing the component is necessary but not sufficient without also migrating those 12 pages onto it. |

---

## G. Dual-skin architectural feasibility (Task 4)

**Verdict: feasible for the token/variant layer, not feasible for Skin B without first doing the consolidation work in §H — the gap is adoption and a handful of missing primitives, not architecture.**

Reasoning:

- **Where it already works**: because `src/components/ui/*` primitives consume CSS custom properties exclusively (confirmed, §C), any page that genuinely uses `Button`, `Badge`, `Input`, `Select`, `Dialog`, `Tooltip`, `Table`, `Tabs`, `Alert` as components (not as a source of inline class strings to copy) would skin correctly today by swapping the `:root`/`.dark` CSS variable values alone — no component code change needed for those call sites. This is true dual-skin-via-tokens, and the 24/37-page `Button` adoption and 4/16-page `Table` adoption represent the *already-skinnable* surface.
- **Where it breaks**: every hand-typed `border-emerald-600 text-emerald-700` (and the 300+ sibling patterns found in §E) is a hardcoded reference to a specific Tailwind palette step, not a CSS variable — a token swap does nothing to these call sites, because they never referenced a token to begin with. The same is true for the 12 hand-rolled tables and the 312 arbitrary type-scale values (though the latter are typically size-only, not color, so they're a Skin-B *typography-mismatch* risk rather than a broken-skin risk — a KATON skin with a different 13px-anchored ramp would render Call Centre's screens with visually-inconsistent but not broken text).
- **Net-new components required regardless of skinning approach** (§F): the solid/dashed provenance-tag mechanism and the 6-step workflow-stage indicator have no Call Centre equivalent today and would need to be built once, then used by both skins — these are not a "Skin B exception requiring refactoring" so much as genuinely new design-system surface neither skin currently has.
- **No business logic or screen duplication is implied by any of the above** — every finding in this audit is about *which class strings/components render a given piece of already-correct data*, never about the data-fetching, authorization, or workflow logic those screens contain. A token/variant-based dual-skin, once the consolidation in §H is done, changes zero `.ts` logic files, only `.tsx` presentation and `src/index.css`/`tailwind.config.ts`.

**Exceptions requiring actual component-level refactoring** (not just token changes), in order of how much of the codebase they touch:
1. The 51 files with hand-typed status colors (§E.1) — each needs its local color map replaced with `Badge` variant usage (or the variant set extended if KATON's 7-tag vocabulary doesn't map cleanly onto 3 variants).
2. The 12 hand-rolled tables (§E.3) — each needs migration onto the shared `Table` (or a new `DataTable` wrapper, if sort/select/loading states are added there per §F).
3. The 32 raw `<button type="button">` call sites found in pages that *also* import `Button` elsewhere (§D) — lower risk individually but numerous.
4. Whatever forms currently implement their own error-message-below-field pattern outside `Input`/`Form`'s built-in handling (not quantified in this audit — would need a follow-up pass specifically on form-validation call sites).

---

## H. Recommended remediation sequence (Task 5)

Ordered by dependency (each phase is a prerequisite for the next being low-risk), with complexity/regression-risk classification per item.

### Phase 1 — Close the missing token gaps (Low complexity, Low regression risk)
- Add `--success`/`--warning`/`--info` CSS custom properties to `src/index.css` (`:root` + `.dark`), following the exact existing pattern for the 19 current tokens.
- Define an explicit typography scale in `tailwind.config.ts`'s `theme.extend.fontSize` (even if it simply codifies the 8 already-observed arbitrary values as named steps first, before any KATON remapping) and a `fontFamily` token if Roboto/Roboto Slab equivalents are to be adopted.
- *Risk*: near zero — these are additive; nothing currently references tokens that don't exist yet, so nothing breaks by adding new ones.

### Phase 2 — Extend existing primitives to cover the confirmed gaps (Low–Medium complexity, Low regression risk)
- Extend `Badge` with whatever additional variant(s) are needed to reach KATON's 7-tag vocabulary (color-based variants are a direct extension of the existing `cva` pattern; the solid/dashed border-style axis is new).
- Extend `Alert` with `success`/`warning` variants once Phase 1's tokens exist.
- Confirm/add a `loading`/`busy` prop to `Button` if not already present.
- Confirm/add Error-state wiring (border + below-field message) to `Input`/`Form` if not already present.
- *Risk*: low — these are additive changes to shared components; existing variant usages are unaffected as long as new variants don't change any default prop value.

### Phase 3 — Consolidate the 51-file status-color duplication (Medium complexity, Medium regression risk)
- Migrate each of the 51 hand-typed status-color call sites onto `Badge`'s variants (post-Phase-2 extension).
- *Risk*: medium — this is a mechanical but wide-reaching find-and-replace across 51 files; regression risk is primarily *visual* (slightly different exact shade/weight between the old hand-typed class and the new variant) rather than functional, since no business logic is touched. Recommend doing this incrementally per-pillar with visual verification, not as one large sweep.

### Phase 4 — Consolidate the 12-page table bypass (Medium–High complexity, Medium regression risk)
- Migrate hand-rolled tables onto the shared `Table` primitive (first adding sort/selected/loading-state support to it if KATON parity is required, per §F).
- *Risk*: medium-high — tables carry the most page-specific interaction logic (sorting, row click-through, selection) of any category audited; each migration needs its own verification pass, not just a style swap. This is the single largest item in the remediation sequence by effort.

### Phase 5 — Remap the typography scale (Medium complexity, Low–Medium regression risk)
- Replace the 312 arbitrary `text-[Npx]` occurrences with the Phase-1 scale's named classes.
- *Risk*: low functionally (text size only, no logic), medium in scope (37 files) — best done as an automated find-and-replace with the known 8-value mapping, followed by a visual pass rather than per-file manual review.

### Phase 6 — Build genuinely new components (Medium complexity each, Low regression risk since nothing existing depends on them)
- Provenance tag border-style mechanism (§F).
- 6-step workflow-stage indicator (§F) — the largest net-new build; no existing Call Centre screen has an equivalent to migrate, so this is pure addition with zero regression surface against current functionality, but real design/implementation effort in its own right.
- Segmented-pill toggle, if required.

### Phase 7 — Dual-skin wiring (Low complexity once Phases 1–6 are done, Low regression risk)
- Introduce a skin-selection mechanism (e.g. a second `.dark`-style CSS class selector, or a data attribute, swapping the token block) once the adoption gaps above are closed enough that most screens are genuinely token/variant-driven.
- *Risk*: low at this point — by construction, this phase only works safely once Phases 3–5 have minimized the hardcoded-value surface; attempting it before closing those gaps would produce a skin that only partially applies, exactly matching the "mixed centralized/local" state documented throughout this audit.

**This audit does not recommend an order-of-magnitude estimate (days/weeks) for any phase** — no information was gathered in this read-only pass about team velocity, and the brief does not request effort estimation, only complexity/risk categorization.

---

## I. Risks to existing UI optimizations

Several prior sessions documented deliberate, hard-won UI decisions that any remediation must preserve, not regress:

- **Session 11.1's `destructive`-reservation rule** (`docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md`) — `Badge`'s `destructive` variant is deliberately reserved for genuine technical failure, not business-outcome "bad" states (that's what `escalated` is for). Any Phase 3 consolidation must preserve this distinction, not flatten all "red-ish" call sites onto one variant indiscriminately.
- **Phase 2B's `Button` `xs` size** was itself a prior centralization of a "dense operational" density pattern already in de facto use on ~10+ pages — remediation work should audit for, not duplicate, this kind of already-completed prior consolidation before assuming a pattern is still ad hoc.
- **The density/compactness standard visible throughout recent sessions** (11px/10px/9px text, `h-7`/`h-8` compact rows, `space-y-1.5`-scale gaps — directly observed in this session's own `QaCalibration.tsx` work) is a deliberate, repeatedly-reinforced product decision ("no oversized cards," compact tables, dense operational screens per multiple prior session briefs). Any typography-scale remapping (Phase 5) or KATON type-ramp adoption must preserve this density, not silently enlarge it — KATON's visible type ramp (13–18px+ for body/heading text) is not obviously denser than Call Centre's current convention, and a careless remap could regress a standard this codebase has repeatedly, explicitly optimized for.
- **The 58%/65% asymmetric two-column workspace pattern** (seen in `AutomatedQaInspector.tsx`, `QaCalibration.tsx`) and **independently-scrollable evidence panels** are recent, deliberate layout decisions (this session's own 16.4.1 work) — a component-level table/card refactor (Phase 4/6) must not silently revert these to a generic full-width or equal-column default.
- **`qa.automated.run`/`.view`, Agent Scope, and every other authorization boundary audited across prior sessions are entirely orthogonal to this audit's findings** — nothing here implies or requires any authorization change, and remediation work must not conflate "which component renders this" with "who is allowed to see it."

---

## J. Acceptance criteria for any future implementation

A future centralization/dual-skin implementation session should be considered successful only if it can demonstrate, with evidence of the same rigor as this audit (file:line citations, stated denominators):

1. **Token completeness**: `--success`/`--warning`/`--info` (and any other KATON-required roles once Colour/Spacing sections B.3/B.4 are supplied) exist in `src/index.css`, light and dark, following the existing 19-token pattern.
2. **Adoption, not just existence**: the 54-file status-color population (or its Phase-3-reduced successor) is re-measured and shows a materially higher `Badge`-variant adoption rate than this audit's baseline of 3/54 — with the new count and denominator stated explicitly, not just claimed.
3. **Table consolidation measured**: the 4/16 shared-`Table` adoption baseline is re-measured post-Phase-4 with the same method used here.
4. **Typography scale in force**: `tailwind.config.ts` has a defined `fontSize` scale, and the 312-occurrence arbitrary-pixel baseline is re-measured and shown reduced, with the residual count explained (e.g. genuinely one-off sizes vs. remaining technical debt).
5. **No authorization, data-fetching, or business-logic file is touched** by any token/variant/table-migration commit — verifiable via the same "no new API routes, no RPC changes" discipline already standard in this codebase's session history.
6. **Density/layout preservation** (§I) is explicitly re-verified by live screenshot comparison before/after any typography or table remediation, not assumed safe because "it's just styling."
7. **The dual-skin switch itself** (Phase 7) is demonstrated on at least one full pillar of screens (not a single page) with both skins rendering correctly before being considered proven, given this audit's finding that centralization adoption is uneven across pillars/session-eras.
8. ~~This document's UNKNOWN markers in §B.2–B.4 are resolved~~ — **done in this revision**: Colour (exact hex for every role), Spacing/radii/borders/heights/icons/shadow, and the remaining type-ramp rows were all obtained from the complete KATON `.mhtml` source pages and are now authoritative in §B. Any future implementation should still re-verify against the live KATON prototype (not just this document) before finalizing token values, since a prototype can change between this audit and implementation.
