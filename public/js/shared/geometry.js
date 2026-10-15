// Pure shed geometry (no Three.js) — roof profiles, wall heights, placement & collision rules.
export const WALLS = ['front', 'right', 'back', 'left'];
export function wallLength(wall, size) { return (wall === 'front' || wall === 'back') ? size.width : size.depth; }

export const FLOOR_Y = 0.75;     // skids + floor
export const WALL_T = 0.33;      // wall thickness (ft)

export function shedGeometry(style, size) {
  const W = size.width, D = size.depth, H = Number(style.wall_height) || 7;
  const k = (Number(style.roof_pitch) || 6) / 12;
  const ridgeAlongZ = style.ridge_axis !== 'width';
  const S = ridgeAlongZ ? W : D;           // span (across the slope)
  const L = ridgeAlongZ ? D : W;           // ridge length
  const s = S / 2;
  let profile;
  switch (style.roof_type) {
    case 'barn': {
      const bs = 0.58 * s, r1 = (s - bs) * 1.45, r2 = bs * 0.42;
      profile = [[-s, 0], [-bs, r1], [0, r1 + r2], [bs, r1], [s, 0]]; break;
    }
    case 'lean_to': profile = [[-s, 0], [s, S * k]]; break;
    case 'saltbox': profile = [[-s, 0], [0.3 * s, 1.3 * s * k], [s, 0]]; break;
    default: profile = [[-s, 0], [0, s * k], [s, 0]];
  }
  const prof = u => {
    u = Math.max(-s, Math.min(s, u));
    for (let i = 0; i < profile.length - 1; i++) {
      const [u0, h0] = profile[i], [u1, h1] = profile[i + 1];
      if (u >= u0 - 1e-9 && u <= u1 + 1e-9) return h0 + (h1 - h0) * ((u - u0) / (u1 - u0 || 1));
    }
    return 0;
  };
  const isGable = w => ridgeAlongZ ? (w === 'front' || w === 'back') : (w === 'left' || w === 'right');
  // map wall-local u (viewed from outside, + to the right) to span coordinate
  const spanCoord = (w, u) => {
    if (ridgeAlongZ) return { front: u, back: -u, left: -s, right: s }[w];
    return { left: u, right: -u, front: s, back: -s }[w];
  };
  const topAt = (w, u) => H + prof(spanCoord(w, u));
  // wall-local u of each profile vertex for gable walls
  const profileUs = w => {
    const sign = ridgeAlongZ ? (w === 'front' ? 1 : -1) : (w === 'left' ? 1 : -1);
    return profile.map(([u, h]) => [u * sign, H + h]);
  };
  const peak = Math.max(...profile.map(p => p[1]));
  const eaveOv = Number(style.overhang ?? 0.75) || 0;
  const gableOv = style.gable_overhang == null || style.gable_overhang === '' ? eaveOv : Number(style.gable_overhang) || 0;
  return { W, D, H, S, L, s, k, ridgeAlongZ, profile, prof, isGable, topAt, profileUs, peak, eaveOv, gableOv, wallLen: w => wallLength(w, size) };
}

/** Sloped roof surface area in sq ft, including eave and gable overhangs. */
export function roofArea(geo) {
  const pr = geo.profile;
  let len = 0;
  for (let i = 0; i < pr.length - 1; i++) {
    const du = pr[i + 1][0] - pr[i][0], dh = pr[i + 1][1] - pr[i][1], l = Math.hypot(du, dh);
    len += l;
    const ux = Math.max(Math.abs(du) / l, 0.3);
    if (i === 0) len += geo.eaveOv / ux;
    if (i === pr.length - 2) len += geo.eaveOv / ux;
  }
  return len * (geo.L + 2 * geo.gableOv);
}

/** Effective width/height of an item (per-item override, else the option's own size). */
export function itemSize(opt, item) {
  const w = Number(item?.w) > 0 ? Number(item.w) : Number(opt.width) || 1;
  const h = Number(item?.h) > 0 ? Number(item.h) : Number(opt.height) || 1;
  return { w, h };
}

