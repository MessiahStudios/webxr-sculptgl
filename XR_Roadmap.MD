# XR Roadmap — webxr-sculptgl

> **Mission:** Build the best place to shape digital clay at human scale using open web technologies, while preserving the strengths of an established Desktop sculpting workflow.

How this project extends [stephomi/sculptgl](https://github.com/stephomi/sculptgl) for Meta Quest MR/VR, and how that differs from the abandoned upstream.

This document has a consistent hierarchy: **long-term vision → product philosophy → usability charter → product scope → engineering architecture → implementation roadmap**. Each layer reinforces the one above it.
---

## Product philosophy

> **XR shouldn’t be a viewer bolted on.**
> **It should be the primary sculpting surface.**

Desktop edits **data**. XR evaluates and creates **form**. Immersive is **opt-in**: the same app runs a full Desktop sculpt session on a PC **or** in Quest Browser’s 2D window (Cancel XR setup); enter / exit WebXR whenever you want.

| Desktop | XR |
|---|---|
| Parameters | Proportion |
| Files | Silhouette |
| Topology | Gesture |
| Precision transforms | Volume |
| Dense panels | Presence |
| Editing on a screen (PC **or** headset browser 2D) | Spatial judgment in the room |

Those are fundamentally different strengths. The charter below is the filter for every future decision — so the project stays coherent over years, not months.

```
Desktop → data → precision → files
XR      → form → presence → spatial judgment → continuous sculpting
```

**Failure mode we avoid:** export from Desktop → open on Quest → discover wrong scale → go back to Desktop.

**Loop we want:** sculpt → evaluate at true scale → keep sculpting → evaluate → continue.

---

## Usability charter

### Every feature must earn its place in XR

Before adding anything, ask:

1. Does it improve sculpting?
2. Does it improve spatial judgment?
3. Does it reduce friction?
4. Would a sculptor naturally expect to use it while standing at a real sculpture?

If the answer is no, it’s probably a **Desktop** feature.

### Never break flow

This principle should influence **every** interaction.

Evaluate against:

> **Does this interrupt sculpting?**

```
Bad                              Good
────                             ────
Menu → panel → submenu           Adjust → continue sculpting
Open menu                        Thumbstick
→ Find tab                       → Radius changes
→ Open submenu                   → Keep sculpting
→ Adjust value
→ Close menu
```

Most VR apps interrupt too often. Ours should not.

### Spatial first

> **Every interaction should prefer natural spatial behavior before abstract UI.**

| Prefer | Avoid when possible |
|---|---|
| Grab, rotate, move, turntable | Dialogs |
| Pinch, push, pull | Nested sliders |
| Stick while sculpting | Inspector windows |
| Point at clay | Tiny text panels |

Embodied action first; UI only when spatial action isn’t enough.

### The room is part of the interface

Unlike Desktop sculpting, the **environment matters**. Artists judge scale against tables, chairs, doors, hands, and faces. That contextual scale is one of XR’s unique strengths — and a reason Workspace is a hero feature, not a side tab.

### Presence over panels

> **The clay is the interface. The dock is only a helper.**

After ten minutes of sculpting, the user should remember interacting with the clay — not navigating menus.

### Don’t clone yagui

```
Wrong                         Right
─────                         ─────
Desktop UI                    Desktop UI
↓                             ↓
Copy                          Identify intent
↓                             ↓
VR UI                         Redesign for XR
```

A defining decision of this project: **intent in, redesign out** — not a floating desktop monitor.

### Hand tracking later

Controllers remain superior for precision, haptics, intentional input, mode switching, and fatigue. Make controllers **boringly reliable** before chasing hand tracking.

---

## Non-goals

`webxr-sculptgl` is **not** trying to become:

- Blender in VR  
- Maya in VR  
- a floating desktop  
- a CAD application  
- a property inspector  
- a cross-headset VR app-store product with equal support on every HMD  

It **is** trying to become the best place to **shape digital clay at human scale**.

If a feature needs dozens of windows, nested menus, modal dialogs, tiny text, or property sheets, Desktop is the better environment — spend the effort there.

### Target platform (Quest-first)

| | |
|---|---|
| **Product target** | Meta Quest 2 / 3 / 3S / Pro via **Meta Quest Browser** (HTTPS) |
| **Modes that matter** | Mixed reality passthrough (`immersive-ar`) and closed VR (`immersive-vr`) |
| **Already included** | WebXR input-profile GLBs + setup fallbacks for Pico, Index, Vive, WMR, etc. (so controllers can *draw* when a runtime matches) |
| **Not a near-term goal** | First-class testing, binding polish, and MR UX parity on non-Quest headsets |

WebXR is an open API — other headsets *may* enter a session — but Quest is where Workspace, dock muscle memory, grip-exit, and remote logs are designed and proven. Broaden only when real use (or a concrete tester) earns the cost.

---

## What belongs where

### First-class in XR (sculpting surface)

| Need | Why |
|---|---|
| Form tools (brush, inflate, crease, smooth, flatten, pinch, drag, move, twist, local scale) | Core artistic loop |
| Paint / material lightly | Surface intent at true scale |
| Symmetry + negative | Fast bilateral form |
| **Workspace** (place, scale, rotate, distance, recenter, turntable) | Body-scale judgment — seats ahead of headset (guardian-independent) |
| Brush radius + intensity | Always reachable; never silently zero |
| Undo / redo | Muscle memory, not menu archaeology |
| Aim feedback (ray + brush ring) | Hit and size in real space |
| Exit / session recovery | MR without DOM needs a reliable escape |
| **Thin project continuity** (save / load / export) | Sculpting without a way back to disk breaks the loop |
| **Mesh Transform + gizmo** | Place multiple primitives / imports relative to each other |
| **Import external meshes** (OBJ/PLY/STL/SGL/**GLB·glTF**) | Bring Blender / CC0 assets into the clay scene (GLB = geometry-first today; Materials track deepens fidelity) |
| **Local Snapshot** (PNG + short video) | Review / share the *virtual* sculpt view — not Quest Cast |

### Specialized / quieter

Masking, clay/culling/wireframe, twist & local scale (until usage proves otherwise), paint PBR knobs (hardness / roughness / metallic), controller models.

### Desktop (or much later)

Full yagui denseness, deep multires/remesh, Sketchfab upload flows, background/matcap/environment editing, keyboard/tablet pressure, nested property sheets. **Exceptions (shared core):** glTF/GLB import already spans Desktop + XR; the **Materials / GLB / Paint** track (UVs, textures, honest export, UV tools, alphas) is also shared-core — Desktop owns dense editors, XR owns in-flow actions.

### Workspace vs mesh transform (important split)

> **Workspace is the spatial relationship between the artist and the sculpture.** It affects placement, scale, orientation, and comfort — but never the mesh itself.

These solve different problems. Do not conflate them.

| **Workspace** (always XR) | **Mesh transform** (Desktop parity) |
|---|---|
| Move sculpture in the room | Translate object in model space |
| Rotate sculpture | Rotate object / pivot / axes |
| Scale sculpture to body / room | Scale object for topology/export |
| Distance / recenter / turntable | Precision gizmo chrome |

Workspace is not a sculpt tool and not “camera controls.” It is something you **adjust** — a hero tab beside FORM and PAINT, never nested inside them. Mesh **Transform** is now in XR (gizmo + multi-select) for posing parts; Workspace remains room placement.

---

## Dock tool placement (stick-cycle budget)

> **The dock’s scarce resource isn’t “can we code it?” — it’s how many Y-clicks before you break flow.**

In XR, thumbstick navigation is the interaction budget. Protect that budget — but **do not confuse fewer tools with better flow**. Flow is the *cost of getting to the next tool*, not the length of the visible list.

### Don’t hard-code a “primary four” too early

Artists don’t all sculpt the same way:

| Style | Tools that stay hot |
|---|---|
| Character | Brush, Crease, Pinch, Smooth |
| Creature | Move, Inflate, Crease, Flatten |
| Hard-surface | Flatten, Crease, Pinch, Smooth |

Hiding Crease or Pinch behind “More…” permanently taxes some workflows hundreds of times per session. The philosophy is durable; **exact slot order should evolve from real XR sculpting time and tester feedback**, not from an a-priori popularity ranking.

### Prefer sculpting phase over abstract importance

Organize access around how sculptors actually work:

| Phase | Tools close at hand |
|---|---|
| **Block-out** | Brush, Inflate, Move, Drag |
| **Refinement** | Smooth, Flatten, Crease, Pinch |
| **Surface** | Paint, Mask (+ future Blend) |

That maps to dock tabs by **intent**, not phase name alone: **FORM** holds geometry (block-out + refinement), **PAINT** holds surface tools — and to “never break flow.”

### Categories (not ranks)

| Category | Purpose |
|---|---|
| **Primary** | Used continuously during most sessions — keep in the short stick cycle for the active phase |
| **Specialized** | Powerful, used intentionally rather than constantly (e.g. Twist, LocalScale today) |
| **Advanced** | Configuration and workflow support (Opts, paint write-channels, culling) |

“Specialized” means *intentional*, not *second-class*. Tools can move categories when usage proves they should — earn their place applies to dock layout too.

### Context switching beats solo popularity

Common pairs matter:

```
Brush ↔ Smooth
Flatten ↔ Crease
Move ↔ Inflate
```

If two tools are alternated constantly, they should live near each other even if one isn’t the global “most used.” Placement considers **workflows and pairs**, not only individual frequency.

### Crease (and similar) — watch, don’t demote

Crease is often as hot as Smooth once block-out is done. Leave it in easy reach until observed XR sessions say otherwise. Same open stance for Pinch.

### Twist / LocalScale

Specialized today — not equal stick weight with Brush. Not permanently demoted. If XR feedback shows LocalScale becoming a common room-scale operation, let it move forward.

### Lightweight adaptability (later, keep it thin)

Avoid a settings-heavy dock. A small future escape hatch fits the charter:

- FORM tab shows a short cycle of slots  
- Long-press a slot → replace with another FORM tool (e.g. Move → Crease)  

No floating inspectors — just a few primary slots the artist can tailor. Until then: phase-oriented tabs + observed use, not premature hard hierarchy.

---

## Upstream: what SculptGL was

[SculptGL](https://github.com/stephomi/sculptgl) is a browser **WebGL digital sculpting** app (brush, inflate, crease, paint, dyn topo, etc.) driven by **mouse / tablet / 2D GUI** (yagui).

| Upstream fact | Implication for XR |
|---|---|
| Development **stopped**; author moved to [Nomad Sculpt](https://www.nomadsculpt.com/) | No official VR path will land upstream |
| Architecture assumes a **single Desktop camera** + screen-space picking | Controllers, stereo eyes, and stage placement must be *added*, not toggled |
| Tools are solid; input is 2D (`mouseX/Y`, unproject, screen-radius brushes) | The win is **reuse tool math**, remap **input + presentation** |
| No WebXR, no controller dock, no passthrough | MR/VR is entirely this fork’s job |

Live upstream demo (Desktop only): [stephaneginier.com/sculptgl](http://stephaneginier.com/sculptgl).

---

## Design thesis (engineering)

> **Desktop tools stay the source of truth. XR only remaps how you aim, grab, present, and configure them.**

> **XR is additive, not divergent.** Every improvement should strengthen both workflows whenever possible, rather than creating separate products.

```
              ┌─ Desktop presentation (yagui, mouse/tablet)
Core ─────────┤
(tools, mesh, └─ XR presentation (dock, workspace, controllers)
 picking, undo)
```

Not two apps. One core, two presentations. That is the maintenance advantage — and why this fork can grow into an XR interaction layer without abandoning the Desktop path.

That is the opposite of “rewrite sculpting for VR.” It is also different from older WebVR forks that often replaced UI with opaque button maps and left Desktop parity behind.

```
┌─────────────────────────────────────────────────────────┐
│  Unchanged core                                         │
│  editing/tools/*  ·  mesh  ·  picking math  ·  undo     │
└──────────────────────────▲──────────────────────────────┘
                           │ startXR / updateXR / applyXRBrushRadius
┌──────────────────────────┴──────────────────────────────┐
│  XR shell (additive)                                    │
│  WebXRSession · stage matrix · stereo draw · controllers│
│  left-hand Sculpt Dock · remote logs · MR/VR setup      │
└─────────────────────────────────────────────────────────┘
```

### What “adding VR” means here

1. **Session** — `immersive-vr` *or* `immersive-ar` (passthrough / MR) via a setup panel (profile + mode).
2. **Workspace** — clay sits in the room (fit / scale / distance / orbit / recenter), never inside the head.
3. **Eyes** — per-eye viewport + scissor clear; RGBM / direct-output so stereo doesn’t look ghosted (`encodeFragColor` single-return path — no ANGLE X4000 noise).
4. **Aim** — right-controller target ray → scene-space hit → same tools as Desktop.
5. **Grab tools** — Move / Drag / Twist / LocalScale get XR-specific `startXR`/`updateXR` so 6DOF doesn’t explode topology.
6. **GUI** — left-hand **Sculpt Dock** (tabs, tools, paint swatches/wheel, opts, workspace) instead of relying on HTML in MR.
7. **Dev loop** — HTTPS tunnel + `/__xr_logs` so Quest behavior is debuggable on the laptop.

---

## How this differs from upstream (and common forks)

| Area | Upstream SculptGL | This project (`webxr-sculptgl`) |
|---|---|---|
| Goal | Desktop sculpt in a browser | **Same sculpt**, usable in **Quest MR/VR** at true scale |
| Input | Mouse / tablet | Controllers + ray; dock on left grip |
| Placement | Orbit / pan / zoom camera | XR viewer pose + **workspace** (clay in the room) |
| Rendering | Single framebuffer, post FX | Stereo XR framebuffer; MR skips skybox/grid |
| Brush radius | Screen pixels | Mapped to **mesh-scale world radius** in XR |
| Tools | Full Desktop set | Same tool classes; XR paths where 2D deltas fail |
| GUI | yagui side panels | **In-world dock** + Desktop Files; **Local Snapshot**; later **Spectator** (invite) |
| Undo | CTRL+Z / UI | Also **Right B** / stick-click / Opts |
| Status | Abandoned | Active XR port on top of the frozen core |

Other community approaches (for context, not dependencies):

- Older **WebVR** forks (e.g. button-map only, little Desktop GUI parity).
- Broader WebXR forks (e.g. SculptXR) that also target Quest AR/VR — valuable, but this roadmap describes **this** repo’s choices: additive XR layer, dock-first MR UX, and remote log tooling.

---

## Architecture map (key files)

| Piece | Location | Role |
|---|---|---|
| Session + enter/exit | `src/xr/WebXRSession.js` | MR/VR start, frame loop, grip-exit, stage UI hooks; welcome → XR setup gate |
| Welcome splash | `src/xr/WelcomeOverlay.js` | First-load logo + links + Don’t show again; pre-session only |
| Setup panel | `src/xr/XRSetup.js` | Mode + controller profile before enter |
| Controllers | `src/xr/XRControllerModels.js` | Official WebXR input-profile GLBs; poses dock host; passes viewer pose for billboard |
| Sculpt Dock | `src/xr/XRSculptDock.js` + `XRSculptDockState.js` | FORM / PAINT / OPTS / SPACE; paint; file/scene; Transform; **Local Snapshot / Record**; tool icons; wireframe; **head-facing float near left grip** |
| Tool icons | `app/resources/tool-icons/*.png` + `GuiSculpting.js` | Shared Form/Paint thumbs — Desktop sidebar grid + XR dock |
| Local capture | `src/xr/LocalRecord.js` + `Scene.captureLocalSnapshot` / `startLocalRecording` | Desktop live-canvas PNG/video; XR mono FBO virtual view |
| Project continuity | `src/xr/XRProjectStore.js` + `Scene.saveXRProject` / `loadXRProject` / `exportXRMesh` | IndexedDB `.sgl`; OBJ/PLY/STL export download |
| Mesh Transform | `src/editing/tools/Transform.js` + `editing/Gizmo.js` | XR gizmo + free-grab + L+R multi-select |
| Stereo / stage / ray sculpt | `src/Scene.js` | `drawXRFrame`, `updateXRSculptInput`, stage fit, XR file/scene helpers |
| Tool XR paths | `src/editing/tools/{Drag,Move,Twist,LocalScale,Transform,Paint,…}.js` | `startXR` / `updateXR` where needed |
| Remote logs | `src/xr/XRRemoteLog.js` + `tools/xr-dev-server.js` | Quest → laptop live log at `/__xr_logs` |

---

## WebXR mechanics map (current)

What you actually use on Quest today — the living “feature poster,” not just a checklist.

### Dock tabs (left controller)

The dock **follows the left grip** and **always faces the headset** (independent of wrist twist). It floats **above the button deck** so newcomers can still see X / Y / stick / squeeze while learning — presence helper, not a cover over the controller.

| Tab label | Internal id | Job |
|---|---|---|
| **FORM** | `form` | Geometry deform + grab tools + Smooth / Flatten + **Transform**; **α maps** chip (ON/OFF) |
| **PAINT** | `paint` | Paint, Mask, Soften; **α maps** chip; paint chrome still in OPTS when Paint tool active |
| **α** | `alpha` | Stamp gallery + lock/angle — **only in X cycle while α maps is ON** |
| **OPTS** | `opts` | Files, scene, paint opts, clay/symmetry (negative = right grip) |
| **SPACE** | `workspace` | Artist ↔ sculpture placement (never the mesh) |

X cycles tabs (skips **α** when maps are OFF). Stick ↕ cycles tools / option focus (FORM/PAINT: α chip then tools). Y fires the focused opt / α toggle / Workspace recenter.

### Right hand (sculpt)

| Input | Action |
|---|---|
| Index trigger | Sculpt / Transform grab / gizmo handle |
| Grip (side) | **Hold = temporary negative/invert** on tools that support it (Desktop Alt) |
| Both grips | **Hold = temporary Smooth** (Desktop Shift); then right trigger sculpts — exit still = both grips ~2.5s *without* trigger |
| B | Undo |
| Stick | **Orbit around selection** (↔) · **dolly closer/farther** (↕) — pivot updates after Transform |
| Stick click | Redo |

### Left hand (dock + modifiers)

| Input | Action |
|---|---|
| Stick | Cycle tools/opts; Workspace scale/distance; paint wheel aim |
| Squeeze + stick | Radius ↕ / intensity ↔ (or Workspace turntable; wheel brightness) |
| X | Cycle dock tabs |
| Y | Toggle focused opt / Workspace recenter / paint picker mode |
| Index trigger | **Paint wheel lock**; **Transform multi-select** (hold + right trigger on meshes) |
| Both grips ~2.5s | Exit XR when DOM overlay is missing in MR |

### FORM tools

`brush` · `inflate` · `pinch` · `crease` · `drag` · `move` · `twist` · `localscale` · `smooth` · `flatten` · **`transform`**

### PAINT tools

`paint` · `masking` · **`soften`** (Desktop: “Soften (blend colors)”; XR: “blend colors”)

### α maps — which tools earn stamps

> **Compatibility is a fixed allowlist, not a guess.** Transform never stamps. Gallery only appears when **α maps is ON** *and* the current tool is allowlisted.

Alphas in SculptGL modulate brush **falloff / intensity** via a texture (classic stamp when lock is on). Not every tool benefits equally:

| Tier | Tools | Why |
|---|---|---|
| **Primary stamp** | brush, inflate, crease, pinch, flatten · paint, masking | Image-shaped form or surface marks — ZBrush/Nomad muscle memory |
| **Useful falloff** | smooth · soften | Selective soften/smooth with a shaped edge — keep, lower “stamp art” expectation |
| **Questionable** | drag, move, twist, localscale | Alpha is mostly radial falloff on a grab gesture, not a readable stamp. **Keep for now** (Desktop parity + allowlist already includes them); demote from XR allowlist if sessions show confusion |
| **Never** | **transform** | Whole-mesh pose — no brush kernel |

**Product stance:** keep the current allowlist; treat **Primary + falloff** as the story we teach; watch Questionable tools and shrink the list if α feels muddy on grab tools.

**UX (landed):** FORM/PAINT chip `α maps: OFF / ON / n/a` → ON opens ALPHA gallery → **Y Use stamp** returns with α still ON → OFF restores freehand round brush (keeps last `alphaId` for re-ON).

### OPTS — files & scene

| Row | Behavior |
|---|---|
| **SAVE project (.sgl)** | IndexedDB on the Quest origin |
| **LOAD last (.sgl)** | **Replaces** scene, re-fits Workspace |
| **IMPORT file** | Adds OBJ/PLY/STL/SGL/**GLB** — picker **may fail in XR**; prefer before enter / after exit |
| **IMPORT URL** | HTTPS (or localhost http) + CORS; known mesh extension; verify URL first; max ~80 MB |
| **EXPORT** + format | OBJ / OBJ+MAPS / **GLB** / PLY / STL → browser download / Files |
| **LOCAL SNAPSHOT** | PNG of the virtual sculpt view (no passthrough) |
| **START / STOP RECORD** | WebM video (+ FPS 15/24/30 · Small/Balanced/High clean presets) |
| **CLEAR scene** | Empty clay |
| **ADD …** | Stick ↔ cycles sphere/cube/cylinder/torus; Y places **beside** current selection at matching size (no Workspace re-fit on ADD) |
| **Wireframe** | Toggle mesh edges (WebGL2-safe) |

### Transform (essential for multi-mesh)

| Action | How |
|---|---|
| Free-grab one mesh | Right trigger on mesh (single-selects, then drags) |
| Gizmo | Axes / rings / scale cubes — right trigger on a handle |
| Multi-select | Hold **left trigger**, **click** right trigger on each mesh (edge-triggered) |
| Move a group | Build multi → drag **gizmo** |
| Escape to one | Right trigger alone on a mesh (clears multi to that mesh) |

### Paint (PAINT tab)

| Mechanic | Behavior |
|---|---|
| Swatches / wheel | Y toggles picker |
| Wheel aim | Stick = **preview only** (does not change paint color) |
| Wheel lock | **Left trigger** commits; stick must recenter before re-aim |
| Eyedropper / paint-all | Opts rows |
| R/I | Always-visible meters; squeeze+stick |
| Soften | 1-ring blend of color / rough / metal (+ maps); Desktop Paint↔Blend dual button |
| Clay-friendly PBR | Rough/metal default to clay ideals (~55% / ~4%); chrome-ish values auto-correct when selecting Paint until the artist edits (or eyedrops). Matcap/Flat show paint as **color**; PBR uses metal/rough — Desktop hint + XR PAINT note |

### Continuity vs import (Quest reality)

```
In XR:     Save / Load last  →  IndexedDB (.sgl)
           IMPORT URL         →  https mesh (CORS) when picker fails
Around XR: Desktop Files menu / 2D browser picker  →  OBJ PLY STL SGL GLB/glTF
Optional:  ?modelurl=https://… at boot (same validators)
```

File pickers work best **before** entering XR (Quest Browser 2D) or after exit — not as a free Files browser inside immersive MR. **Import URL** is the immersive-friendly path when the host allows CORS; always verify the link first. Pasted links that wrap with spaces/newlines are stripped before validation.

**Honest import note:** GLB/glTF import keeps **indexed topology**, **UVs**, **live albedo/metalRough textures** (ShaderPBR samples them), and still fills vertex paint as fallback. Draco via `./draco/`. Export prefers live maps when present.

---

## Roadmap status

### Path to product cut (honest)

> **You can sculpt for real today.** What’s left is polish and a few trust/flow fixes — not a missing clay studio.

| Milestone | Ready? | Notes |
|---|---|---|
| **Friend / family playable** | **Yes** | Quest MR/VR loop + Desktop (PC or Quest Browser 2D); teach lower R/I on Drag; Soften + remesh heal stretches |
| **Materials / files trust** | **Yes (Phase C)** | GLB round-trip + map paint; `.sgl` still vertex/UV-strong (map slots optional later) |
| **Presentation coherence** | **Yes** | Product **logo** + **welcome splash**; **[`docs/HOW_TO.md`](./docs/HOW_TO.md)** tool guide with icons; UI accents `#58A8F0` / `#F7974B` |
| **Quest feel / perf** | **Pass 1 done** | Cached XR brush radius AABB; coalesce mesh GPU uploads / frame; Paint/Soften map flush on stroke end; parked restroke ~20Hz |
| **Named v1 “final cut”** | **~96%** | Live stable on Pages; phone UX + Transform bake fix landed; leftovers below are polish |

**Blockers before calling it a final product cut**

1. ~~Gate How-to docs Camera buttons~~ — **stable build** (`npm run release:stable`) strips them; **dev** keeps helpers. **Published:** [`https://www.messiahstudios.site/webxr-sculpt/`](https://www.messiahstudios.site/webxr-sculpt/) via [`docs/STABLE_HOSTING.md`](./docs/STABLE_HOSTING.md).  

**Done (was listed as leftover):** light dock offset / size — landed with head-facing float (`_watchOffset`), plane aspect = canvas, FORM reflow; no longer a v1 blocker.

**Explicitly not blockers for v1:** Spectator · hands · Phase D UV suite · remesh · paint layers · other-HMD parity · cloud share · README hero / welcome / public how-to · **XR ADD spawn** · **dock offset/size** (landed) · **smartphone Tools chrome** (landed) · **Android phone XR suppression** (landed).

### Where we are (2026-08-02 — live journal)

Quest MR/VR sculpting remains a **real continuous loop**. Capture and Materials through **Phase C** are landed. **Stable v1 is live** on the main site. Recent product/engineering journal (same day as portfolio hybrid publish):

| Landed | Note |
|---|---|
| **Stable Pages host** | `npm run release:stable` → `dist/v1/` → [`messiahstudios.site/webxr-sculpt/`](https://www.messiahstudios.site/webxr-sculpt/); tagged `v1.0.0` |
| **Stable vs dev split** | How-to Camera exporters stripped on stable; `/__xr_log` relay **off** on stable (no 405 on static Pages); **on** for `npm run server` / xr-dev |
| **App favicon** | WebXR Sculpt brand logo (`resources/brand/webxr-sculpt-logo.png`) |
| **Transform gizmo detach fix** | XR bake force-uploads GPU buffers before orbit pivot sync; flush on trigger-up (CPU/GPU desync was the “gizmo flies home” bug) |
| **Smartphone chrome** | ≤900px / short landscape: full-width canvas, floating **Tools** overlay, scrollable topbar, responsive welcome |
| **Phone XR gate** | Android phones often report immersive WebXR (ARCore/Cardboard) — **suppress XR setup** there; **Quest / headset UA** still get the chip + setup. Matches iPhone “Tools only” UX |
| **Portfolio hybrid** | Main site links Work + Services paths to WebXR Sculpt (separate repo: `MessiahStudios.github.io`) |

Also earlier today / prior: product **logo** + **welcome splash**; public **How-to**; **XR ADD** near selection; **Import URL**; **Desktop-only on Quest Browser**; dock FORM reflow + **Transform** label; **Workspace viewer seat**; brand accents; tool icons; OPTS wireframe; sculpt perf pass; α maps.

```
█████████████████████████▓  ~96% toward named product cut
█████████████████████████  ~98% of first-class XR surface
│                        │
├─ Done: session · Workspace · FORM/PAINT/α · Transform · paint · Soften · Save/Load
│        · Import GLB (UVs + live maps + Draco) · Export GLB / OBJ / OBJ+MAPS / PLY / STL
│        · Paint into maps · brush feel · clay PBR defaults + shader hint
│        · Shared alpha gallery + α maps toggle + ALPHA tab · stamp lock/angle
│        · Local Snapshot PNG + video · dock/Desktop polish · how-to PNG packs (Camera helpers)
│        · Tool icons · OPTS wireframe · Quest sculpt perf pass
│        · Product logo hero + brand accent sync (#58A8F0 / #F7974B)
│        · Welcome splash (logo + links + Don’t show again; headset → XR setup)
│        · Public How-to guide (docs/HOW_TO.md) with tool icons
│        · XR ADD near selection (no Workspace re-fit on every ADD)
│        · XR dock FORM layout — clamp above footer + flush paint when entry-hint ends
│        · Dock tool label Transform (match Desktop; was xform)
│        · Dock offset / size — head-facing float + aspect-matched plane (no longer a leftover)
│        · Workspace seats ahead of headset (viewer pose) on enter / SPACE recenter
│        · Desktop-only sessions on WebXR devices (Cancel setup → yagui; chip to enter later)
│        · Import URL (https + CORS + extension/size safeguards; strips paste whitespace)
│        · XR direct-output encodeFragColor (silence ANGLE X4000)
│        · Stable v1 live on messiahstudios.site/webxr-sculpt/ (tag v1.0.0)
│        · Stable: How-to Camera UI stripped · remote __xr_log disabled · app favicon
│        · XR Transform bake: force GPU flush (gizmo stays on mesh after move)
│        · Smartphone Tools chrome + responsive welcome (portrait / landscape)
│        · Phone handsets suppress XR setup; Quest headset UA keeps it
├─ Next: α allowlist watch · optional .sgl live map-slot persistence
│        · (dev) How-to Camera exporters remain until dropped from Camera entirely
│        · engineering confidence: thin CI / smoke tests (outside playtest journal)
├─ Parallel: Phase D UV tools — *likely needed* for textured/seam path (Desktop-first; not v1 blocker)
├─ Collaboration: Spectator still a north-star (not near-term) · Co-sculpt after that
└─ Stretch (thin): dock slot swap · hands (after controllers stay boring) · remesh if Quest-safe
         · thin Desktop paint layers (maybe)
```

#### Playtest note (family / new-to-3D — 2026-08-01)

- **Drag** at high radius/intensity stretches verts / skinny tris — expected; Smooth + remesh heal; teach lower R/I for first sessions.  
- **Voxel remesh → Block** = Minecraft look — by design; use a smoother remesh for organic clay.  
- **ADD cube/sphere in XR after a wild Drag** — **fixed:** ADD places near the current selection at matching size and no longer calls `fitXRStageToScene()` (re-fit remains on Clear / Recenter / load). Desktop Scene → Add never used Workspace fit (XR-only).

#### Playtest note (live stable — 2026-08-02)

- **Transform in XR** — gizmo could detach after move (GPU verts stale); **fixed** with force flush on bake.  
- **Android phone vs iPhone** — Android Chrome offered **XR setup** / Cardboard stereo because WebXR immersive is reported; iPhone did not. **Fixed:** phone handsets suppress XR entry; Quest headset UA still gets setup. Phones use **Tools** chrome.  
- **Welcome on phones** — needed responsive centering; Tools overlay for Form & Paint.  
- **Stable console** — `POST __xr_log` 405 on Pages; relay disabled on stable (dev keeps `/__xr_logs`).  
#### No longer pursuing (cut from active interest)

These stay in the doc so we don’t re-open rabbit holes — they are **not** backlog.

| Item | Why cut |
|---|---|
| **Studio record** (yagui in-frame encode) | Local Record + OS window capture cover tutorials; not worth a second encode path |
| **XR presentation capture polish** (aim rays, MR plate, fancy framing) | Dock + controllers already in frame; polish ≠ product |
| **Cloud / Sketchfab-style share from XR** | Non-goal adjacent; local Save/Load + honest export are enough |
| **Other-headset first-class polish** | Quest-first stays; opportunistic only — not a tracked deliverable |
| **Smudge / smear tool** | Soften covers blend intent; don’t lengthen PAINT |
| **Substance-style projection + layer stacks** | α stamps own the image story; full projector is a different product |
| **XR paint-layer manager** | Presence-over-panels; Desktop-thin layers only *maybe* later |
| **Clone stamp · dedicated eraser · channel-only brushes · cavity/AO · decal tool** | Covered by negative paint, write flags, α, or out of clay scope |
| **meshopt / exotic glTF loader polish** | Draco + live maps are enough; reopen only if real files fail |
| **Freeform multi-mesh free-grab** | Gizmo group move works; optional restore not worth stick confusion |
| **Desktop mirror as a product track** | Handy for debugging; not Spectator, not a roadmap goal |
| **“Evaluate Nomad UX” checklist row** | Ongoing filter via charter — not a deliverable |
| **Alphas → paint intensity special-case** | Vague; stamps already modulate falloff — no separate project |

**Still on the fence (not cut, not scheduled):** thin Desktop paint layers · thin aim-projection if α leaves a gap · **Spectator** · **dock slot swap** · **Phase D UV tools** (*likely needed* for textured/seam path — Desktop-first; not next sprint).

#### Recent agreed list — what we said vs what advanced

| Agreed item | Advanced? | Notes |
|---|---|---|
| **Local Snapshot PNG** | **Yes** | Desktop Camera + XR OPTS; virtual view only; XR ~1.5s aim then head pose |
| **Start/Stop video record** | **Yes** | Desktop + XR; FPS 15/24/30; Small/Balanced/High (clean bitrates). For post (DaVinci etc.), not OS Cast |
| **XR capture ≈ Cast-like** | **Partial → Yes (app-side)** | Head pose + ~70° FOV; dock + controllers in frame. Still **not** OS Cast / passthrough |
| **Desktop encode efficient** | **Yes** | Scales live view into preset sizes (not raw retina) |
| **Cache freed when idle** | **Yes** | Scratch FBO/RT/encode canvas disposed after PNG, Stop, XR exit |
| **Studio / UI-in-frame record** | **Cut** | Local Record + OS capture enough — no longer pursuing |
| **GLB import fidelity** | **Yes** | Phase A + live map slots (Phase C) |
| **GLB export** | **Yes** | Phase B; prefers live maps when present |
| **Paint into maps** | **Yes** | Phase C — overwrite imported texels; verts remain UV-less fallback |
| **Paint brush feel + Soften** | **Yes** | Denser stamps, flow, XR trigger→intensity; Soften on PAINT (Desktop dual button + “blend colors”) |
| **Clay-friendly paint / shader hint** | **Yes** | Defaults ~R55 / M4; auto-correct chrome until user edits; Matcap/Flat vs PBR copy on Desktop + XR |
| **Shared alpha gallery** | **Yes** | Built-in free stamps (`AlphaLibrary` + generate script); Desktop thumbs; **XR ALPHA tab** mini-gallery + shared stamp; custom import |
| **α maps ON/OFF toggle** | **Yes** | FORM/PAINT chip; allowlist (Transform excluded); gallery only when ON; X skips α when OFF |
| **Alpha stamp feel + angle** | **Yes** | Freehand default; lock opt-in; bilinear + contrast; angle −360…360 (Desktop presets + XR stick) |
| **How-to menu PNG packs** | **Yes** | Camera → How-to docs: live DOM/dock snapshots; Desktop pack unlocks max-height/overflow + explicit scroll size (no clipped bottoms) |
| **Desktop chrome consistency** | **Yes** | Shared CSS tokens; all topbar dropdowns match Camera (width, wrap, accents); sidebar folders/widgets aligned |
| **XR dock layout polish** | **Yes** | Plane aspect = canvas; OPTS scroll + ▲/▼; FORM grid clamps above footer + post–entry-hint reflow; head-facing `_watchOffset` (offset/size fine-tune absorbed — not a leftover) |
| **Tool icon pack** | **Yes** | `app/resources/tool-icons/*.png` — Desktop Form/Paint grid + XR dock thumbs; README tool palette |
| **OPTS wireframe** | **Yes** | XR dock toggle; WebGL2 uint-index fix so wireframe draws |
| **Quest sculpt perf pass** | **Yes (pass 1)** | Cache XR brush radius AABB; coalesce buffer uploads / XR frame; Paint/Soften map flush on stroke end; parked restroke ~20Hz |
| **Product logo + brand sync** | **Yes** | `docs/media/webxr-sculpt-logo.png` README hero; UI accents `#58A8F0` / `#F7974B` (logo-sampled) |
| **Welcome splash** | **Yes** | Logo + Messiah Studios links; `sculptgl.welcome.hide`; Let’s Sculpt → Desktop dismiss / headset XR setup |
| **Public How-to guide** | **Yes** | [`docs/HOW_TO.md`](./docs/HOW_TO.md) — tool icons + Desktop/Quest controls; README links it |
| **Import URL** | **Yes** | Files + XR OPTS; HTTPS-only (localhost http OK); extension allowlist; size/timeout; CORS caution; strips wrap whitespace on paste |
| **Workspace viewer-relative seat** | **Yes** | Enter + SPACE Y recenter place clay ahead of headset pose — works across guardian sizes |
| **Spectator / Co-sculpt** | **No** | Feasible (see Spectator feasibility); needs signaling — not built |

#### Gaps that still need attention

1. **Camera How-to PNG buttons** — hide/gate maintainer exporters when naming the cut (**kept for now**; public guide is [`docs/HOW_TO.md`](./docs/HOW_TO.md)).  
2. **α allowlist watch** — demote grab-tool α if muddy in practice.  
3. **`.sgl` map slots** — project re-open still vertex/UV-strong; live map persistence in `.sgl` is a real continuity gap if you care (Materials polish, not a new tool).  

~~Dock placement / offset / size~~ — done (head-facing float + aspect-matched plane).  
~~Bake polish / Studio record / XR capture chrome / other-HMD~~ — cut or absorbed (see *No longer pursuing*).

Left-hand priority (settled): **Workspace → squeeze (R/I or wheel brightness) → wheel lock / multi-select → tools**. Right: sculpt / Transform / **grip = negative** / undo / redo. **Both grips = Smooth hold** (Desktop Shift).

### Done (working baseline)

- [x] Enter **MR (passthrough)** or **VR** from a setup UI  
- [x] **Workspace / SPACE** — fit, scale, distance, turntable, tilt, recenter; enter + Y seat ahead of headset  
- [x] Stereo draw without one eye wiping the other  
- [x] Official controller models (WebXR input profiles)  
- [x] Left-hand **Sculpt Dock** — tabs **FORM / PAINT / OPTS / SPACE** (ids `form` / `paint` / …; legacy `shape`/`surface` migrate)  
- [x] Dock **faces the headset** while tracking left-arm position (grip follow, world billboard — not wrist-locked)  
- [x] Dock floats **above the button deck** so new users can still see left-controller controls  
- [x] Right-trigger sculpt with ray picking  
- [x] Brush, inflate, pinch, crease, smooth, flatten, paint, masking, **soften**  
- [x] Drag + Move (limited grab); Twist (wrist roll / stick); Local Scale (push-pull / stick)  
- [x] **Transform** + Desktop gizmo in XR (free-grab, axis handles, L+R multi-select)  
- [x] Paint swatches + **color wheel** (stick = preview; **left trigger** = lock)  
- [x] Paint **eyedropper** + **paint-all** from dock Opts  
- [x] **Paint brush feel** (denser stamps, flow; XR analog trigger → intensity) + **Soften** on PAINT  
- [x] **Clay-friendly paint defaults** + Matcap/Flat vs PBR wording (auto ideals until user edits rough/metal)  
- [x] Symmetry-aware XR paths for grab tools  
- [x] Undo / Redo in XR (Right B / stick click / Opts)  
- [x] Intensity/radius always visible + squeeze+stick adjust (toast / haptic)  
- [x] **Save / Load** `.sgl` (IndexedDB) + **Export** OBJ/PLY/STL + **OBJ+MAPS** zip + **GLB** from Files/OPTS  
- [x] **Import** OBJ/PLY/STL/SGL/**GLB·glTF** (UVs + live PBR maps + vertex fallback + Draco)  
- [x] **Paint into maps** when UVs + map slots exist (Phase C); verts for UV-less clay  
- [x] **Clear scene** + **Add** sphere/cube/cylinder/torus from Opts  
- [x] Remote log relay for Quest debugging  
- [x] Dual-grip hold to exit when DOM overlay is missing in MR  
- [x] DIY HTTPS tunnel notes (`tools/xr-tunnel.txt`) for Quest testing  
- [x] **Right grip = temporary negative/invert** on tools that support it (removed from OPTS sticky toggle)  
- [x] **Local Snapshot / Record** (Desktop Camera + XR OPTS)  
  - PNG still + Start/Stop WebM (VP9 when available)  
  - FPS **15 / 24 / 30** (default 24); quality **Small 720p / Balanced 900p / High 1080p** with clean bitrates  
  - Desktop: live sculpt view scaled into encode canvas  
  - XR: Cast-like mono (head pose + ~70° FOV) with **clay + brush/gizmo + controllers + dock**  
  - XR still: **~1.5s aim delay** then capture from current headset pose (same overlays as record)  
  - Scratch buffers disposed when idle  
- [x] **XR dock layout polish** — canvas/plane aspect match; OPTS scroll + ▲/▼; FORM entry-hint reflow; head-facing offset (offset/size fine-tune done)  
- [x] **Desktop yagui chrome facelift** — shared CSS tokens; topbar + sidebar consistent with Camera menu  
- [x] **How-to docs PNG packs** (Camera → How-to docs) — WebXR dock full tabs + Desktop sidebar/topbar; Desktop capture unlocks clip + scrollHeight (no bottom crop); WIP docs helper, not product UX  
- [x] **α maps ON/OFF** on FORM/PAINT — allowlisted tools; Transform = n/a; ALPHA tab gated; shared stamp  
- [x] **Tool icon pack** — Desktop Form/Paint icon grid + XR dock; README tool palette  
- [x] **OPTS wireframe** + WebGL2 wireframe draw fix  
- [x] **Quest sculpt perf pass (1)** — radius AABB cache; coalesce GPU uploads; defer Paint/Soften map flush; parked ~20Hz  
- [x] **Product logo** as GitHub hero (`docs/media/webxr-sculpt-logo.png`) + **brand accent sync** (Desktop + XR dock → `#58A8F0` / `#F7974B`)  
- [x] **Welcome splash** — logo + links; Don’t show again; Let’s Sculpt dismisses (Desktop) or opens XR setup (headset)  
- [x] **Public How-to** — [`docs/HOW_TO.md`](./docs/HOW_TO.md) with shared tool icons; README How-to section  
- [x] **XR ADD spawn** — place near selection at matching size; no `fitXRStageToScene` on ADD (Clear/Recenter/load still re-fit)  
- [x] **Import URL** — HTTPS (+ localhost http); extension allowlist; ~80 MB / 60s caps; CORS caution; paste whitespace strip (Files + XR OPTS)
- [x] **XR encodeFragColor** — single-return path for `uDirectOutput` (avoids ANGLE/HLSL X4000 warn)
- [x] **XR dock FORM reflow** — clamp tool grid above footer; flush paint when entry-hint ends; tool label **Transform** (Desktop parity)
- [x] **Desktop-only on WebXR devices** — Cancel XR setup stays on yagui + canvas (Quest Browser verified); enter immersive anytime from chip  
- [x] **Workspace viewer-relative seat** — enter + SPACE recenter place clay ahead of headset pose (guardian-size independent)  
- [x] **Stable v1 hosting** — `release:stable` → `dist/v1/`; live at [`messiahstudios.site/webxr-sculpt/`](https://www.messiahstudios.site/webxr-sculpt/); tag `v1.0.0`; docs in [`STABLE_HOSTING.md`](./docs/STABLE_HOSTING.md)  
- [x] **Stable product cut flags** — How-to Camera exporters off; remote `__xr_log` POSTs off on static host; app brand favicon  
- [x] **XR Transform bake / gizmo attach** — force GPU buffer upload on release so gizmo + picking stay on the moved mesh  
- [x] **Smartphone chrome** — Tools overlay, full-width canvas, scrollable topbar, responsive welcome (portrait + landscape)  
- [x] **Phone XR entry gate** — suppress XR setup on Android/iPhone handsets; keep for Quest / headset UA (and desktop WebXR chip)  

### Next (near-term)

Active leftovers only (done items removed from the “todo” mental list):

1. [x] **Stable v1 build** — `npm run release:stable` → `dist/v1/` (How-to Camera UI stripped); **live** via [`docs/STABLE_HOSTING.md`](./docs/STABLE_HOSTING.md)  
2. [ ] **α allowlist watch** — drop drag/move/twist/localscale from XR α if muddy  
3. [ ] Optional: persist **live map slots in `.sgl`** if re-open-with-textures becomes painful  
4. [ ] Optional: thin **CI / smoke tests** (build + GLB/SGL round-trip) — engineering confidence, not clay feature  

**Landed (no longer leftovers):** dock offset / size fine-tune · Workspace seats in front of the **headset** on enter / SPACE recenter · How-to exporters gated in **stable** · live Pages publish · Transform gizmo flush · smartphone Tools chrome · phone XR suppression.

**Explicitly not next:** Studio record · XR capture chrome · smudge · projection · layers · hands · remesh · other-HMD · Sketchfab/cloud share.

### Collaboration & capture (naming — keep distinct)

| Feature | Meaning | Status |
|---|---|---|
| **Local Snapshot** | Image or short video of the *virtual* sculpt view — review or share later | **Done** — Desktop + XR; XR aim delay; dock/controllers; not Cast/passthrough |
| **How-to menu packs** | Flat PNGs of XR dock tabs + Desktop chrome for README / tutorials | **Done (WIP helpers)** — Camera → How-to docs; re-export when UI changes; not headset product |
| **Studio record** | Same encode path but includes **Desktop yagui** | **Cut** — use OS window capture + Local Record |
| **XR presentation capture** | Richer demo composite (aim rays, MR plate, framing) | **Done enough** — further polish cut |
| **Spectator** | Friend joins by invite code and **sees your live clay/scene** (view-only). Target: **headset-to-headset** | **North-star, not scheduled** — needs signaling |
| **Desktop mirror** | Same machine shows live virtual view while XR is active | **Not a product goal** (debug convenience only) |
| **Cast / Stream** | Twitch / YouTube / Quest Cast / OS share | Outside our app |
| **Co-sculpt** | Friend **edits** the same clay | After Spectator — still later |

Do **not** call Local Snapshot, Local Record, or Desktop mirror “Spectator.”  
Do **not** promise OS Cast or that WebXR can share your passthrough camera feed to a friend.

**Local Snapshot ≠ Spectator:** Snapshot/Record is *you* capturing a file for later. Spectator is a *live second person* watching the session.

**Why XR video isn’t Quest Cast:** WebXR cannot read the OS compositor. We redraw a flat mono presentation. Headset playback of a WebM does **not** apply VR lens correction.

### Spectator feasibility (refined)

**Verdict: yes — and your headset-friend vision is the right north star.**

What you described:

```
You (Quest, sculpting) ──sync clay/scene──► Friend (Quest, view-only)
         own passthrough / room                    own passthrough / room
```

- Friend sees **your sculptures** (and scene) update live.  
- Friend keeps **their** environment (MR passthrough or VR).  
- If you’re in the **same physical room**, they may also see *you* through passthrough — that’s the headset’s camera, not something we stream.  
- If you’re **remote**, they see the shared clay in *their* room, not your walls — still meaningful for “watch me sculpt.”  
- View-only now → later flip a flag to **Co-sculpt**.

| Approach | What friend sees | Fit |
|---|---|---|
| **A. Shared scene sync** (mesh / deltas over datachannel) | Clay in *their* XR space at true scale | **Target Spectator** — precursor to co-sculpt |
| **B. Video of your virtual view** (WebRTC media) | Your camera framing as a flat screen | Easier Desktop/teaching step; weaker on headset |
| **C. Local Snapshot / Record** | A file later — not live | **Not** Spectator |

| Piece | Possible? | Notes |
|---|---|---|
| Invite code + match peers | **Yes, needs signaling** | WebSocket / LiveKit / etc. — not free forever on static hosting alone |
| Shared mesh sync (A) | **Yes** | Harder than video; same foundation Co-sculpt needs |
| Video fallback (B) | **Yes** | Reuses Local Record–style encode; fine for Desktop guest |
| Friend headset + own passthrough | **Yes** | Each runs their own WebXR session; we only sync *virtual* content |
| Stream your passthrough to them | **No / out of scope** | OS / privacy / WebXR limits — they use *their* camera |
| Zero-server cross-device | **No** | Signaling (+ often TURN) required |

**Phased path:**
1. Design spike — signaling choice; prefer **scene sync (A)** as the real product; video (B) optional for Desktop guest  
2. Desktop viewer v1 — join by code, view-only (sync or video)  
3. **Headset guest v1** — friend in Quest, view-only clay in their space  
4. Co-sculpt — grant edit authority on the same sync path  

**Desktop mirror** (same laptop while *you* wear Quest) still isn’t Spectator — useful for teaching yourself, no invite.

### GLB status (honest)

| Direction | Status | What you get |
|---|---|---|
| **Import `.glb` / `.gltf`** | **Operational** (A + C) | Indexed topology, UVs, **live albedo/metalRough textures** (ShaderPBR), vertex paint fallback, Draco, multi-material → separate meshes |
| **Export `.glb` / `.gltf`** | **Operational** (B + C) | Binary `.glb`: prefers **live maps**; else bake from verts; UV-less → vertex color + factors |
| **Alternate textured export** | **OBJ+MAPS** zip | Live maps when present; else baked diffuse/rough/metal PNGs (needs UVs) |
| **Full project re-open** | **`.sgl`** | Geo + UVs + vertex paint continuity (map slots not yet in `.sgl`) |

**Verdict:** GLB **round-trip + live maps** — import keeps textures, PBR samples them, paint can overwrite map texels, export prefers live maps. Prefer `.sgl` for re-open here.

**Files language (keep clean):**

| Action | Format | Purpose |
|---|---|---|
| **Save / Load** | `.sgl` | Native project continuity — IndexedDB in XR (geo + UV + vertex paint when present) |
| **Export** | `.obj` / `.ply` / `.stl` / **`.glb`** | Hand off — only what each format honestly carries (see Materials track) |
| **Export (textured zip)** | `.obj` + `.mtl` + PNG maps | Same bake as GLB maps, looser DCC pack |
| **Import** | `.obj` / `.ply` / `.stl` / `.sgl` / **`.glb` / `.gltf`** | Adds to scene (Desktop Files / 2D picker / XR OPTS Import) |
| **Import URL** | HTTPS (+ localhost http) + CORS + allowlisted extension; paste strips spaces/newlines | Hosted CC0 / personal static hosts (`addModelURL` / OPTS) |

### Later (stretch)

Keep short — most old stretch rows are done or cut (see *No longer pursuing*).

- [ ] Lightweight dock slot replace (long-press primary → swap tool; no settings panel)  
- [ ] Hand tracking sculpt — only after controllers stay boringsly reliable  
- [ ] Multi-resolution / remesh if it stays safe at Quest framerate  
- [ ] **Spectator** — invite-code live virtual watch (signaling + sync; not scheduled)  
- [ ] **Co-sculpt** — after Spectator  
- [ ] Thin **Desktop paint layers** (maybe; merge/bake required) — not XR dock chrome  
- [ ] Thin aim-projection — *fence only* if α stamps leave a real gap  

**Cut from stretch (do not re-add casually):** Studio record · XR capture chrome · smudge · Substance projection/layers · Sketchfab/cloud share · other-HMD deliverable · meshopt · freeform group free-grab · Nomad checklist row.

## Materials / GLB / Paint track

> **Why this exists:** Shipping **geometry-first GLB import** opened the door for artists who expect UVs, textures, and a round-trip to the formats their pipeline permits. That fidelity work is a **shared Desktop + XR core track** — not an XR-only feature, and not a detour from clay. It sits beside interaction polish so neither blocks the other.

**Loop we want:**

```
Import asset (keep what GLB/OBJ offers)
  → sculpt form (Desktop + XR)
  → paint / texture / alphas
  → export only what the target format is allowed to carry
```

**Failure mode we avoid:** import a textured GLB → grey clay → export “GLB” that looks empty in Blender/viewers → trust collapses.

### Foundations already in the core (build on these)

| Capability | Today |
|---|---|
| UV buffers + OBJ/SGL UV round-trip | Yes (`MeshData` tex coords / UV faces) |
| UV preview shader + texture bake export (Desktop) | Yes (limited; needs existing UVs) |
| Vertex PBR paint (color / rough / metal / mask) | Yes — Desktop + XR dock; clay-friendly defaults + Soften blend |
| Brush **alpha** stamps (PNG/JPG falloff) | Yes — shared gallery (Desktop thumbs + XR ALPHA tab); lock + angle ±360°; bilinear/contrast sampling |
| GLB/glTF import | Yes — **UVs + welded topo + live maps + vertex fallback + Draco** |
| GLB/glTF export | Yes — live maps when present; else bake from verts / COLOR_0 |
| UV seam / unwrap editor | **No** (Phase D) |
| Texture-map paint | **Yes (Phase C)** — paint into live map slots when UVs+maps; verts remain fallback |

### Honest export payload (permitted info only)

| Format | What we should promise |
|---|---|
| **`.sgl`** | Full project: geo + UVs + vertex paint + tool-relevant state |
| **`.obj`** | Geo + UVs (+ limited material channels when we have them) |
| **`.ply`** | Geo (± vertex color); no real UV/PBR maps |
| **`.stl`** | Geo only |
| **`.glb` / `.gltf`** | Geo + UVs + live or baked PBR maps (UV meshes) or vertex color + rough/metal factors |

Never advertise a format for data it cannot hold.

### Desktop vs XR on this track

| Layer | Desktop | XR |
|---|---|---|
| Shared core | Preserve UVs/maps on import; weld topology; paint buffers; export writers | Same mesh / same buffers |
| Dense creation | Seam editor, unwrap, texture slots, alpha library browser | — |
| In-headset | — | Import/export continuity, paint, ALPHA gallery + lock/angle, map preview — not a full Blender UV suite in MR |

Charter still applies: **Desktop invents density; XR gets the actions that keep sculpting flowing.**

### Phase A — Preserve what people expect on import

Necessary follow-through after geometry-first GLB.

- [x] **Keep UVs** when present (stop discarding `TEXCOORD_0`)  
- [x] **Weld / indexed topology** — avoid `toNonIndexed()` exploding verts so brushes stay connected  
- [x] **Bake or attach baseColor** (factors + optional texture sample → vertex color as first win)  
- [x] Carry **metal/rough factors** into vertex material defaults when maps aren’t ready yet  
- [x] **Draco** (`KHR_draco_mesh_compression`) so modern compressed GLBs open (`./draco/` decoder assets)  
- [x] Multi-mesh / multi-material imports stay separate Multimeshes with clear selection  
- ~~Optional meshopt~~ — **cut** (reopen only if real files fail)

*Outcome:* imports look closer to “the file I made,” not anonymous grey clay.

### Phase B — Export what the next app expects

- [x] Document per-format honesty in UI (OPTS / Files) — what travels, what doesn’t  
- [x] Strengthen **OBJ** (+ UV bake PNGs) as a textured hand-off (`Save .obj + maps` zip / XR `OBJ+MAPS`)  
- [x] **GLB/glTF export** — vertex paint baked to maps when UVs exist; else COLOR_0 + factors (`Save .glb` / XR `GLB`)  
- [x] XR OPTS: honest format cycle (`OBJ` / `OBJ+MAPS` / `GLB` / `PLY` / `STL`)  
- [x] Round-trip test: Khronos Duck → app GLB out → Blender import/export → app again (`tools/glb-roundtrip/`)  

*Outcome:* artists trust the Files language; no surprise empty materials.

### Phase C — Enhance painting

- [x] Richer **vertex** paint UX (channels, hardness, XR dock write flags) — baseline  
- [x] **Paint into textures** when UVs + map slots exist (albedo / rough / metal)  
- [x] Keep / sample **live maps** on GLB import (`ShaderPBR`)  
- [x] Improved UV bake padding (wider weighted dilation + second pass)  
- [x] **Clay-friendly metal/rough** defaults + auto ideals when selecting Paint (editable; eyedropper / slider edits stick)  
- [x] Shader wording: Matcap/Flat accept paint as color; PBR uses metal/rough  
- [ ] **Paint layers** — *maybe, Desktop-first, thin* (see PAINT brainstorm); not Substance stacks in XR  
- [x] Keep vertex paint as the always-available path (no UV required)  

*Outcome:* paint serves both clay look *and* engine/DCC-ready maps — without accidental chrome under PBR.

### Phase D — UV creation & editing

> **Why it may earn place:** map paint and honest textured export need UVs. Imported GLBs often already have them; clay you birth in-app often doesn’t. Artists who’ve fought seams in Mudbox/ZBrush know the pain — *hiding* seams (paint across, padding, projection) is different from *authoring* unwraps. We need both eventually: better bake/padding helps hide; Phase D creates or repairs the unwrap when Blender isn’t in the loop.

**Status (2026-08):** **not started as a build track** — *likely needed* later, **not a v1 blocker**. Phase C already paints into maps when UVs exist; UV-less clay still uses vertex paint.

| Item | Status |
|---|---|
| Keep imported UVs intact through sculpt ops (document limits) | Not done |
| Simple **project / planar / box** unwrap for primitives / UV-less meshes | Not done |
| **Seam mark → unwrap → pack** (Desktop-first) | Not done |
| Soften seam visibility for map paint (padding already improved in C) | Partial via C padding; more if needed |
| XR: preview UVs / “has UVs?” status | Not done |

*Outcome when built:* artists can unwrap or correct UVs in-app when Blender isn’t required; imported UVs stay first-class; Quest stays free of a Mudbox-class UV suite.

**Interest note:** Desktop owns seam/unwrap density; do not schedule ahead of ADD re-fit / product-cut polish.

### Phase E — Texture-based sculpting (alphas & stamps)

Build on existing brush alpha stamps — don’t invent a second system.

- [x] **Shared built-in alpha gallery** (Desktop + XR) — curated free stamps + custom import  
- [x] Desktop thumbnail gallery (primary) + combobox / import  
- [x] **XR ALPHA dock tab** — mini-gallery thumbs + lock/angle; shared stamp across allowlisted tools  
- [x] **α maps ON/OFF** — FORM/PAINT chip; gallery gated; Transform excluded  
- [x] **Stronger stamp application** — bilinear sample, contrast curve, stable tangent; freehand default, lock opt-in  
- [x] **Stamp angle** −360…360 — Desktop slider + presets; XR ALPHA-tab stick nudge + lock toggle  
- ~~Optional projection / stencil as a Phase E deliverable~~ — **fence / cut from schedule** (α stamps are the image story)  
- [ ] Optionally **narrow XR allowlist** to Primary + falloff tiers after session feedback  

*Outcome:* form-making uses images the way sculptors already expect (Nomad/ZBrush muscle memory), on open web + Quest — without mystery menus or Transform stamps.

**Pack note:** regenerate built-in PNGs with `npm run generate-alphas` (`tools/generate-alpha-pack.js` → `app/resources/alpha/`).

### PAINT tools brainstorm (earn-its-place)

**Today on PAINT:** `paint` · `masking` · `soften` (+ OPTS: eyedropper, paint-all, write channels, hardness/R/M) + **α stamps**.

**North star reminder:** this fork is *not* racing Substance Painter or Nomad feature-for-feature. Upstream SculptGL had **no paint layers**; Nomad went denser on mobile. Our edge is **open-web clay at human scale in the room** — alphas + Soften + map paint already beat original SculptGL for surface work. Steal *feel* lessons; don’t import a DCC panel farm.

#### Projection painting (on the fence)

Substance-style projection (paint from a camera/frustum, often onto **layers**) looks great and is *spatially* tempting in XR. But:

- Alphas (gallery + custom upload + lock/angle) already cover most “put this image on the clay” intent.  
- True projection shines for large decals / logo placement / photo wrap — a narrower job than daily clay paint.  
- Full Substance projection usually assumes **UV maps + layer stack + blend modes** — density we do not have, and should not bolt on just to unlock one tool.

| Path | Verdict |
|---|---|
| Chase Substance projection now | **No** — α maps are the near-term image story |
| Thin “project this α / image once from controller aim” later | **Maybe** — only if artists miss large-scale placement after living with stamps |
| Full projector + layer stack in XR dock | **No** — breaks presence-over-panels |

#### Paint layers (wanted, but careful)

Layers would be nice (non-destructive color / mask experiments). Original SculptGL never had them — so this is **net-new core**, not a port. The app *can* accept them if we keep the shape thin:

| Approach | Fit |
|---|---|
| **A. Thin Desktop layers** — few paint layers (e.g. 2–4), merge / clear / solo, bake down to current map/verts | **Acceptable later** — Desktop invents density; `.sgl` must store them |
| **B. XR layer manager** in the dock | **Reject near-term** — stick budget + panels kill flow |
| **C. Substance-style stacks** (blend modes, smart materials, projection per layer) | **Out of scope** — different product |

**Prerequisite for layers:** honest storage (`.sgl` + map slots), merge-to-base so XR/export never depend on an infinite stack. Masking already gives a poor-man’s “protect then paint”; layers earn place when that stops being enough.

| Idea | What it adds | Charter fit | Verdict |
|---|---|---|---|
| **Soften (landed)** | 1-ring color/material blend | High | **Keep** |
| **α stamps (landed)** | Image-shaped form + paint falloff | High — already the image story | **Keep; deepen pack, not tools** |
| **Smudge / smear** | Directional drag of color | Medium | **Park** |
| **Projection paint** | Frustum / aim-based image wrap | Medium spatial; needs UVs + usually layers | **Fence** — don’t build until α gaps are real |
| **Thin paint layers** | Non-destructive stacks | Medium — Desktop-first only | **Later maybe** — not XR dock chrome |
| **Clone stamp** | Sample → paint elsewhere | Low for XR stick budget | **Desktop-first if ever** |
| **Dedicated eraser** | Clear to clay default | Low — negative paint covers | **Skip** |
| **Channel-only brushes** | Rough-only / metal-only tools | Low — write flags exist | **Skip** |
| **Decal tool** | Place image once | Overlaps α + lock | **Skip** — improve stamps |
| **Cavity / AO paint** | Procedural dirt | Not core clay | **Skip near-term** |

**Stance:** surface stack is **good enough to sculpt**. Next wins are polish (feel, pack, README media) — not a painter product inside the dock. Projection and Substance layers are **cut from schedule**; thin Desktop layers stay *maybe*.

### Ordering reminder

```
A Preserve import  →  B Honest export  →  C Paint maps  →  D UV tools  →  E Alpha sculpt↑
         │                    │
         └──── can overlap with XR interaction polish ────┘
```

Do **not** block Workspace/dock/sculpt polish waiting on a full UV suite (Phase D).

### Engineering notes (this track)

- Prefer **shared core** in `ImportGLTF`, mesh UV/paint buffers, and exporters — XR and Desktop both call the same path (`additive, not divergent`).  
- `ShaderPBR` samples **live albedo / metalRough** when map slots exist; otherwise vertex attrs + IBL.  
- Controller GLBs already keep materials in Three — that path is **presentation**, not sculpt mesh data; don’t conflate the two.  
- Compression loaders (Draco, etc.) and GLTFExporter stay lazy-chunked so cold start for non-GLB users stays light.  
- Round-trip notes / Blender script: `tools/glb-roundtrip/`.

---

## Engineering principles

1. **Don’t fork the brush kernels** unless XR physics demand it — extend with `startXR` / `updateXR`.  
2. **Dock over HTML in MR** — passthrough browsers often hide DOM overlays.  
3. **Grab tools must clamp** — raw tip/ray deltas shred meshes; Move is “limited drag,” not free translate.  
4. **Log what the headset can’t show** — if it only fails on Quest, `/__xr_logs` is part of the product.  
5. **Desktop must keep working** — XR is a mode, not a replacement of the original app.  
6. **Earn its place** — see Usability charter before any new XR surface.  
7. **Preserve muscle memory** — if Undo is B, keep B; if Workspace lives on the left dock, keep it there. Move bindings only for a compelling reason; artists learn controllers fast and cognitive load rises when they drift.  
8. **Additive, not divergent** — prefer shared core improvements over XR-only forks of behavior.  
9. **Reality over simulation** — when XR and Desktop expectations conflict, prefer the interaction that feels most natural in physical space, provided it doesn’t compromise the shared sculpting core (Workspace over camera orbit, turntable over flying camera, dock on controller over floating windows).

---

## Quick mental model

| You want… | Upstream SculptGL | This fork |
|---|---|---|
| Sculpt on a monitor | Yes | Yes (unchanged path) |
| Sculpt in the room (MR) at true scale | No | Yes — primary surface |
| Closed VR studio | No | Yes |
| Same tools as Desktop | Yes | Yes (XR input remap) |
| Floating desktop UI in headset | N/A | **No** — redesign for XR |
| Official maintenance | No (abandoned) | Community XR continuation |

SculptGL supplies rendering, brushes, mesh, and undo. Above that — Workspace, dock, XR workflow, and interaction philosophy — is increasingly this project’s own layer: not just an “XR port,” but spatial-first creative software on a shared core. The **Materials / GLB / Paint** track deepens that shared core so imports and exports match what artists expect from modern assets.

### Three layers of innovation

| Layer | What it is | Examples |
|---|---|---|
| **1 — SculptGL core** | Shared sculpting substrate | Brushes, mesh, undo, picking |
| **2 — XR adaptation** | Presentation & input for the room | Controllers, stereo, Workspace, dock |
| **3 — Interaction philosophy** | Why decisions stick | Spatial first, never break flow, earn its place, additive not divergent, presence over panels, reality over simulation |

Controller code and shaders can be copied. A coherent interaction philosophy is harder to copy — and may be the lasting contribution. The same principles can eventually inform painting, terrain, CAD review, anatomy, education, or scene layout; this repo stays focused on **digital clay at human scale**.

---

## Long-term vision

The goal is not to recreate Desktop sculpting inside a headset. The goal is to make digital sculpting feel as immediate and physical as working with real clay, while preserving the strengths of an established Desktop workflow.

---

*Living document for `webxr-sculptgl` — v1.0 vision / design manifesto. Upstream reference: [github.com/stephomi/sculptgl](https://github.com/stephomi/sculptgl).*