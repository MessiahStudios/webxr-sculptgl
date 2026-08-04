# WebXR Sculpt

<p align="center">
  <img src="docs/media/webxr-sculpt-logo.png" alt="WebXR Sculpt — sculpt, paint, create anywhere" width="420" />
</p>

**An open, WebXR-first digital clay studio built on [SculptGL](https://github.com/stephomi/sculptgl)** — for Desktop, VR, and Mixed Reality. Optimized for Meta Quest.

> Shape digital clay at human scale in the browser — immersive on headset, full Desktop on the same core. Best experience on Meta Quest MR/VR.

**Product:** WebXR Sculpt · **Studio:** [Messiah Studios](https://github.com/MessiahStudios) · **Repo:** [MessiahStudios/webxr-sculptgl](https://github.com/MessiahStudios/webxr-sculptgl)

---

## Where we are toward release

| Layer | Status |
|---|---|
| **Core sculpt loop (Quest + Desktop)** | Done — continuous clay, dock, Workspace, Transform, paint/Soften, α stamps |
| **Desktop-only sessions** | Done — full yagui loop on PC **or** Quest Browser (Cancel XR setup); enter/exit immersive anytime |
| **Files & materials** | Done through Phase C — GLB in/out, map paint, honest export |
| **Presentation / brand** | Logo hero on GitHub; welcome splash on load; UI accents matched to logo cyan `#58A8F0` / amber `#F7974B` |
| **Ship-ready “final cut”** | **~96%** — live at [`messiahstudios.site/webxr-sculpt/`](https://www.messiahstudios.site/webxr-sculpt/); leftover is polish + optional CI |

**Channels (same repo):**

| | Dev | Stable v1 |
|---|---|---|
| Build | `npm run release` | `npm run release:stable` → `dist/v1/` |
| How-to Camera exporters | Yes | **Removed** |
| Remote `/__xr_logs` | Yes (`npm run server`) | **Off** (static Pages) |
| XR setup chip | Headset + desktop WebXR | Same rules — **phones suppressed** |
| Host | `xr-dev.messiahstudios.site` | [`messiahstudios.site/webxr-sculpt/`](https://www.messiahstudios.site/webxr-sculpt/) |

Hosting steps: **[`docs/STABLE_HOSTING.md`](./docs/STABLE_HOSTING.md)**.

**Also landed for live:** Transform gizmo bake flush · smartphone Tools chrome · responsive welcome · app favicon · Android phone XR gate (Quest still gets setup).

**Deferred on the cut list only for the product naming moment:** none required in the stable build (How-to UI already stripped there). Dev keeps helpers until you drop them from Camera entirely.

**Dock offset / size:** Done — head-facing float, plane aspect = canvas, FORM reflow.

**Not required for v1:** Spectator, hand tracking, Phase D UV suite, remesh, paint layers.

Deep checklist: **[`XR_Roadmap.MD`](./XR_Roadmap.MD)** → *Roadmap status* / *Path to product cut*.

---

## Brand

| Role | Hex | Notes |
|---|---|---|
| Accent (cool) | `#58A8F0` | Logo “XR” / ring / UI focus |
| Glow | `#51D1F8` | Stylus tip bloom (sparingly in-app) |
| Accent (warm) | `#F7974B` | Logo “SCULPT” / PAINT / warm UI |
| Ground | `#16181E` | Desktop / dock charcoal |

Assets: [`docs/media/webxr-sculpt-logo.png`](./docs/media/webxr-sculpt-logo.png) (hero) · [`app/resources/brand/`](./app/resources/brand/) (app + welcome splash)

**Welcome splash:** first load shows the logo + Messiah Studios links; **Don’t show again** (`sculptgl.welcome.hide`); **Let’s Sculpt** dismisses on Desktop, or opens XR setup on headset.

---

## Highlights

| | |
|---|---|
| **Quest MR/VR** | Continuous sculpt loop with controllers, passthrough or studio VR |
| **Desktop anytime** | Full Desktop UI without immersive — PC monitor or Quest Browser (Cancel setup); WebXR chip to enter later |
| **Sculpt Dock** | FORM / PAINT / OPTS / SPACE — head-facing helper (aspect-matched plane; offset clears controller buttons) |
| **Workspace** | Clay in the *room* (scale, distance, turntable) — seats ahead of the headset on enter / SPACE recenter |
| **Surface tools** | Paint, Soften (blend colors), masking, shared **alpha stamp gallery** |
| **Materials** | Clay-friendly PBR paint; GLB round-trip with UVs + live maps when present |
| **Files** | Save/Load `.sgl`, Import file / **Import URL** (https + CORS; paste-friendly), honest export OBJ / OBJ+MAPS / GLB / PLY / STL |
| **Capture** | Local Snapshot PNG + video (virtual view — not OS Cast) |

---

## Tool palette

Same icons on **Desktop Form / Paint** and the **XR dock**. Full usage guide: **[`docs/HOW_TO.md`](./docs/HOW_TO.md)**.

### Form

| <img src="app/resources/tool-icons/brush.png" width="56" height="56" alt="Brush" /> | <img src="app/resources/tool-icons/inflate.png" width="56" height="56" alt="Inflate" /> | <img src="app/resources/tool-icons/pinch.png" width="56" height="56" alt="Pinch" /> | <img src="app/resources/tool-icons/crease.png" width="56" height="56" alt="Crease" /> | <img src="app/resources/tool-icons/drag.png" width="56" height="56" alt="Drag" /> |
|:---:|:---:|:---:|:---:|:---:|
| Brush | Inflate | Pinch | Crease | Drag |

| <img src="app/resources/tool-icons/move.png" width="56" height="56" alt="Move" /> | <img src="app/resources/tool-icons/twist.png" width="56" height="56" alt="Twist" /> | <img src="app/resources/tool-icons/localscale.png" width="56" height="56" alt="Local scale" /> | <img src="app/resources/tool-icons/smooth.png" width="56" height="56" alt="Smooth" /> | <img src="app/resources/tool-icons/flatten.png" width="56" height="56" alt="Flatten" /> | <img src="app/resources/tool-icons/transform.png" width="56" height="56" alt="Transform" /> |
|:---:|:---:|:---:|:---:|:---:|:---:|
| Move | Twist | Local scale | Smooth | Flatten | Transform |

### Paint

| <img src="app/resources/tool-icons/paint.png" width="56" height="56" alt="Paint" /> | <img src="app/resources/tool-icons/masking.png" width="56" height="56" alt="Mask" /> | <img src="app/resources/tool-icons/soften.png" width="56" height="56" alt="Soften" /> |
|:---:|:---:|:---:|
| Paint | Mask | Soften |

---

## How to

| Guide | Contents |
|---|---|
| **[`docs/HOW_TO.md`](./docs/HOW_TO.md)** | Tool icons explained · Desktop + Quest controls · α stamps · first-session tips |
| [`tools/xr-tunnel.txt`](./tools/xr-tunnel.txt) | HTTPS tunnel for Quest Browser |
| [`XR_Roadmap.MD`](./XR_Roadmap.MD) | Design charter, architecture, Phase A–E status |

---

## Screenshots

Brand hero above is the GitHub product image. Optional Quest MR / Desktop stills can still land under `docs/media/`.

---

## Quick start

### Desktop

```bash
npm install
npm run release
npm run server
```

Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/)

```bash
npm run boot:test   # release + server in one step
```

### Quest (HTTPS tunnel)

WebXR on Quest needs HTTPS. Serve locally, then point any tunnel (Cloudflare, ngrok, …) at port **8080**.

1. `npm run release && npm run server`
2. Tunnel → `http://127.0.0.1:8080`
3. On the headset browser, open your `https://…` host and hard-refresh after rebuilds

Full DIY walkthrough: [`tools/xr-tunnel.txt`](./tools/xr-tunnel.txt)  
Live Quest/Desktop logs while testing: [http://127.0.0.1:8080/__xr_logs](http://127.0.0.1:8080/__xr_logs)

### Stable v1 (GitHub Pages / main site)

```bash
npm run release:stable   # → dist/v1/ (How-to Camera buttons stripped; no __xr_log relay)
```

**Live:** [`https://www.messiahstudios.site/webxr-sculpt/`](https://www.messiahstudios.site/webxr-sculpt/)

Copy `dist/v1/` into [MessiahStudios.github.io](https://github.com/MessiahStudios/MessiahStudios.github.io) as `webxr-sculpt/` when republishing. Keep **`xr-dev.messiahstudios.site`** for development.

Phones get the **Tools** mobile UI (no XR setup). Quest Browser still offers XR setup. Details: **[`docs/STABLE_HOSTING.md`](./docs/STABLE_HOSTING.md)**.

---

## Project philosophy

- **One sculpting core** — don’t fork brush kernels unless XR physics demands it  
- **Two presentations** — Desktop for density and files; XR for presence and proportion  
- **Desktop-only is first-class** — immersive is opt-in (Cancel XR setup on Quest Browser stays on panels + canvas)  
- **Never break flow** — prefer sticks, grips, and spatial action over nested panels  
- **Presence over panels** — the clay is the interface; the dock is only a helper  
- **Honest interoperability** — each export format only promises what it can carry  

Deep design, architecture, and status: **[`XR_Roadmap.MD`](./XR_Roadmap.MD)**

```
Digital Clay Studio
├── SculptGL Core
├── Desktop workflow
├── Quest MR/VR Workflow
├── Workspace
├── Materials Pipeline
└── Interaction Philosophy
```

---

## License & credits

MIT, same as upstream.

- **SculptGL** by [Stéphane Ginier](https://github.com/stephomi) / [stephaneginier.com](http://stephaneginier.com) — the sculpting, mesh, and undo foundation this project builds on  
- **WebXR Sculpt** by **Messiah Studios** — independent XR-oriented interpretation; not an official SculptGL release  

HDR environments historically from [Poly Haven](https://polyhaven.com/hdris) (HDRI Haven).
