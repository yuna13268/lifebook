// 책에 인쇄할 QR 코드를 만든다 (외부 라이브러리 없음).
// QR 모델 2, 바이트 모드, 버전 1~10, 오류 정정 L/M/Q/H. 책 QR은 긁힘에 강하도록 기본 Q를 쓴다.
// 사용: import { qrSvg, qrMatrix } from './qr.mjs';  qrSvg('https://…', { ecl: 'Q' })

// 버전별 [블록당 오류 정정 코드 수, [블록 수, 블록당 데이터 수], [블록 수, 블록당 데이터 수]?]
const TABLE = {
  1: { L: [7, [1, 19]], M: [10, [1, 16]], Q: [13, [1, 13]], H: [17, [1, 9]] },
  2: { L: [10, [1, 34]], M: [16, [1, 28]], Q: [22, [1, 22]], H: [28, [1, 16]] },
  3: { L: [15, [1, 55]], M: [26, [1, 44]], Q: [18, [2, 17]], H: [22, [2, 13]] },
  4: { L: [20, [1, 80]], M: [18, [2, 32]], Q: [26, [2, 24]], H: [16, [4, 9]] },
  5: { L: [26, [1, 108]], M: [24, [2, 43]], Q: [18, [2, 15], [2, 16]], H: [22, [2, 11], [2, 12]] },
  6: { L: [18, [2, 68]], M: [16, [4, 27]], Q: [24, [4, 19]], H: [28, [4, 15]] },
  7: { L: [20, [2, 78]], M: [18, [4, 31]], Q: [18, [2, 14], [4, 15]], H: [26, [4, 13], [1, 14]] },
  8: { L: [24, [2, 97]], M: [22, [2, 38], [2, 39]], Q: [22, [4, 18], [2, 19]], H: [26, [4, 14], [2, 15]] },
  9: { L: [30, [2, 116]], M: [22, [3, 36], [2, 37]], Q: [20, [4, 16], [4, 17]], H: [24, [4, 12], [4, 13]] },
  10: { L: [18, [2, 68], [2, 69]], M: [26, [4, 43], [1, 44]], Q: [24, [6, 19], [2, 20]], H: [28, [6, 15], [2, 16]] },
};
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* GF(256) 곱셈과 리드-솔로몬 오류 정정 코드 */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    g = next;
  }
  return g; // 최고차항부터
}
function rsRemainder(data, n) {
  const g = rsGenerator(n), r = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ r.shift(); r.push(0);
    for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
  }
  return r;
}

function codewords(bytes, version, ecl) {
  const [ecn, ...groups] = TABLE[version][ecl];
  const dataLen = groups.reduce((s, [n, k]) => s + n * k, 0);
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, version < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; data.length < dataLen; p ^= 1) data.push(p ? 0x11 : 0xec);
  // 블록으로 나누고 번갈아 섞는다
  const blocks = []; let off = 0;
  groups.forEach(([n, k]) => { for (let i = 0; i < n; i++) { const d = data.slice(off, off + k); off += k; blocks.push({ d, e: rsRemainder(d, ecn) }); } });
  const out = [], maxK = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxK; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
  for (let i = 0; i < ecn; i++) blocks.forEach(b => out.push(b.e[i]));
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

function build(version, ecl, cw, mask) {
  const n = version * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  [[3, 3], [n - 4, 3], [3, n - 4]].forEach(([cx, cy]) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
    }
  });
  const al = ALIGN[version], last = al.length - 1;
  al.forEach((cy, i) => al.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // 형식 정보 (오류 정정 단계 + 마스크)
  const fdata = (ECL_BITS[ecl] << 3) | mask;
  let rem = fdata; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fbits = ((fdata << 10) | rem) ^ 0x5412, fb = i => ((fbits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, fb(i));
  set(8, 7, fb(6)); set(8, 8, fb(7)); set(7, 8, fb(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, fb(i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, fb(i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, fb(i));
  set(8, n - 8, true);
  // 버전 정보 (7 이상)
  if (version >= 7) {
    let r = version; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (version << 12) | r;
    for (let i = 0; i < 18; i++) { const bit = ((vb >>> i) & 1) === 1, a = n - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit); set(b, a, bit); }
  }
  // 데이터를 오른쪽 아래부터 두 줄씩 지그재그로 채운다
  let k = 0; const total = cw.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - v : v;
      if (fn[y][x]) continue;
      let dark = false;
      if (k < total) { dark = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
      m[y][x] = dark !== MASKS[mask](x, y);
    }
  }
  return m;
}

// 마스크 고르기용 점수 (낮을수록 좋다)
function penalty(m) {
  const n = m.length; let s = 0;
  const lines = [];
  for (let i = 0; i < n; i++) { lines.push(m[i]); lines.push(m.map(r => r[i])); }
  lines.forEach(line => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += run - 2; run = 1; }
    }
    const str = line.map(b => (b ? '1' : '0')).join('');
    for (const pat of ['10111010000', '00001011101']) { let p = str.indexOf(pat); while (p >= 0) { s += 40; p = str.indexOf(pat, p + 1); } }
  });
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3; }
  const dark = m.reduce((a, r) => a + r.filter(Boolean).length, 0);
  s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return s;
}

/** 글자를 QR 칸(2차원 true/false 배열)으로 바꾼다. 너무 길면 오류. */
export function qrMatrix(text, ecl = 'Q') {
  const bytes = [...new TextEncoder().encode(String(text))];
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const [, ...g] = TABLE[v][ecl];
    const cap = g.reduce((s, [a, b]) => s + a * b, 0) * 8;
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) { version = v; break; }
  }
  if (!version) throw new Error('QR에 담기에는 주소가 너무 깁니다.');
  const cw = codewords(bytes, version, ecl);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) { const m = build(version, ecl, cw, mask), sc = penalty(m); if (sc < bestScore) { best = m; bestScore = sc; } }
  return best;
}

/** 인쇄용 SVG. 바깥 여백(quiet zone)은 4칸이 표준이다. */
export function qrSvg(text, { ecl = 'Q', border = 4, px = 0, label = '' } = {}) {
  const m = qrMatrix(text, ecl), n = m.length + border * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + border} ${y + border}h1v1h-1z`; }));
  const size = px ? ` width="${px}" height="${px}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${size} shape-rendering="crispEdges" role="img" aria-label="${label ? label.replace(/[&<>"]/g, '') : 'QR 코드'}"><rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
}