/** Resolve where an item actually sits (clamped to the wall, under the roof line). */
export function resolvePlacement(geo, opt, item) {
  const sz = itemSize(opt, item);
  const w = sz.w;
  let h = sz.h;
  if (!WALLS.includes(item.wall)) return { offset: item.offset || 0, elev: Number(opt.elevation) || 0, w, h };
  const L = geo.wallLen(item.wall);
  const margin = WALL_T + 0.1;
  const span = opt.placement === 'loft' ? 0 : w;
  let offset = Math.max(-L / 2 + margin + span / 2, Math.min(L / 2 - margin - span / 2, Number(item.offset) || 0));
  if (span > L - 2 * margin) offset = 0;
  let elev = Number(opt.elevation) || 0;
  if (opt.placement === 'opening' || opt.placement === 'wall_exterior' || opt.placement === 'wall_interior') {
    const top = Math.min(geo.topAt(item.wall, offset - w / 2), geo.topAt(item.wall, offset + w / 2));
    if (opt.kind === 'vent' || elev < 0) {
      const room = geo.topAt(item.wall, offset) - geo.H;
      elev = room > h + 0.8 ? geo.H + room * 0.42 - h / 2 : geo.H - h - 0.35;
    }
    const maxTop = top - (opt.placement === 'opening' ? 0.3 : 0.15);
    if (elev + h > maxTop) elev = maxTop - h;
    if (elev < 0) { h = Math.max(0.3, h + elev); elev = 0; }
  }
  return { offset, elev, w, h };
}

/** Horizontal/vertical extents occupied on a wall (for collision checks). */
function extents(geo, opt, item) {
  const p = resolvePlacement(geo, opt, item);
  const layer = opt.placement === 'opening' ? 'through' : opt.placement === 'wall_interior' ? 'in' : opt.placement === 'wall_exterior' ? 'out' : opt.placement === 'ground' ? 'ground' : null;
  let pad = 0;
  if (opt.kind === 'window_shutters') pad = p.w * 0.55;
  return { a: p.offset - p.w / 2 - pad, b: p.offset + p.w / 2 + pad, y0: p.elev, y1: p.elev + p.h, layer };
}

function collides(geo, optById, items, opt, cand, ignoreUid) {
  const e = extents(geo, opt, cand);
  if (!e.layer) return false;
  for (const it of items) {
    if (it.uid === ignoreUid || it.wall !== cand.wall) continue;
    const o = optById[it.option_id]; if (!o) continue;
    const f = extents(geo, o, it);
    if (!f.layer) continue;
    const sameLayer = f.layer === e.layer || f.layer === 'through' || e.layer === 'through';
    if (e.layer === 'ground' || f.layer === 'ground') { if (e.layer !== f.layer) continue; }
    else if (!sameLayer) continue;
    const gap = 0.25;
    const hOverlap = e.a < f.b + gap && f.a < e.b + gap;
    const vOverlap = (e.layer === 'ground') || (e.y0 < f.y1 + 0.1 && f.y0 < e.y1 + 0.1);
    if (hOverlap && vOverlap) return true;
  }
  return false;
}

/** Find a free spot for a new/moved item. Tries the preferred wall first, then the others. */
export function findSpot(geo, optById, items, opt, prefWall, prefOffset = 0, ignoreUid = null) {
  if (opt.placement === 'none') return { wall: null, offset: 0 };
  if (opt.placement === 'ceiling') {
    const used = items.filter(i => i.wall === 'ceiling' && i.uid !== ignoreUid).map(i => i.offset);
    const lim = geo.D / 2 - 1;
    for (const off of spiral(prefOffset, lim, 2)) if (!used.some(u => Math.abs(u - off) < 1.5)) return { wall: 'ceiling', offset: off };
    return { wall: 'ceiling', offset: 0 };
  }
  if (opt.placement === 'roof') return { wall: 'roof', offset: prefOffset || 0 };
  const walls = prefWall ? [prefWall, ...WALLS.filter(w => w !== prefWall)] : WALLS;
  for (const wall of walls) {
    if (opt.kind === 'vent' && !geo.isGable(wall)) continue;
    if (opt.placement === 'loft') {
      if (!geo.isGable(wall)) continue; // lofts span an end (gable) wall
      if (!items.some(i => i.wall === wall && optById[i.option_id]?.placement === 'loft' && i.uid !== ignoreUid)) return { wall, offset: 0 };
      continue;
    }
    const L = geo.wallLen(wall);
    if (Number(opt.width) > L - 0.8) continue;
    for (const off of spiral(wall === prefWall ? prefOffset : 0, L / 2, 0.5)) {
      const cand = { wall, offset: off, uid: '__cand' };
      const p = resolvePlacement(geo, opt, cand);
      if (Math.abs(p.offset - off) > 0.01) continue;
      if (!collides(geo, optById, items, opt, cand, ignoreUid)) return { wall, offset: off };
    }
  }
  return null;
}

export function canPlace(geo, optById, items, opt, cand, ignoreUid) {
  const p = resolvePlacement(geo, opt, cand);
  return Math.abs(p.offset - cand.offset) < 0.01 && !collides(geo, optById, items, opt, cand, ignoreUid);
}

function* spiral(start, lim, step) {
  yield start;
  for (let d = step; d <= lim * 2 + step; d += step) {
    if (start + d <= lim) yield +(start + d).toFixed(2);
    if (start - d >= -lim) yield +(start - d).toFixed(2);
  }
}
