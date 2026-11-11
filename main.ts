// cutest-cat-01: draw one picture of a cat to /output/entry.png.
//
// The drawing is a signed-distance-field renderer: every shape (ellipse, capsule, rounded
// polygon) is evaluated per subpixel inside its bounding box, so edges stay clean, and the
// canvas is rendered at 4x and box-filled down to 1024x1024 for anti-aliasing. Only the Node
// standard library is used (node:zlib deflates the scanlines and the PNG chunks are written by
// hand), so the program runs in the sealed sandbox with no network and no install step.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const SIZE = 1024; // the picture's side, in pixels
const SS = 3; // supersampling factor
const W = SIZE * SS;

type Rgb = [number, number, number];
type Sdf = (x: number, y: number) => number;

const canvas = new Uint8ClampedArray(W * W * 3);

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

type Box = [number, number, number, number]; // x0, y0, x1, y1 in picture space

// Fill one shape: every subpixel whose centre falls within a pixel of the edge is blended,
// which is what keeps a curved cheek or a whisker smooth after the 4x box filter.
function fill(
  sdf: Sdf,
  box: Box,
  color: (x: number, y: number, d: number) => Rgb,
  alpha: number | ((x: number, y: number, d: number) => number) = 1,
  clip?: Sdf
) {
  const feather = 1 / SS;
  const x0 = Math.max(0, Math.floor(box[0] * SS));
  const y0 = Math.max(0, Math.floor(box[1] * SS));
  const x1 = Math.min(W, Math.ceil(box[2] * SS));
  const y1 = Math.min(W, Math.ceil(box[3] * SS));
  for (let py = y0; py < y1; py++) {
    const vy = (py + 0.5) / SS;
    for (let px = x0; px < x1; px++) {
      const vx = (px + 0.5) / SS;
      const d = sdf(vx, vy);
      let cov = d <= -feather ? 1 : d >= feather ? 0 : 0.5 - d / (2 * feather);
      if (cov <= 0) continue;
      if (clip) cov *= clamp(0.5 - clip(vx, vy) / (2 * feather));
      if (cov <= 0) continue;
      const a = cov * (typeof alpha === "function" ? alpha(vx, vy, d) : alpha);
      if (a <= 0) continue;
      const c = color(vx, vy, d);
      const i = (py * W + px) * 3;
      canvas[i] = canvas[i] * (1 - a) + c[0] * a;
      canvas[i + 1] = canvas[i + 1] * (1 - a) + c[1] * a;
      canvas[i + 2] = canvas[i + 2] * (1 - a) + c[2] * a;
    }
  }
}

// --- shape distance fields (negative inside) ---------------------------------------------

function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Sdf {
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const k = Math.min(rx, ry);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const lx = (dx * c - dy * s) / rx;
    const ly = (dx * s + dy * c) / ry;
    return (Math.hypot(lx, ly) - 1) * k;
  };
}

function capsule(ax: number, ay: number, bx: number, by: number, r: number): Sdf {
  return (x, y) => {
    const pax = x - ax;
    const pay = y - ay;
    const bax = bx - ax;
    const bay = by - ay;
    const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay || 1));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };
}

// Convex polygon with rounded corners: distance to the half-plane hull, less the radius.
function polygon(pts: number[][], round: number): Sdf {
  const n = pts.length;
  return (x, y) => {
    let d = -1e9;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const len = Math.hypot(ex, ey) || 1;
      d = Math.max(d, ((x - a[0]) * ey - (y - a[1]) * ex) / len);
    }
    return d - round;
  };
}

const head = { x: 500, y: 372, rot: -0.13 };
// World point -> head-local coordinates, so the whole face can be tilted as one.
function toHead(x: number, y: number): [number, number] {
  const dx = x - head.x;
  const dy = y - head.y;
  const c = Math.cos(-head.rot);
  const s = Math.sin(-head.rot);
  return [dx * c - dy * s, dx * s + dy * c];
}
const inHead = (sdf: Sdf): Sdf => (x, y) => {
  const [lx, ly] = toHead(x, y);
  return sdf(lx, ly);
};
const headEllipse = (cx: number, cy: number, rx: number, ry: number): Sdf => inHead(ellipse(cx, cy, rx, ry));
const headPolygon = (pts: number[][], round: number): Sdf => inHead(polygon(pts, round));
const headCapsule = (ax: number, ay: number, bx: number, by: number, r: number): Sdf =>
  inHead(capsule(ax, ay, bx, by, r));
function fromHead(lx: number, ly: number): [number, number] {
  const c = Math.cos(head.rot);
  const s = Math.sin(head.rot);
  return [head.x + lx * c - ly * s, head.y + lx * s + ly * c];
}

