# WebXR Sculpt

**An open, Quest-first digital clay studio built on [SculptGL](https://github.com/stephomi/sculptgl)** — extending the original desktop sculpting engine with spatial interaction, Workspace, lightweight PBR painting, and modern asset interoperability.

> Shape digital clay at human scale in Meta Quest MR/VR, while keeping a full desktop workflow on the same core.

**Product:** WebXR Sculpt · **Studio:** [Messiah Studios](https://github.com/MessiahStudios) · **Repo:** [MessiahStudios/webxr-sculptgl](https://github.com/MessiahStudios/webxr-sculptgl)

<!-- Hero: add a Quest MR / dock GIF under docs/media/hero.gif when available
![WebXR Sculpt in Quest MR](docs/media/hero.gif)
-->

---

## Highlights

| | |
|---|---|
| **Quest MR/VR** | Continuous sculpt loop with controllers, passthrough or studio VR |
| **Sculpt Dock** | FORM / PAINT / OPTS / SPACE — head-facing helper, not a floating desktop clone |
| **Workspace** | Clay in the *room* (scale, distance, turntable) — separate from mesh Transform |
| **Surface tools** | Paint, Soften (blend colors), masking, shared **alpha stamp gallery** |
| **Materials** | Clay-friendly PBR paint; GLB round-trip with UVs + live maps when present |
| **Files** | Save/Load `.sgl`, honest export OBJ / OBJ+MAPS / GLB / PLY / STL |
| **Capture** | Local Snapshot PNG + video (virtual view — not OS Cast) |

---

## Screenshots

_Add Quest MR and desktop stills or short GIFs here (e.g. `docs/media/`)._

<!--
| MR sculpt | Desktop paint | Alpha stamps |
|---|---|---|
| ![](docs/media/mr.jpg) | ![](docs/media/desktop.jpg) | ![](docs/media/alphas.jpg) |
-->

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
Live Quest/desktop logs while testing: [http://127.0.0.1:8080/__xr_logs](http://127.0.0.1:8080/__xr_logs)

---

## Project philosophy

- **One sculpting core** — don’t fork brush kernels unless XR physics demands it  
- **Two presentations** — desktop for density and files; XR for presence and proportion  
- **Never break flow** — prefer sticks, grips, and spatial action over nested panels  
- **Presence over panels** — the clay is the interface; the dock is only a helper  
- **Honest interoperability** — each export format only promises what it can carry  

Deep design, architecture, and status: **[`XR_Roadmap.MD`](./XR_Roadmap.MD)**

```
Digital Clay Studio
├── SculptGL Core
├── Desktop Workflow
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
