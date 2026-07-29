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
| **Import external meshes** (OBJ/PLY/STL today; **glTF/GLB next**) | Bring Blender / CC0 assets into the clay scene |

### Specialized / quieter

Masking, clay/culling/wireframe, twist & local scale (until usage proves otherwise), paint PBR knobs (hardness / roughness / metallic), controller models, spectator desktop.

### Desktop (or much later)

Full yagui denseness, deep multires/remesh, Sketchfab upload flows, background/matcap/environment editing, keyboard/tablet pressure, nested property sheets. **Exception:** glTF/GLB import is shared-core near-term (desktop + XR), not “desktop only.”

### Workspace vs mesh transform (important split)

> **Workspace is the spatial relationship between the artist and the sculpture.** It affects placement, scale, orientation, and comfort — but never the mesh itself.

These solve different problems. Do not conflate them.

| **Workspace** (always XR) | **Mesh transform** (desktop parity) |
|---|---|
| Move sculpture in the room | Translate object in model space |
| Rotate sculpture | Rotate object / pivot / axes |
| Scale sculpture to body / room | Scale object for topology/export |
| Distance / recenter / turntable | Precision gizmo chrome |

Workspace is not a sculpt tool and not “camera controls.” It is something you **adjust** — a hero tab beside BRUSH and SURF, never nested inside them. Mesh **Transform** is now in XR (gizmo + multi-select) for posing parts; Workspace remains room placement.

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
| **Surface** | Paint, Mask |

That maps naturally to **BRUSH / SURF** dock tabs and to “never break flow.”

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

- BRUSH tab shows a short cycle of slots  
- Long-press a slot → replace with another BRUSH tool (e.g. Move → Crease)  

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
| GUI | yagui side panels | **In-world dock** + optional desktop spectator |
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
| Sculpt Dock | `src/xr/XRSculptDock.js` + `XRSculptDockState.js` | BRUSH / SURF / OPTS / SPACE; paint; file/scene; Transform; **head-facing float near left grip** |
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
| **BRUSH** | `shape` | Form brushes + grab tools + **Transform** |
| **SURF** | `surface` | Smooth, Flatten, Paint, Mask |
| **OPTS** | `opts` | Files, scene, paint opts, clay/negative/symmetry |
| **SPACE** | `workspace` | Artist ↔ sculpture placement (never the mesh) |

X cycles tabs. Stick ↕ cycles tools / option focus. Y fires the focused opt (or recenter in SPACE).

### Right hand (sculpt)

| Input | Action |
|---|---|
| Index trigger | Sculpt / Transform grab / gizmo handle |
| A | Negative (sculpt) |
| B | Undo |
| Stick click | Redo |
| Stick | Orbit (or tool assist while Twist / LocalScale held) |

### Left hand (dock + modifiers)

| Input | Action |
|---|---|
| Stick | Cycle tools/opts; Workspace scale/distance; paint wheel aim |
| Squeeze + stick | Radius ↕ / intensity ↔ (or Workspace turntable; wheel brightness) |
| X | Cycle dock tabs |
| Y | Toggle focused opt / Workspace recenter / paint picker mode |
| Index trigger | **Paint wheel lock**; **Transform multi-select** (hold + right trigger on meshes) |
| Both grips ~2.5s | Exit XR when DOM overlay is missing in MR |

### BRUSH tools

`brush` · `inflate` · `pinch` · `crease` · `drag` · `move` · `twist` · `localscale` · **`transform`**

### SURF tools

`smooth` · `flatten` · `paint` · `masking`

### OPTS — files & scene

