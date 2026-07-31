# GLB round-trip check

## Results (2026-07-30)

Full loop ran successfully:

| Step | Result |
|---|---|
| 1. App import Khronos Duck | **2399** verts |
| 2. App **Save .glb** | `duck-from-app.glb` (~272 KB) — `POSITION`/`NORMAL`/`TEXCOORD_0` + baseColor + metalRough maps |
| 3. Blender 5.2 import | Mesh + UVMap + Base Color image (2 images in file) |
| 4. Blender export `.glb` | `duck-from-blender.glb` (~272 KB) |
| 5. App re-import Blender GLB | **2399** verts / **4212** faces — loads |

Artifacts live in this folder; Blender report: `blender-report.json`.

### Honest notes

- Structurally solid: UVs + PBR textures survive app → Blender → app.
- In-app color after bake/re-bake can look blotchy vs the pristine Khronos Duck (lossy vertex ↔ map path). Blender is the check that maps are actually in the file.
- Prefer **Files → Add** for local files; `?modelurl=` is for HTTPS/CORS hosts.

### Re-run Blender leg

```bat
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python tools\glb-roundtrip\blender_roundtrip.py
```
