"""Headless Blender: import app-exported Duck GLB, report materials, re-export."""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(r"c:\Users\messi\OneDrive\Desktop\Dev Projects\webxr-sculptgl\webxr-sculptgl\tools\glb-roundtrip")
SRC = ROOT / "duck-from-app.glb"
OUT = ROOT / "duck-from-blender.glb"
REPORT = ROOT / "blender-report.json"

# Clean default scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in bpy.data.meshes:
    bpy.data.meshes.remove(block)
for block in bpy.data.materials:
    bpy.data.materials.remove(block)
for block in bpy.data.images:
    bpy.data.images.remove(block)

bpy.ops.import_scene.gltf(filepath=str(SRC))

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
mats_info = []
for mat in bpy.data.materials:
    info = {"name": mat.name, "nodes": False, "base_color_tex": False, "metal_rough_tex": False}
    if mat.use_nodes and mat.node_tree:
        info["nodes"] = True
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                # Heuristic: linked to Principled inputs
                for out in node.outputs:
                    for link in out.links:
                        sock = link.to_socket.name.lower()
                        if "base color" in sock or "base colour" in sock:
                            info["base_color_tex"] = True
                            info["base_color_image"] = node.image.name
                        if "metallic" in sock or "roughness" in sock:
                            info["metal_rough_tex"] = True
                            info["metal_rough_image"] = node.image.name
    mats_info.append(info)

uv_ok = []
for obj in meshes:
    me = obj.data
    uv_ok.append({
        "object": obj.name,
        "verts": len(me.vertices),
        "polys": len(me.polygons),
        "uv_layers": [uv.name for uv in me.uv_layers],
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
    })

report = {
    "imported_from": str(SRC),
    "mesh_count": len(meshes),
    "meshes": uv_ok,
    "materials": mats_info,
    "image_count": len(bpy.data.images),
    "images": [img.name for img in bpy.data.images],
}

bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)

report["exported_to"] = str(OUT)
report["exported_bytes"] = OUT.stat().st_size if OUT.exists() else 0
REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
sys.exit(0)