// --- palette and shading -----------------------------------------------------------------

const CREAM = hex("#FFF6EC");
const CREAM_DEEP = hex("#F6DFC9");
const CREAM_EDGE = hex("#E6C9B0");
const GINGER = hex("#F7AA6B");
const GINGER_DEEP = hex("#E8934F");
const GINGER_EDGE = hex("#CF7C3C");
const PINK = hex("#F9C0CE");
const PINK_DEEP = hex("#EC8CA6");
const INK = hex("#33232B");
const WHITE = hex("#FFFFFF");
const AMBER_TOP = hex("#C98A2B");
const AMBER_BOTTOM = hex("#F2C368");
const GOLD = hex("#FFD98E");

// A soft vertical gradient, with the colour deepened towards the silhouette's edge: that is
// what makes a flat shape read as a plush rounded form rather than a sticker.
const plush = (top: Rgb, bottom: Rgb, edge: Rgb) => (x: number, y: number, d: number): Rgb => {
  const base = mixRgb(top, bottom, clamp((y - 380) / 520));
  const deep = clamp(-d / 26);
  return mixRgb(base, edge, 0.5 * (1 - deep) * (1 - deep));
};
const flat = (c: Rgb) => () => c;

// --- the picture -------------------------------------------------------------------------

// Background: a soft mint at the top falling to a blush rose, with a gentle glow behind the
// cat. It stays pastel but is a shade deeper than the cream fur, so the cat's silhouette reads
// at a glance even at 300 pixels across.
for (let py = 0; py < W; py++) {
  const y = (py + 0.5) / SS;
  for (let px = 0; px < W; px++) {
    const x = (px + 0.5) / SS;
    let col = mixRgb(hex("#E9F4EE"), hex("#FFDCE8"), clamp(y / SIZE) ** 1.35);
    const glow = clamp(1 - Math.hypot(x - 512, y - 470) / 620);
    col = mixRgb(col, WHITE, 0.42 * glow * glow);
    const i = (py * W + px) * 3;
    canvas[i] = col[0];
    canvas[i + 1] = col[1];
    canvas[i + 2] = col[2];
  }
}

// Soft shapes behind the cat, out of focus.
fill(ellipse(206, 214, 54, 54), [146, 154, 266, 274], flat(hex("#FFF3F7")), 0.75);
fill(ellipse(858, 268, 38, 38), [816, 226, 900, 310], flat(hex("#FFF3F7")), 0.7);
fill(ellipse(158, 700, 30, 30), [124, 666, 192, 734], flat(hex("#FFF3F7")), 0.6);

// The shadow the cat sits in.
fill(ellipse(520, 900, 292, 54), [220, 838, 820, 962], flat(hex("#D9B6C1")), (x, y, d) => clamp(1 + d / 40) * 0.5);

// The tail: a chain of capsules curling up and to the left, thick at the base, thin at the tip.
const TAIL: [number, number, number][] = [
  [332, 806, 44],
  [246, 770, 39],
  [199, 702, 34],
  [216, 634, 29],
  [266, 604, 23],
];
for (let i = 0; i < TAIL.length - 1; i++) {
  const a = TAIL[i];
  const b = TAIL[i + 1];
  fill(
    capsule(a[0], a[1], b[0], b[1], a[2]),
    [Math.min(a[0], b[0]) - a[2] - 4, Math.min(a[1], b[1]) - a[2] - 4, Math.max(a[0], b[0]) + a[2] + 4, Math.max(a[1], b[1]) + a[2] + 4],
    plush(GINGER, GINGER_DEEP, GINGER_EDGE)
  );
}
fill(ellipse(266, 604, 23, 23), [240, 578, 292, 630], flat(hex("#FFF3E6")), 0.9);

// The body.
const body = ellipse(500, 706, 210, 184);
fill(body, [286, 518, 714, 894], plush(CREAM, CREAM_DEEP, CREAM_EDGE));

// A ginger saddle across the body's left side, clipped to the body's silhouette.
fill(
  ellipse(404, 686, 98, 132, -0.22),
  [300, 548, 510, 826],
  plush(GINGER, GINGER_DEEP, GINGER_EDGE),
  0.95,
  body
);

// The belly, paler than the body.
fill(ellipse(500, 756, 126, 116), [370, 636, 630, 876], flat(hex("#FFFBF4")), 0.8);

