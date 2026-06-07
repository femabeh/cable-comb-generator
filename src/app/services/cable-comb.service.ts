import { Injectable } from '@angular/core';
import { CableCombParams, Triangle, Vec3 } from '../models/cable-comb.model';

// ─────────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────────

function v3(x: number, y: number, z: number): Vec3 { return { x, y, z }; }

function triFrom(a: Vec3, b: Vec3, c: Vec3): Triangle {
  const ux = b.x-a.x, uy = b.y-a.y, uz = b.z-a.z;
  const wx = c.x-a.x, wy = c.y-a.y, wz = c.z-a.z;
  const nx = uy*wz-uz*wy, ny = uz*wx-ux*wz, nz = ux*wy-uy*wx;
  const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
  return { normal: v3(nx/len, ny/len, nz/len), v0: a, v1: b, v2: c };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-D point in the XZ plane (X = comb width, Z = comb height)
// ─────────────────────────────────────────────────────────────────────────────

interface P2 { x: number; z: number; }
function p(x: number, z: number): P2 { return { x, z }; }

// ─────────────────────────────────────────────────────────────────────────────
// Build the closed 2-D contour of the comb cross-section.
//
// The contour is a single CCW polygon (no holes) that describes the comb
// outline: a rectangle with U-shaped notches cut from the top.
//
// For each slot the outline dips down into:
//   right lip top → right lip bottom → straight inner wall → semicircle →
//   straight inner wall → left lip bottom → left lip top
//
// The top surface between slots is a direct horizontal step between lip tips.
// ─────────────────────────────────────────────────────────────────────────────

function buildContour(
  slots:    number,
  R:        number,   // cable radius
  wall:     number,   // wall thickness
  totalH:   number,   // total comb height
  lipInset: number,   // fraction of R the lip tip reaches inward (0 = flush, 0.3 = 30 % of R)
  lipH:     number,   // taper height of the lip
  arcSegs:  number,
): P2[] {
  const slotPitch = R * 2 + wall;            // slot centre-to-centre
  const totalW    = wall + slots * slotPitch; // total comb width
  const slotCX    = Array.from({ length: slots }, (_, i) => wall + R + i * slotPitch);
  const lipTip    = R * lipInset;            // distance from slot centre to lip tip

  const pts: P2[] = [];

  // Bottom edge (left → right)
  pts.push(p(0, 0));
  pts.push(p(totalW, 0));

  // Right outer wall up
  pts.push(p(totalW, totalH));

  // Top edge with slot notches, right → left
  for (let i = slots - 1; i >= 0; i--) {
    const cx = slotCX[i];

    // Descend into slot from the right:
    pts.push(p(cx + lipTip, totalH));           // right lip outer top
    pts.push(p(cx + lipTip, totalH - lipH));    // right lip inner (taper end)
    pts.push(p(cx + R,      totalH - lipH));    // right inner wall top

    // Semicircle from right (angle 0) → bottom (π/2) → left (π)
    // Centre at (cx, R). Formula: x = cx + R·cos(a), z = R - R·sin(a)
    // a=0   → (cx+R, R)   right wall meets arc
    // a=π/2 → (cx,   0)   very bottom
    // a=π   → (cx-R, R)   left wall meets arc
    for (let s = 0; s <= arcSegs; s++) {
      const a = (s / arcSegs) * Math.PI;
      pts.push(p(cx + R * Math.cos(a), R - R * Math.sin(a)));
    }

    // Ascend left side of slot:
    pts.push(p(cx - R,      totalH - lipH));    // left inner wall top
    pts.push(p(cx - lipTip, totalH - lipH));    // left lip inner
    pts.push(p(cx - lipTip, totalH));           // left lip outer top

    // If this is the leftmost slot, close to the left outer wall
    if (i === 0) {
      pts.push(p(0, totalH));
    }
    // Otherwise the loop continues directly to the next slot's right lip
  }

  return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ear-clipping triangulator for a simple (non-self-intersecting) polygon.
// Input polygon must be CCW. Returns flat array of triangle vertex indices.
// ─────────────────────────────────────────────────────────────────────────────

function earClip(pts: P2[]): number[] {
  const result: number[] = [];
  const idx = pts.map((_, i) => i); // mutable index ring

  function cross2d(o: P2, a: P2, b: P2): number {
    return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  }

  function pointInTriangle(p: P2, a: P2, b: P2, c: P2): boolean {
    return cross2d(a, b, p) >= 0 && cross2d(b, c, p) >= 0 && cross2d(c, a, p) >= 0;
  }

  let safety = idx.length * idx.length + 100;

  while (idx.length > 3 && safety-- > 0) {
    let clipped = false;
    const n = idx.length;
    for (let i = 0; i < n; i++) {
      const pi = idx[(i - 1 + n) % n];
      const ci = idx[i];
      const ni = idx[(i + 1) % n];
      const prev = pts[pi], curr = pts[ci], next = pts[ni];

      // Must be a convex (CCW) vertex
      if (cross2d(prev, curr, next) <= 0) continue;

      // No other vertex may lie inside this triangle
      let hasInner = false;
      for (let j = 0; j < n; j++) {
        const ji = idx[j];
        if (ji === pi || ji === ci || ji === ni) continue;
        if (pointInTriangle(pts[ji], prev, curr, next)) { hasInner = true; break; }
      }
      if (hasInner) continue;

      result.push(pi, ci, ni);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate polygon
  }

  if (idx.length === 3) result.push(idx[0], idx[1], idx[2]);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extrude a 2-D CCW contour (in the XZ plane) along Y (y0 → y1).
// Produces front face, back face, and side walls as triangles.
// ─────────────────────────────────────────────────────────────────────────────

function extrudeContour(contour: P2[], y0: number, y1: number): Triangle[] {
  const tris: Triangle[] = [];
  const n = contour.length;

  // Side walls
  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const af = v3(a.x, y0, a.z), ab = v3(a.x, y1, a.z);
    const bf = v3(b.x, y0, b.z), bb = v3(b.x, y1, b.z);
    tris.push(triFrom(af, bf, bb), triFrom(af, bb, ab));
  }

  // Front (y=y0) and back (y=y1) faces via ear-clipping
  const ears = earClip(contour);
  for (let i = 0; i < ears.length; i += 3) {
    const a = contour[ears[i]], b = contour[ears[i+1]], c = contour[ears[i+2]];
    tris.push(triFrom(v3(a.x,y0,a.z), v3(b.x,y0,b.z), v3(c.x,y0,c.z)));
    tris.push(triFrom(v3(a.x,y1,a.z), v3(c.x,y1,c.z), v3(b.x,y1,b.z)));
  }

  return tris;
}

// ─────────────────────────────────────────────────────────────────────────────
// Injectable service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CableCombGeneratorService {

  /**
   * Build the cable comb geometry.
   *
   * Coordinate system (matches the print orientation):
   *   X = width across slots
   *   Y = depth / extrusion direction (= comb thickness)
   *   Z = height (cables clip in from +Z)
   *
   * The comb lies flat on the print bed (XY plane).
   * No supports needed — slots open upward.
   */
  buildTriangles(p: CableCombParams): Triangle[] {
    const R       = p.cableDiameter / 2;
    const arcSegs = 32;

    const contour = buildContour(
      p.slots,
      R,
      p.wallThickness,
      p.clipHeight,
      p.lipInset,
      p.lipHeight,
      arcSegs,
    );

    return extrudeContour(contour, 0, p.thickness);
  }

  buildSTLBuffer(p: CableCombParams): ArrayBuffer {
    const tris = this.buildTriangles(p);
    const buf  = new ArrayBuffer(84 + tris.length * 50);
    const dv   = new DataView(buf);
    const hdr  = 'CableComb STL';
    for (let i = 0; i < 80; i++) dv.setUint8(i, i < hdr.length ? hdr.charCodeAt(i) : 0x20);
    dv.setUint32(80, tris.length, true);
    let off = 84;
    const wf = (n: number) => { dv.setFloat32(off, n, true); off += 4; };
    for (const t of tris) {
      wf(t.normal.x); wf(t.normal.y); wf(t.normal.z);
      wf(t.v0.x); wf(t.v0.y); wf(t.v0.z);
      wf(t.v1.x); wf(t.v1.y); wf(t.v1.z);
      wf(t.v2.x); wf(t.v2.y); wf(t.v2.z);
      dv.setUint16(off, 0, true); off += 2;
    }
    return buf;
  }

  downloadSTL(p: CableCombParams, filename?: string): void {
    const blob = new Blob([this.buildSTLBuffer(p)], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: filename ?? `cable-comb-${p.slots}slots-D${p.cableDiameter}mm.stl`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  getDimensions(p: CableCombParams): { width: number; depth: number; height: number } {
    const R         = p.cableDiameter / 2;
    const slotPitch = R * 2 + p.wallThickness;
    const totalW    = p.wallThickness + p.slots * slotPitch;
    return {
      width:  parseFloat(totalW.toFixed(2)),
      depth:  parseFloat(p.thickness.toFixed(2)),
      height: parseFloat(p.clipHeight.toFixed(2)),
    };
  }
}


