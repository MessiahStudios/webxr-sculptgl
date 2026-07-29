# WebXR Sculpt | Messiah Studios

Quest-first WebXR sculpting — digital clay at human scale in Meta Quest MR/VR — built on [SculptGL](https://github.com/stephomi/sculptgl).

**Product:** WebXR Sculpt  
**Company:** [Messiah Studios](https://github.com/MessiahStudios)  
**Repo:** https://github.com/MessiahStudios/webxr-sculptgl  

**Design / roadmap:** see [`XR_Roadmap.MD`](./XR_Roadmap.MD)  
**Quest + HTTPS tunnel (DIY):** see [`tools/xr-tunnel.txt`](./tools/xr-tunnel.txt)

## What this project adds

- Immersive MR/VR sessions (WebXR) with controller sculpting
- XR Sculpt Dock (BRUSH / SURF / OPTS / SPACE)
- Workspace placement at room scale (separate from mesh Transform)
- Save / Load (`.sgl` → IndexedDB), Export, Import (including glTF/GLB + HTTPS URL)
- Local continuity first — no Sketchfab-centric share flow in the UI

## Desktop

Same Files / sculpt tools as upstream SculptGL, with XR setup entry and Import URL.  
**About & Help** opens this GitHub repo.

## Run locally

```bash
npm install
npm run release
npm run server
```

Open http://127.0.0.1:8080/  

For Quest, expose `npm run server` over HTTPS with any tunnel (Cloudflare, ngrok, …).  
Step-by-step DIY: [`tools/xr-tunnel.txt`](./tools/xr-tunnel.txt).

```bash
npm run boot:test   # release + server
```

## License & credit

MIT, same as upstream. Original SculptGL by [Stéphane Ginier](https://github.com/stephomi) / [stephaneginier.com](http://stephaneginier.com).  
WebXR Sculpt is developed by **Messiah Studios** as an independent XR-oriented interpretation and is not an official SculptGL release.

#### Environments

Raw HDR environments historically from https://hdrihaven.com/hdris (Poly Haven).