// The yarn ball the raised paw rests on.
const BALL: [number, number, number] = [768, 812, 94];
const ball = ellipse(BALL[0], BALL[1], BALL[2], BALL[2]);
fill(ball, [670, 714, 866, 910], plush(PINK, PINK_DEEP, hex("#C9708C")));
for (const a of [0.5, -0.35, 1.2, 2.4]) {
  const dx = Math.cos(a) * BALL[2];
  const dy = Math.sin(a) * BALL[2];
  fill(
    capsule(BALL[0] - dx, BALL[1] - dy, BALL[0] + dx, BALL[1] + dy, 7),
    [674, 718, 862, 906],
    flat(hex("#D97590")),
    0.55,
    ball
  );
}
fill(ellipse(BALL[0] - 34, BALL[1] - 40, 26, 20, -0.6), [700, 744, 762, 806], flat(WHITE), 0.45, ball);

// The haunch, then the two front legs and their wide soft paws.
fill(ellipse(356, 802, 88, 64), [268, 738, 444, 866], plush(GINGER, GINGER_DEEP, GINGER_EDGE), 0.9);
for (const lx of [446, 558]) {
  fill(capsule(lx, 744, lx, 850, 57), [lx - 62, 684, lx + 62, 910], plush(CREAM, CREAM_DEEP, CREAM_EDGE));
  fill(ellipse(lx, 866, 65, 46), [lx - 68, 816, lx + 68, 916], plush(CREAM, CREAM_DEEP, CREAM_EDGE));
  for (const t of [-26, 0, 26]) {
    fill(capsule(lx + t, 900, lx + t, 880, 3.6), [lx + t - 8, 872, lx + t + 8, 908], flat(hex("#D9BCA8")), 0.85);
  }
}

// The raised paw, reaching over to the yarn.
fill(capsule(654, 806, 672, 766, 47), [598, 712, 722, 856], plush(CREAM, CREAM_DEEP, CREAM_EDGE));
fill(ellipse(688, 748, 59, 45, -0.38), [626, 700, 750, 796], plush(CREAM, CREAM_DEEP, CREAM_EDGE));
for (const t of [-22, 0, 22]) {
  fill(capsule(688 + t, 776, 688 + t, 758, 3.4), [688 + t - 8, 750, 688 + t + 8, 782], flat(hex("#D9BCA8")), 0.75);
}

// The ears, behind the head.
const LEFT_EAR = [
  [-212, -108],
  [-180, -300],
  [-58, -172],
];
const RIGHT_EAR = [
  [212, -108],
  [180, -300],
  [58, -172],
];
fill(headPolygon(LEFT_EAR, 14), [270, 60, 460, 290], plush(GINGER, GINGER_DEEP, GINGER_EDGE));
fill(headPolygon(RIGHT_EAR, 14), [540, 60, 730, 290], plush(GINGER, GINGER_DEEP, GINGER_EDGE));
const INNER_L = [
  [-178, -132],
  [-160, -248],
  [-102, -178],
];
const INNER_R = [
  [178, -132],
  [160, -248],
  [102, -178],
];
fill(headPolygon(INNER_L, 10), [300, 106, 420, 260], flat(PINK));
fill(headPolygon(INNER_R, 10), [600, 106, 720, 260], flat(PINK));

// The head, tilted a little to one side.
const headSdf = headEllipse(0, 0, 214, 198);
fill(headSdf, [272, 158, 728, 594], plush(CREAM, CREAM_DEEP, CREAM_EDGE));

// Ginger cap over the top of the head and one cheek, and three soft stripes on the forehead.
fill(headEllipse(-96, -96, 150, 128, -0.3), [286, 190, 600, 460], plush(GINGER, GINGER_DEEP, GINGER_EDGE), 0.5, headSdf);
for (const s of [-1, 0, 1]) {
  fill(
    headCapsule(s * 46, -256, s * 34, -186, 9),
    [380, 120, 620, 300],
    flat(GINGER_DEEP),
    0.8,
    headSdf
  );
}

// Blush, soft-edged.
for (const s of [-1, 1]) {
  fill(
    headEllipse(s * 150, 66, 58, 34),
    [head.x - 240, head.y - 20, head.x + 240, head.y + 160],
    flat(hex("#F58FA6")),
    (x, y, d) => 0.5 * clamp(1 + d / 30) ** 0.8
  );
}