| Row | Behavior |
|---|---|
| **SAVE project (.sgl)** | IndexedDB on the Quest origin |
| **LOAD last (.sgl)** | **Replaces** scene, re-fits Workspace |
| **IMPORT file** | Adds OBJ/PLY/STL/SGL/**GLB** — picker **may fail in XR**; prefer before enter / after exit |
| **EXPORT** + format | OBJ / PLY / STL → browser download / Files |
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

### Paint (SURF)

| Mechanic | Behavior |
|---|---|
| Swatches / wheel | Y toggles picker |
| Wheel aim | Stick = **preview only** (does not change paint color) |
| Wheel lock | **Left trigger** commits; stick must recenter before re-aim |
| Eyedropper / paint-all | Opts rows |
| R/I | Always-visible meters; squeeze+stick |

### Continuity vs import (Quest reality)

```
In XR:     Save / Load last  →  IndexedDB (.sgl)
Around XR: Desktop Files menu / 2D browser picker  →  OBJ PLY STL (GLB next)
Optional:  HTTPS URL fetch (addModelURL) when CORS allows
```

File pickers work best **before** entering XR (Quest Browser 2D) or after exit — not as a free Files browser inside immersive MR.

---

## Roadmap status

### Where we are (2026-07)

Quest MR/VR sculpting is a **real continuous loop**: session, Workspace, dock (BRUSH/SURF/OPTS/SPACE), form + paint, Transform, Save/Load/Export/Import GLB, Clear/Add. The left dock now **billboards toward the headset** and sits **clear of the controller face** so button discovery stays possible. Remaining near-term gaps are packaging polish (README link to tunnel DIY, spectator) — not core brush invention.

```
███████████████████████░  ~90% of first-class XR surface
│                       │
├─ Done: session · Workspace · BRUSH/SURF tools · Transform · paint wheel
│        · R/I · recovery · Save/Load/Export · Import GLB · Clear/Add
│        · head-facing dock (floats clear of left buttons)
└─ Next: README↔tunnel link · spectator · Import URL UX
Stretch: dock slot swap · hands · remesh · other-HMD
```

Left-hand priority (settled): **Workspace → squeeze (R/I or wheel brightness) → wheel lock / multi-select → tools**. Right: sculpt / Transform / negative / undo / redo.

### Done (working baseline)

- [x] Enter **MR (passthrough)** or **VR** from a setup UI  
- [x] **Workspace / SPACE** — fit, scale, distance, turntable, tilt, recenter, enter-size feedback  
- [x] Stereo draw without one eye wiping the other  
- [x] Official controller models (WebXR input profiles)  
- [x] Left-hand **Sculpt Dock** — tabs **BRUSH / SURF / OPTS / SPACE** (labels; internals still `shape`/`surface`/…)  
- [x] Dock **faces the headset** while tracking left-arm position (grip follow, world billboard — not wrist-locked)  
- [x] Dock floats **above the button deck** so new users can still see left-controller controls  
- [x] Right-trigger sculpt with ray picking  
- [x] Brush, inflate, pinch, crease, smooth, flatten, paint, masking  
- [x] Drag + Move (limited grab); Twist (wrist roll / stick); Local Scale (push-pull / stick)  
- [x] **Transform** + desktop gizmo in XR (free-grab, axis handles, L+R multi-select)  
- [x] Paint swatches + **color wheel** (stick = preview; **left trigger** = lock)  
- [x] Paint **eyedropper** + **paint-all** from dock Opts  
- [x] Symmetry-aware XR paths for grab tools  
- [x] Undo / Redo in XR (Right B / stick click / Opts)  
- [x] Intensity/radius always visible + squeeze+stick adjust (toast / haptic)  
- [x] **Save / Load** `.sgl` (IndexedDB) + **Export** OBJ/PLY/STL from Opts  
- [x] **Import** OBJ/PLY/STL/SGL/**GLB·glTF** (desktop Files + XR OPTS Import; geometry-first)  
- [x] **Clear scene** + **Add** sphere/cube/cylinder/torus from Opts  
- [x] Remote log relay for Quest debugging  
- [x] Dual-grip hold to exit when DOM overlay is missing in MR  
- [x] DIY HTTPS tunnel notes (`tools/xr-tunnel.txt`) for Quest testing  

### Next (near-term)

1. [x] **glTF / GLB import** (shared core — desktop Files + XR OPTS Import; geometry-first via Three GLTFLoader)  
2. [ ] Document Quest + tunnel setup in README (link `tools/xr-tunnel.txt`)  
3. [ ] **Spectator** desktop view polish while headset is active  
4. [ ] Optional **Import URL** dock/desktop affordance (`addModelURL` already exists; needs UX + CORS guidance)  
5. [ ] Dock placement fine-tune from more tester feedback (offset / size only — keep head-facing follow)  

**Files language (keep clean):**

| Action | Format | Purpose |
|---|---|---|
| **Save / Load** | `.sgl` | Native project continuity — IndexedDB in XR |
| **Export** | `.obj` / `.ply` / `.stl` | Hand off to other programs |
| **Import** | `.obj` / `.ply` / `.stl` / `.sgl` / **`.glb` / `.gltf`** | Adds to scene (desktop Files / 2D picker / XR OPTS Import) |
| **Import URL** | HTTPS + CORS | Hosted CC0 / personal static hosts (`addModelURL`) |

### Later (stretch)

- [ ] Lightweight dock slot replace (long-press primary → swap tool; no settings panel)  
- [ ] Optional **blend / smudge** surface tool (parked — earn its place later)  
- [ ] Freeform **group** free-grab while multi-selected (gizmo group move works today; optional restore)  
- [ ] Hand tracking sculpt (optional path beside controllers)  
- [ ] Multi-resolution / remesh flows that feel safe at Quest framerate  
- [ ] Cloud / Sketchfab-style share from XR (optional; local continuity comes first)  
- [ ] **Other-headset validation** (Pico / PC VR / etc.) — opportunistic  
- [ ] Evaluate Nomad-era UX lessons without abandoning the open SculptGL core  

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

SculptGL supplies rendering, brushes, mesh, and undo. Above that — Workspace, dock, XR workflow, and interaction philosophy — is increasingly this project’s own layer: not just an “XR port,” but spatial-first creative software on a shared core.

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