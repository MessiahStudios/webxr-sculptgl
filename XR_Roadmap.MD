# XR Roadmap — webxr-sculptgl

> **Mission:** Build the best place to shape digital clay at human scale using open web technologies, while preserving the strengths of an established desktop sculpting workflow.

How this project extends [stephomi/sculptgl](https://github.com/stephomi/sculptgl) for Meta Quest MR/VR, and how that differs from the abandoned upstream.

This document has a consistent hierarchy: **long-term vision → product philosophy → usability charter → product scope → engineering architecture → implementation roadmap**. Each layer reinforces the one above it.
---

## Product philosophy

> **XR shouldn’t be a viewer bolted on.**
> **It should be the primary sculpting surface.**

Desktop edits **data**. XR evaluates and creates **form**.

| Desktop | XR |
|---|---|
| Parameters | Proportion |
| Files | Silhouette |
| Topology | Gesture |
| Precision transforms | Volume |
| Dense panels | Presence |
| Editing on a screen | Spatial judgment in the room |

Those are fundamentally different strengths. The charter below is the filter for every future decision — so the project stays coherent over years, not months.

```
Desktop → data → precision → files
XR      → form → presence → spatial judgment → continuous sculpting
```

**Failure mode we avoid:** export from desktop → open on Quest → discover wrong scale → go back to desktop.

**Loop we want:** sculpt → evaluate at true scale → keep sculpting → evaluate → continue.

---

## Usability charter

### Every feature must earn its place in XR

Before adding anything, ask:

1. Does it improve sculpting?
2. Does it improve spatial judgment?
3. Does it reduce friction?
4. Would a sculptor naturally expect to use it while standing at a real sculpture?

If the answer is no, it’s probably a **desktop** feature.

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

Unlike desktop sculpting, the **environment matters**. Artists judge scale against tables, chairs, doors, hands, and faces. That contextual scale is one of XR’s unique strengths — and a reason Workspace is a hero feature, not a side tab.

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

If a feature needs dozens of windows, nested menus, modal dialogs, tiny text, or property sheets, desktop is the better environment — spend the effort there.

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
| **Workspace** (place, scale, rotate, distance, recenter, turntable) | Body-scale judgment — the XR advantage |
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

Full yagui denseness, deep multires/remesh, Sketchfab upload flows, background/matcap/environment editing, keyboard/tablet pressure, nested property sheets. **Exceptions (shared core):** glTF/GLB import already spans desktop + XR; the **Materials / GLB / Paint** track (UVs, textures, honest export, UV tools, alphas) is also shared-core — Desktop owns dense editors, XR owns in-flow actions.

### Workspace vs mesh transform (important split)

> **Workspace is the spatial relationship between the artist and the sculpture.** It affects placement, scale, orientation, and comfort — but never the mesh itself.

These solve different problems. Do not conflate them.

| **Workspace** (always XR) | **Mesh transform** (desktop parity) |
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
| Architecture assumes a **single desktop camera** + screen-space picking | Controllers, stereo eyes, and stage placement must be *added*, not toggled |
| Tools are solid; input is 2D (`mouseX/Y`, unproject, screen-radius brushes) | The win is **reuse tool math**, remap **input + presentation** |
| No WebXR, no controller dock, no passthrough | MR/VR is entirely this fork’s job |

Live upstream demo (desktop only): [stephaneginier.com/sculptgl](http://stephaneginier.com/sculptgl).

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

Not two apps. One core, two presentations. That is the maintenance advantage — and why this fork can grow into an XR interaction layer without abandoning the desktop path.

That is the opposite of “rewrite sculpting for VR.” It is also different from older WebVR forks that often replaced UI with opaque button maps and left desktop parity behind.

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
3. **Eyes** — per-eye viewport + scissor clear; RGBM / direct-output so stereo doesn’t look ghosted.
4. **Aim** — right-controller target ray → scene-space hit → same tools as desktop.
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
| Tools | Full desktop set | Same tool classes; XR paths where 2D deltas fail |
| GUI | yagui side panels | **In-world dock** + desktop Files; **Local Snapshot**; later **Spectator** (invite) |
| Undo | CTRL+Z / UI | Also **Right B** / stick-click / Opts |
| Status | Abandoned | Active XR port on top of the frozen core |

Other community approaches (for context, not dependencies):

- Older **WebVR** forks (e.g. button-map only, little desktop GUI parity).
- Broader WebXR forks (e.g. SculptXR) that also target Quest AR/VR — valuable, but this roadmap describes **this** repo’s choices: additive XR layer, dock-first MR UX, and remote log tooling.

---

## Architecture map (key files)

| Piece | Location | Role |
|---|---|---|
| Session + enter/exit | `src/xr/WebXRSession.js` | MR/VR start, frame loop, grip-exit, stage UI hooks |
| Setup panel | `src/xr/XRSetup.js` | Mode + controller profile before enter |
| Controllers | `src/xr/XRControllerModels.js` | Official WebXR input-profile GLBs; poses dock host; passes viewer pose for billboard |
| Sculpt Dock | `src/xr/XRSculptDock.js` + `XRSculptDockState.js` | FORM / PAINT / OPTS / SPACE; paint; file/scene; Transform; **Local Snapshot / Record**; **head-facing float near left grip** |
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
| **FORM** | `form` | Geometry deform + grab tools + Smooth / Flatten + **Transform** |
| **PAINT** | `paint` | Paint, Mask (room for future Blend); paint chrome still in OPTS when Paint tool active |
| **OPTS** | `opts` | Files, scene, paint opts, clay/symmetry (negative = right grip) |
| **SPACE** | `workspace` | Artist ↔ sculpture placement (never the mesh) |

X cycles tabs. Stick ↕ cycles tools / option focus. Y fires the focused opt (or recenter in SPACE).

### Right hand (sculpt)

| Input | Action |
|---|---|
| Index trigger | Sculpt / Transform grab / gizmo handle |
| Grip (side) | **Hold = temporary negative/invert** on tools that support it (desktop Alt) |
| Both grips | **Hold = temporary Smooth** (desktop Shift); then right trigger sculpts — exit still = both grips ~2.5s *without* trigger |
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

`paint` · `masking` · **`soften`** (desktop: “Soften (blend colors)”; XR: “blend colors”)

### OPTS — files & scene

| Row | Behavior |
|---|---|
| **SAVE project (.sgl)** | IndexedDB on the Quest origin |
| **LOAD last (.sgl)** | **Replaces** scene, re-fits Workspace |
| **IMPORT file** | Adds OBJ/PLY/STL/SGL/**GLB** — picker **may fail in XR**; prefer before enter / after exit |
| **EXPORT** + format | OBJ / OBJ+MAPS / **GLB** / PLY / STL → browser download / Files |
| **LOCAL SNAPSHOT** | PNG of the virtual sculpt view (no passthrough) |
| **START / STOP RECORD** | WebM video (+ FPS 15/24/30 · Small/Balanced/High clean presets) |
| **CLEAR scene** | Empty clay |
| **ADD …** | Stick ↔ cycles sphere/cube/cylinder/torus; Y places (**adds**, stacks at origin until Transform) |

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
| Soften | 1-ring blend of color / rough / metal (+ maps); desktop Paint↔Blend dual button |
| Clay-friendly PBR | Rough/metal default to clay ideals (~55% / ~4%); chrome-ish values auto-correct when selecting Paint until the artist edits (or eyedrops). Matcap/Flat show paint as **color**; PBR uses metal/rough — desktop hint + XR PAINT note |

### Continuity vs import (Quest reality)

```
In XR:     Save / Load last  →  IndexedDB (.sgl)
Around XR: Desktop Files menu / 2D browser picker  →  OBJ PLY STL SGL GLB/glTF
Optional:  HTTPS URL fetch (addModelURL) when CORS allows
```

File pickers work best **before** entering XR (Quest Browser 2D) or after exit — not as a free Files browser inside immersive MR.

**Honest import note:** GLB/glTF import keeps **indexed topology**, **UVs**, **live albedo/metalRough textures** (ShaderPBR samples them), and still fills vertex paint as fallback. Draco via `./draco/`. Export prefers live maps when present.

---

## Roadmap status

### Where we are (2026-07-31)

Quest MR/VR sculpting remains a **real continuous loop**. Capture and Materials through **Phase C** are landed. Latest: **shared alpha gallery** (built-in free stamps + import), stronger stamp feel (bilinear / contrast / lock), and **stamp angle ±360°** with nudge presets — Desktop + XR.

```
█████████████████████████  ~97% of first-class XR surface
│                        │
├─ Done: session · Workspace · FORM/PAINT · Transform · paint · Soften · Save/Load
│        · Import GLB (UVs + live maps + Draco) · Export GLB / OBJ / OBJ+MAPS / PLY / STL
│        · Paint into maps · brush feel · clay PBR defaults + shader hint
│        · Shared alpha gallery + stamp lock/angle · head-facing dock
│        · Local Snapshot PNG + video
├─ Next: README↔tunnel · Import URL UX · optional Studio (UI) record
├─ Parallel: Materials Phase D — UV create/edit (when needed); Phase E polish (projection)
├─ Collaboration: Spectator (feasible — needs signaling; see below) · Co-sculpt (later)
└─ Stretch: dock slot swap · hands · remesh · other-HMD · projection paint / layers / smudge
```

#### Recent agreed list — what we said vs what advanced

| Agreed item | Advanced? | Notes |
|---|---|---|
| **Local Snapshot PNG** | **Yes** | Desktop Camera + XR OPTS; virtual view only |
| **Start/Stop video record** | **Yes** | Desktop + XR; FPS 15/24/30; Small/Balanced/High (clean bitrates). For post (DaVinci etc.), not OS Cast |
| **XR capture ≈ Cast-like** | **Partial → Yes (app-side)** | Head pose + ~70° FOV; dock + controllers in frame. Still **not** OS Cast / passthrough |
| **Desktop encode efficient** | **Yes** | Scales live view into preset sizes (not raw retina) |
| **Cache freed when idle** | **Yes** | Scratch FBO/RT/encode canvas disposed after PNG, Stop, XR exit |
| **Studio / UI-in-frame record** | **Design only** | Optional later; speed-sculpt post already covered by Local Record → Resolve |
| **GLB import fidelity** | **Yes** | Phase A + live map slots (Phase C) |
| **GLB export** | **Yes** | Phase B; prefers live maps when present |
| **Paint into maps** | **Yes** | Phase C — overwrite imported texels; verts remain UV-less fallback |
| **Paint brush feel + Soften** | **Yes** | Denser stamps, flow, XR trigger→intensity; Soften on PAINT (desktop dual button + “blend colors”) |
| **Clay-friendly paint / shader hint** | **Yes** | Defaults ~R55 / M4; auto-correct chrome until user edits; Matcap/Flat vs PBR copy on desktop + XR |
| **Shared alpha gallery** | **Yes** | Built-in free stamps (`AlphaLibrary` + generate script); Desktop thumbs; XR OPTS cycle; custom import |
| **Alpha stamp feel + angle** | **Yes** | Bilinear + contrast; lock stamp; angle −360…360 with ±15° / 0° / 90° presets (Desktop) and stick nudge (XR) |
| **Spectator / Co-sculpt** | **No** | Feasible (see Spectator feasibility); needs signaling — not built |

#### Gaps that still need attention

1. **Bake / paint polish** — seam padding improved; further UV tools are Phase D.  
2. **README ↔ tunnel** — `tools/xr-tunnel.txt` exists; README link still unchecked.  
3. **Import URL UX** — `addModelURL` exists; CORS / dock affordance still thin.  
4. **Optional Studio record** — desktop UI in frame; not built (Local Record + OS capture cover most needs).  
5. **XR capture polish** — aim ray visibility, MR plate, framing tweaks remain stretch.

Left-hand priority (settled): **Workspace → squeeze (R/I or wheel brightness) → wheel lock / multi-select → tools**. Right: sculpt / Transform / **grip = negative** / undo / redo. **Both grips = Smooth hold** (desktop Shift).

### Done (working baseline)

- [x] Enter **MR (passthrough)** or **VR** from a setup UI  
- [x] **Workspace / SPACE** — fit, scale, distance, turntable, tilt, recenter, enter-size feedback  
- [x] Stereo draw without one eye wiping the other  
- [x] Official controller models (WebXR input profiles)  
- [x] Left-hand **Sculpt Dock** — tabs **FORM / PAINT / OPTS / SPACE** (ids `form` / `paint` / …; legacy `shape`/`surface` migrate)  
- [x] Dock **faces the headset** while tracking left-arm position (grip follow, world billboard — not wrist-locked)  
- [x] Dock floats **above the button deck** so new users can still see left-controller controls  
- [x] Right-trigger sculpt with ray picking  
- [x] Brush, inflate, pinch, crease, smooth, flatten, paint, masking, **soften**  
- [x] Drag + Move (limited grab); Twist (wrist roll / stick); Local Scale (push-pull / stick)  
- [x] **Transform** + desktop gizmo in XR (free-grab, axis handles, L+R multi-select)  
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
- [x] **Local Snapshot / Record** (desktop Camera + XR OPTS)  
  - PNG still + Start/Stop WebM (VP9 when available)  
  - FPS **15 / 24 / 30** (default 24); quality **Small 720p / Balanced 900p / High 1080p** with clean bitrates  
  - Desktop: live sculpt view scaled into encode canvas  
  - XR: Cast-like mono (head pose + ~70° FOV) with **clay + brush/gizmo + controllers + dock**  
  - Scratch buffers disposed when idle  

### Next (near-term)

1. [x] **glTF / GLB import** (Phase A — see Materials track)  
2. [x] **GLB export** + **paint-into-maps** (Phase B / C)  
3. [ ] Document Quest + tunnel setup in README (link `tools/xr-tunnel.txt`)  
4. [x] **Local Snapshot / Record** (see Done + Collaboration & capture)  
5. [ ] Optional **Import URL** dock/desktop affordance (`addModelURL` already exists; needs UX + CORS guidance)  
6. [ ] Dock placement fine-tune from more tester feedback (offset / size only — keep head-facing follow)  
7. [ ] Optional **Studio record** (desktop UI in frame) for speed-sculpt / tutorial exports — default stays sculpt-view-only  
8. [x] **Paint brush feel** + **Blend (Soften)** on PAINT tab  
9. [x] **Clay-friendly PBR paint params** + shader acceptance hint (desktop + XR)  
10. [x] **Shared alpha gallery** + stamp feel (lock / angle ±360°) — Desktop + XR  

### Collaboration & capture (naming — keep distinct)

| Feature | Meaning | Status |
|---|---|---|
| **Local Snapshot** | Image or short video of the *virtual* sculpt view — review or share later | **Done** — desktop + XR; clean presets; XR includes dock/controllers; not Cast/passthrough |
| **Studio record** | Same encode path but includes **desktop yagui** (tools, saves, panels) for speed sculpts | **Agreed design** — not built; OS window capture works today |
| **XR presentation capture** | Richer demo composite (aim rays, MR plate, framing) | **Mostly landed** (dock + controllers); polish remains stretch |
| **Spectator** | Friend joins by invite code and **sees your live clay/scene** (view-only). Target: **headset-to-headset** — each person in their own room/passthrough; shared virtual sculptures, not a copy of your camera feed. Desktop viewer is an allowed thinner first step. Precursor to **Co-sculpt**. | **Feasible, not built** — needs signaling + sync (see below) |
| **Desktop mirror** | Same machine / same origin shows live virtual view while XR is active | Easier adjacent step — **not** Spectator |
| **Cast / Stream** | Twitch / YouTube / Quest Cast / OS share | Outside our app |
| **Co-sculpt** | Friend **edits** the same clay (Spectator + write authority) | Later — after Spectator |

Do **not** call Local Snapshot, Local Record, or desktop mirror “Spectator.”  
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
| **B. Video of your virtual view** (WebRTC media) | Your camera framing as a flat screen | Easier desktop/teaching step; weaker on headset |
| **C. Local Snapshot / Record** | A file later — not live | **Not** Spectator |

| Piece | Possible? | Notes |
|---|---|---|
| Invite code + match peers | **Yes, needs signaling** | WebSocket / LiveKit / etc. — not free forever on static hosting alone |
| Shared mesh sync (A) | **Yes** | Harder than video; same foundation Co-sculpt needs |
| Video fallback (B) | **Yes** | Reuses Local Record–style encode; fine for desktop guest |
| Friend headset + own passthrough | **Yes** | Each runs their own WebXR session; we only sync *virtual* content |
| Stream your passthrough to them | **No / out of scope** | OS / privacy / WebXR limits — they use *their* camera |
| Zero-server cross-device | **No** | Signaling (+ often TURN) required |

**Phased path:**
1. Design spike — signaling choice; prefer **scene sync (A)** as the real product; video (B) optional for desktop guest  
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
| **Import** | `.obj` / `.ply` / `.stl` / `.sgl` / **`.glb` / `.gltf`** | Adds to scene (desktop Files / 2D picker / XR OPTS Import) |
| **Import URL** | HTTPS + CORS | Hosted CC0 / personal static hosts (`addModelURL`) |

### Later (stretch)

- [ ] Lightweight dock slot replace (long-press primary → swap tool; no settings panel)  
- [x] **Paint brush feel** (flow / denser stamp spacing; XR trigger→Tablet intensity)  
- [x] **Blend (Soften)** under **PAINT** tab — 1-ring mix of color/rough/metal (+ maps); write channels / mask; desktop “blend colors” dual button  
- [x] **Clay-friendly rough/metal defaults** + auto-correct chrome until edited; Matcap/Flat vs PBR copy  
- [x] **Shared alpha gallery** — built-in free stamps + custom import; Desktop thumbs; XR OPTS cycle  
- [x] **Alpha stamp feel** — bilinear + contrast; stable orientation; lock stamp default when alpha selected  
- [x] **Stamp angle** −360…360 with friendly nudges/presets (Desktop + XR)  
- [ ] Smudge / projection paint / layers — park until Soften earns more surface tools  
- [ ] Freeform **group** free-grab while multi-selected (gizmo group move works today; optional restore)  
- [ ] Hand tracking sculpt (optional path beside controllers)  
- [ ] Multi-resolution / remesh flows that feel safe at Quest framerate  
- [ ] Cloud / Sketchfab-style share from XR (optional; local continuity comes first)  
- [ ] **Spectator** — invite-code live virtual watch (feasible — signaling + WebRTC; Desktop viewer v1)  
- [ ] **XR presentation capture polish** — aim rays, MR plate options, framing tweaks  
- [ ] **Studio record** — optional desktop UI compositing / guided OS capture for speed sculpts  
- [ ] **Co-sculpt** — shared editing (after Spectator)  
- [ ] **Other-headset validation** (Pico / PC VR / etc.) — opportunistic  
- [ ] Evaluate Nomad-era UX lessons without abandoning the open SculptGL core  
---

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
| UV preview shader + texture bake export (desktop) | Yes (limited; needs existing UVs) |
| Vertex PBR paint (color / rough / metal / mask) | Yes — desktop + XR dock; clay-friendly defaults + Soften blend |
| Brush **alpha** stamps (PNG/JPG falloff) | Yes — shared gallery (Desktop thumbs + XR OPTS); lock + angle ±360°; bilinear/contrast sampling |
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
| In-headset | — | Import/export continuity, paint, alpha cycle + lock/angle, map preview — not a full Blender UV suite in MR |

Charter still applies: **Desktop invents density; XR gets the actions that keep sculpting flowing.**

### Phase A — Preserve what people expect on import

Necessary follow-through after geometry-first GLB.

- [x] **Keep UVs** when present (stop discarding `TEXCOORD_0`)  
- [x] **Weld / indexed topology** — avoid `toNonIndexed()` exploding verts so brushes stay connected  
- [x] **Bake or attach baseColor** (factors + optional texture sample → vertex color as first win)  
- [x] Carry **metal/rough factors** into vertex material defaults when maps aren’t ready yet  
- [x] **Draco** (`KHR_draco_mesh_compression`) so modern compressed GLBs open (`./draco/` decoder assets)  
- [ ] Optional **meshopt** / better external `.gltf` + `.bin` path later  
- [x] Multi-mesh / multi-material imports stay separate Multimeshes with clear selection  

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
- [ ] Layers or mask-aware map workflows if they earn their place (charter)  
- [x] Keep vertex paint as the always-available path (no UV required)  

*Outcome:* paint serves both clay look *and* engine/DCC-ready maps — without accidental chrome under PBR.

### Phase D — UV creation & editing

- [ ] Keep imported UVs intact through sculpt ops that can break unwraps (document limits)  
- [ ] Simple **project / planar / box** unwrap for primitives and UV-less meshes  
- [ ] **Seam mark → unwrap → pack** (Desktop-first; density belongs on monitor)  
- [ ] XR: preview UVs / “has UVs?” status — not a full seam editor in MR on day one  

*Outcome:* artists can unwrap in-app when Blender isn’t in the loop; imported UVs stay first-class.

### Phase E — Texture-based sculpting (alphas & stamps)

Build on existing brush alpha stamps — don’t invent a second system.

- [x] **Shared built-in alpha gallery** (Desktop + XR) — curated free stamps + custom import  
- [x] Desktop thumbnail gallery (primary) + combobox / import  
- [x] XR OPTS: cycle alpha stamps (stick ↔) for form + paint tools  
- [x] **Stronger stamp application** — bilinear sample, contrast curve, stable tangent, lock-on when stamp selected  
- [x] **Stamp angle** −360…360 — Desktop slider + −15°/+15° / 0°/90° presets; XR stick nudge + lock toggle  
- [ ] Optional stencil / projection workflows if they earn spatial presence  
- [ ] Alphas that also inform paint intensity where it helps  

*Outcome:* form-making uses images the way sculptors already expect (Nomad/ZBrush muscle memory), on open web + Quest.

**Pack note:** regenerate built-in PNGs with `npm run generate-alphas` (`tools/generate-alpha-pack.js` → `app/resources/alpha/`).

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
9. **Reality over simulation** — when XR and desktop expectations conflict, prefer the interaction that feels most natural in physical space, provided it doesn’t compromise the shared sculpting core (Workspace over camera orbit, turntable over flying camera, dock on controller over floating windows).

---

## Quick mental model

| You want… | Upstream SculptGL | This fork |
|---|---|---|
| Sculpt on a monitor | Yes | Yes (unchanged path) |
| Sculpt in the room (MR) at true scale | No | Yes — primary surface |
| Closed VR studio | No | Yes |
| Same tools as desktop | Yes | Yes (XR input remap) |
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

The goal is not to recreate desktop sculpting inside a headset. The goal is to make digital sculpting feel as immediate and physical as working with real clay, while preserving the strengths of an established desktop workflow.

---

*Living document for `webxr-sculptgl` — v1.0 vision / design manifesto. Upstream reference: [github.com/stephomi/sculptgl](https://github.com/stephomi/sculptgl).*