// The muzzle, the chin, the nose and the mouth.
fill(headEllipse(-36, 100, 62, 44), [head.x - 130, head.y + 40, head.x, head.y + 170], flat(hex("#FFFAF3")), 0.96);
fill(headEllipse(36, 100, 62, 44), [head.x, head.y + 40, head.x + 130, head.y + 170], flat(hex("#FFFAF3")), 0.96);
fill(headEllipse(0, 132, 44, 28), [head.x - 52, head.y + 96, head.x + 52, head.y + 164], flat(hex("#FFFAF3")), 0.9);
fill(headPolygon([[-28, 58], [28, 58], [0, 90]], 9), [head.x - 36, head.y + 48, head.x + 36, head.y + 100], plush(PINK_DEEP, hex("#DE7A94"), hex("#C4657F")));
fill(headEllipse(-6, 68, 9, 5, -0.3), [head.x - 20, head.y + 58, head.x + 10, head.y + 78], flat(WHITE), 0.7);

// The eyes: big, glossy and bright, with the amber of a ginger cat.
for (const s of [-1, 1]) {
  const ex = s * 96;
  const ey = -28;
  const box = (w: number, h: number): Box => [head.x + ex - w, head.y + ey - h, head.x + ex + w, head.y + ey + h];
  fill(headEllipse(ex, ey, 68, 76), box(76, 86), plush(INK, hex("#241A20"), hex("#150F13")));
  fill(
    headEllipse(ex, ey + 4, 56, 63),
    box(64, 74),
    (x, y, d) => {
      const t = clamp((y - (head.y + ey - 44)) / 130);
      const base = mixRgb(AMBER_TOP, AMBER_BOTTOM, t);
      const deep = clamp(-d / 18);
      return mixRgb(base, hex("#8E5A15"), 0.55 * (1 - deep) * (1 - deep));
    }
  );
  fill(headEllipse(ex, ey + 2, 23, 41), box(30, 48), flat(hex("#241A20")));
  fill(headEllipse(ex - 20, ey - 22, 21, 23), box(76, 86), flat(WHITE));
  fill(headEllipse(ex + 17, ey + 28, 10, 10), box(76, 86), flat(WHITE), 0.75);
}

// The mouth: a small, pleased curve under the nose.
fill(headCapsule(0, 92, -9, 106, 4), [head.x - 22, head.y + 80, head.x + 4, head.y + 118], flat(hex("#8A5460")), 0.8);
fill(headCapsule(0, 92, 9, 106, 4), [head.x - 4, head.y + 80, head.x + 22, head.y + 118], flat(hex("#8A5460")), 0.8);
for (const s of [-1, 1]) {
  fill(
    capsule(...fromHead(s * 10, 106), ...fromHead(s * 34, 96), 4),
    [head.x - 60, head.y + 60, head.x + 60, head.y + 150],
    flat(hex("#8A5460")),
    0.7
  );
}

// Whiskers, three a side.
for (const s of [-1, 1]) {
  const rows: [number, number, number, number][] = [
    [84, 62, 236, 40],
    [92, 88, 244, 88],
    [84, 112, 232, 138],
  ];
  for (const [x0, y0, x1, y1] of rows) {
    const a = fromHead(s * x0, y0);
    const b = fromHead(s * x1, y1);
    fill(
      capsule(a[0], a[1], b[0], b[1], 3.4),
      [Math.min(a[0], b[0]) - 8, Math.min(a[1], b[1]) - 8, Math.max(a[0], b[0]) + 8, Math.max(a[1], b[1]) + 8],
      flat(hex("#C9AFB6")),
      0.9
    );
  }
}

// Three little sparkles, for charm.
for (const [sx, sy, sz, sa] of [
  [232, 232, 20, 0.9],
  [812, 190, 14, 0.8],
  [860, 470, 11, 0.7],
]) {
  const star = (x: number, y: number) =>
    Math.min(capsule(sx - sz, sy, sx + sz, sy, 3.2)(x, y), capsule(sx, sy - sz, sx, sy + sz, 3.2)(x, y));
  fill(star, [sx - sz - 6, sy - sz - 6, sx + sz + 6, sy + sz + 6], flat(GOLD), sa);
}

// --- downsample (4x box filter) and write the PNG ----------------------------------------

const out = new Uint8ClampedArray(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 3;
        r += canvas[i];
        g += canvas[i + 1];
        b += canvas[i + 2];
      }
    }
    const n = SS * SS;
    const o = (y * SIZE + x) * 3;
    out[o] = r / n;
    out[o + 1] = g / n;
    out[o + 2] = b / n;
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([Buffer.from("", "latin1"), Buffer.from(data)]);
  const whole = Buffer.concat([head.subarray(4, 8), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(whole));
  return Buffer.concat([head, body, tail]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolour, no alpha
const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < SIZE * 3; x++) raw[row + 1 + x] = out[y * SIZE * 3 + x];
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", new Uint8Array(0)),
]);

const dest = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, "entry.png"), png);
console.log(`wrote entry.png, ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KiB`);
