"""Convert a skinned USDC/USD character to a skinned glTF 2.0 GLB for Babylon.js."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

from pxr import Gf, Usd, UsdGeom, UsdSkel


def z_up_to_y_up(p: Gf.Vec3f | Gf.Vec3d) -> tuple[float, float, float]:
    # USD Z-up → glTF Y-up: (x, y, z) -> (x, z, -y)
    return (float(p[0]), float(p[2]), -float(p[1]))


def _basis_z_to_y() -> Gf.Matrix4d:
    # Maps Z-up points to Y-up: (x, y, z) -> (x, z, -y)
    return Gf.Matrix4d(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1)


def mat_z_up_to_y_up(m: Gf.Matrix4d) -> list[float]:
    """Convert a USD (row-vector) matrix into glTF Y-up column-major floats."""
    c = _basis_z_to_y()
    my = c * m * c.GetInverse()
    # USD: p' = p * M (row vectors). glTF: p' = M * p (column vectors) ⇒ pack transpose.
    out: list[float] = []
    for row in range(4):
        for col in range(4):
            out.append(float(my[row, col]))
    return out


def decompose_local(m: Gf.Matrix4d) -> tuple[list[float], list[float], list[float]]:
    """Return translation, rotation quat [x,y,z,w], scale in Y-up space."""
    c = _basis_z_to_y()
    my = c * m * c.GetInverse()
    xf = Gf.Transform()
    xf.SetMatrix(my)
    t = xf.GetTranslation()
    s = xf.GetScale()
    q = xf.GetRotation().GetQuat()
    imag = q.GetImaginary()
    translation = [float(t[0]), float(t[1]), float(t[2])]
    scale = [float(s[0]) or 1.0, float(s[1]) or 1.0, float(s[2]) or 1.0]
    rotation = [float(imag[0]), float(imag[1]), float(imag[2]), float(q.GetReal())]
    return translation, rotation, scale


def top4_influences(indices: list[int], weights: list[float]) -> tuple[list[int], list[float]]:
    pairs = sorted(zip(indices, weights), key=lambda iw: iw[1], reverse=True)[:4]
    while len(pairs) < 4:
        pairs.append((0, 0.0))
    idxs = [int(i) for i, _ in pairs]
    ws = [float(w) for _, w in pairs]
    total = sum(ws)
    if total > 1e-8:
        ws = [w / total for w in ws]
    else:
        idxs, ws = [0, 0, 0, 0], [1.0, 0.0, 0.0, 0.0]
    return idxs, ws


def align4(n: int) -> int:
    return (n + 3) & ~3


def convert(usd_path: Path, out_path: Path) -> None:
    stage = Usd.Stage.Open(str(usd_path))
    if not stage:
        raise SystemExit(f"Failed to open {usd_path}")

    mesh_prim = None
    skel_prim = None
    for prim in stage.Traverse():
        if prim.GetTypeName() == "Mesh" and mesh_prim is None:
            mesh_prim = prim
        if prim.GetTypeName() == "Skeleton" and skel_prim is None:
            skel_prim = prim
    if mesh_prim is None or skel_prim is None:
        raise SystemExit("USD is missing Mesh or Skeleton")

    mesh = UsdGeom.Mesh(mesh_prim)
    points = mesh.GetPointsAttr().Get()
    counts = mesh.GetFaceVertexCountsAttr().Get()
    indices = mesh.GetFaceVertexIndicesAttr().Get()
    if not points or not counts or not indices:
        raise SystemExit("Mesh has no geometry")
    if any(c != 3 for c in counts):
        raise SystemExit("Only triangle meshes are supported")

    binding = UsdSkel.BindingAPI(mesh_prim)
    ji_pv = binding.GetJointIndicesPrimvar()
    jw_pv = binding.GetJointWeightsPrimvar()
    joint_indices = list(ji_pv.Get())
    joint_weights = list(jw_pv.Get())
    elem = ji_pv.GetElementSize()
    if elem < 1:
        raise SystemExit("Invalid skinning element size")

    geom_bind = Gf.Matrix4d(1.0)
    geom_bind_attr = binding.GetGeomBindTransformAttr()
    if geom_bind_attr and geom_bind_attr.HasAuthoredValue():
        geom_bind = Gf.Matrix4d(geom_bind_attr.Get())

    skel = UsdSkel.Skeleton(skel_prim)
    joints = list(skel.GetJointsAttr().Get())
    bind_xforms = list(skel.GetBindTransformsAttr().Get())
    rest_xforms = list(skel.GetRestTransformsAttr().Get())
    if len(joints) != len(bind_xforms) or len(joints) != len(rest_xforms):
        raise SystemExit("Skeleton transform count mismatch")

    # Parent map from joint path
    parent_of = [-1] * len(joints)
    index_of = {j: i for i, j in enumerate(joints)}
    for i, j in enumerate(joints):
        if "/" in j:
            parent_path = j.rsplit("/", 1)[0]
            parent_of[i] = index_of.get(parent_path, -1)

    # Build binary blob
    blob = bytearray()

    def add_f32(values: list[float]) -> tuple[int, int]:
        start = len(blob)
        blob.extend(struct.pack("<" + "f" * len(values), *values))
        pad = align4(len(blob)) - len(blob)
        blob.extend(b"\x00" * pad)
        return start, len(values)

    def add_u16(values: list[int]) -> tuple[int, int]:
        start = len(blob)
        blob.extend(struct.pack("<" + "H" * len(values), *values))
        pad = align4(len(blob)) - len(blob)
        blob.extend(b"\x00" * pad)
        return start, len(values)

    def add_u32(values: list[int]) -> tuple[int, int]:
        start = len(blob)
        blob.extend(struct.pack("<" + "I" * len(values), *values))
        pad = align4(len(blob)) - len(blob)
        blob.extend(b"\x00" * pad)
        return start, len(values)

    # Positions (apply geom bind, then Z-up → Y-up)
    pos: list[float] = []
    for p in points:
        pw = geom_bind.Transform(Gf.Vec3d(p[0], p[1], p[2]))
        pos.extend(z_up_to_y_up(pw))
    pos_off, _ = add_f32(pos)

    # Indices
    idx = [int(i) for i in indices]
    idx_off, _ = add_u32(idx)

    # Skin attrs (top 4)
    joints0: list[int] = []
    weights0: list[float] = []
    nverts = len(points)
    for v in range(nverts):
        base = v * elem
        ids = [int(joint_indices[base + k]) for k in range(elem)]
        ws = [float(joint_weights[base + k]) for k in range(elem)]
        top_i, top_w = top4_influences(ids, ws)
        joints0.extend(top_i)
        weights0.extend(top_w)
    j0_off, _ = add_u16(joints0)
    w0_off, _ = add_f32(weights0)

    # Inverse bind matrices
    ibm: list[float] = []
    for m in bind_xforms:
        inv = m.GetInverse()
        ibm.extend(mat_z_up_to_y_up(inv))
    ibm_off, _ = add_f32(ibm)

    # Accessors / bufferViews
    buffer_views = []
    accessors = []

    def bv(offset: int, length: int, target: int | None = None) -> int:
        view = {"buffer": 0, "byteOffset": offset, "byteLength": length}
        if target is not None:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def acc(view: int, count: int, comp_type: int, type_name: str, min_v=None, max_v=None, byte_offset=0):
        a = {
            "bufferView": view,
            "byteOffset": byte_offset,
            "componentType": comp_type,
            "count": count,
            "type": type_name,
        }
        if min_v is not None:
            a["min"] = min_v
        if max_v is not None:
            a["max"] = max_v
        accessors.append(a)
        return len(accessors) - 1

    pos_view = bv(pos_off, nverts * 12, 34962)
    xs = pos[0::3]
    ys = pos[1::3]
    zs = pos[2::3]
    pos_acc = acc(
        pos_view,
        nverts,
        5126,
        "VEC3",
        [min(xs), min(ys), min(zs)],
        [max(xs), max(ys), max(zs)],
    )

    idx_view = bv(idx_off, len(idx) * 4, 34963)
    idx_acc = acc(idx_view, len(idx), 5125, "SCALAR")

    j_view = bv(j0_off, nverts * 4 * 2, 34962)
    j_acc = acc(j_view, nverts, 5123, "VEC4")

    w_view = bv(w0_off, nverts * 4 * 4, 34962)
    w_acc = acc(w_view, nverts, 5126, "VEC4")

    ibm_view = bv(ibm_off, len(joints) * 16 * 4)
    ibm_acc = acc(ibm_view, len(joints), 5126, "MAT4")

    # Nodes: 0 = scene root, 1 = skinned mesh, 2.. = joints
    nodes: list[dict] = [
        {"name": "MecchaRoot", "children": []},
        {"name": "MecchaMesh", "mesh": 0, "skin": 0},
    ]
    joint_node_indices: list[int] = []
    for i, name in enumerate(joints):
        short = name.split("/")[-1]
        t, r, s = decompose_local(rest_xforms[i])
        node = {
            "name": short,
            "translation": t,
            "rotation": r,
            "scale": s,
            "children": [],
        }
        nodes.append(node)
        joint_node_indices.append(i + 2)

    # hierarchy children
    root_joints: list[int] = []
    for i, p in enumerate(parent_of):
        child_node = joint_node_indices[i]
        if p < 0:
            root_joints.append(child_node)
        else:
            nodes[joint_node_indices[p]]["children"].append(child_node)

    nodes[0]["children"] = [1, *root_joints]

    # strip empty children arrays
    for n in nodes:
        if not n.get("children"):
            n.pop("children", None)

    gltf = {
        "asset": {"version": "2.0", "generator": "Box3D-Tuner usd_to_glb"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "meshes": [
            {
                "name": "MecchaMesh",
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": pos_acc,
                            "JOINTS_0": j_acc,
                            "WEIGHTS_0": w_acc,
                        },
                        "indices": idx_acc,
                        "mode": 4,
                    }
                ],
            }
        ],
        "nodes": nodes,
        "skins": [
            {
                "name": "MecchaSkin",
                "inverseBindMatrices": ibm_acc,
                "joints": joint_node_indices,
                "skeleton": root_joints[0] if root_joints else joint_node_indices[0],
            }
        ],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = align4(len(json_bytes)) - len(json_bytes)
    json_bytes += b" " * json_pad

    bin_pad = align4(len(blob)) - len(blob)
    blob.extend(b"\x00" * bin_pad)

    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    out = bytearray()
    out.extend(struct.pack("<4sII", b"glTF", 2, total))
    out.extend(struct.pack("<I4s", len(json_bytes), b"JSON"))
    out.extend(json_bytes)
    out.extend(struct.pack("<I4s", len(blob), b"BIN\x00"))
    out.extend(blob)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(out)
    print(f"Wrote {out_path} ({len(out)} bytes)")
    print(f"joints={len(joints)} verts={nverts} tris={len(idx)//3}")
    print("Arm bones:", ", ".join(j.split('/')[-1] for j in joints if 'R_Upperarm' in j or 'R_Forearm' in j or j.endswith('R_Hand') or j.endswith('R_Clavicle')))


if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\corps\OneDrive\Desktop\Meccha.usd")
    dst = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else Path(__file__).resolve().parents[1] / "public" / "models" / "Meccha.rigged.glb"
    )
    convert(src, dst)
