# Hosting WebXR Sculpt (stable v1)

Same GitHub repo. Two **builds**, not two repos.

| Channel | Command | Output | How-to Camera buttons | Typical host |
|---|---|---|---|---|
| **Dev** | `npm run release` + `npm run server` | `app/` | Yes | `https://xr-dev.messiahstudios.site/` (keep for XR experiments) |
| **Stable v1** | `npm run release:stable` | `dist/v1/` | **No** | Your main Pages site (below) |

`/__xr_logs` and `POST /__xr_log` exist only on the **dev server** (`npm run server`). Stable/GitHub Pages is static — remote logging is disabled there so the browser console stays clean.

`dist/v1/` is gitignored (large: JS + `webxr-profiles` + resources). Build locally, then copy into the Pages repo.

---

## Recommended public URL

Put the stable app under your existing Pages site:

**`https://www.messiahstudios.site/webxr-sculpt/`**

That maps to folder **`webxr-sculpt/`** inside [MessiahStudios/MessiahStudios.github.io](https://github.com/MessiahStudios/MessiahStudios.github.io).

Keep **`https://xr-dev.messiahstudios.site/`** for development / other WebXR work (unchanged).

Later, add a link on the main homepage → `/webxr-sculpt/`.

---

## Wire it up (one-time + each release)

### 1. Build stable v1 in this repo

```bash
cd webxr-sculptgl
npm install
npm run release:stable
```

Creates a self-contained folder: `dist/v1/` (`index.html`, `sculptgl.js`, chunks, `css/`, `resources/`, `draco/`, `webxr-profiles/`, …).

### 2. Copy into the GitHub Pages repo

```bash
# Adjust paths to your machines
set PAGES=C:\path\to\MessiahStudios.github.io
set STABLE=C:\path\to\webxr-sculptgl\dist\v1

mkdir "%PAGES%\webxr-sculpt" 2>nul
xcopy /E /I /Y "%STABLE%\*" "%PAGES%\webxr-sculpt\"
```

macOS/Linux:

```bash
PAGES=~/MessiahStudios.github.io
STABLE=~/webxr-sculptgl/dist/v1
mkdir -p "$PAGES/webxr-sculpt"
rsync -a --delete "$STABLE/" "$PAGES/webxr-sculpt/"
```

### 3. Commit & push Pages

```bash
cd MessiahStudios.github.io
git add webxr-sculpt
git commit -m "Publish WebXR Sculpt stable v1."
git push origin HEAD
```

GitHub Pages (user site) usually updates in a minute or two.

### 4. Verify

Open: `https://www.messiahstudios.site/webxr-sculpt/`

- Desktop UI should load (no Camera → How-to docs section).
- Quest: open that **HTTPS** URL in Quest Browser (same as any WebXR page).
- Confirm `sculptgl.js`, `css/yagui.css`, and `resources/` are not 404.

### 5. Homepage link (when ready)

On `https://www.messiahstudios.site`, add something like:

```html
<a href="/webxr-sculpt/">WebXR Sculpt</a>
```

---

## Optional: GitHub Release tag (same repo)

In **webxr-sculptgl** (this project), after a good stable build:

```bash
git tag -a v1.0.0 -m "WebXR Sculpt stable v1.0.0"
git push origin v1.0.0
```

Then create a GitHub Release from the tag (notes + optional zip of `dist/v1` if you want a downloadable artifact). Hosting still comes from copying into `MessiahStudios.github.io` — tags don’t publish Pages by themselves.

---

## DNS note

| Host | Role |
|---|---|
| `www.messiahstudios.site` | Main portfolio (Pages) — add `/webxr-sculpt/` here |
| `xr-dev.messiahstudios.site` | Dev tunnel / other WebXR projects — leave as-is |

No new repo named “Stable” required. No `v1/` source trees — tags + `dist/v1` build output are enough.

---

## Checklist

- [ ] `npm run release:stable` succeeds  
- [ ] `webxr-sculpt/` pushed to `MessiahStudios.github.io`  
- [ ] `https://www.messiahstudios.site/webxr-sculpt/` loads on desktop  
- [ ] Quest Browser can enter XR from that URL (HTTPS)  
- [ ] Camera menu has **no** How-to export buttons  
- [ ] (Later) Homepage links to `/webxr-sculpt/`  
