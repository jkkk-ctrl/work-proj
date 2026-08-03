import Head from 'next/head';
import { useEffect, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import koreaProvinces from '../data/korea-provinces.json';

/* ═══════════════════════════════════════════════════════
   캔버스 — viewBox 1단위 = 실제 1px (max-width:1170px 기준)
   ═══════════════════════════════════════════════════════ */
const SVG_W = 1170;
const SVG_H = 1800;

/* 지도 여백. bottom 이 큰 이유는 아래에 제주도를 놓기 때문 */
const PAD = { left: 58, top: 44, right: 58, bottom: 280 };

/* ─── Region color palette ─── */
const REGION_COLORS = {
  capital_region:     '#1E3D7B',
  gangwon_region:     '#7D8DC8',
  chungcheong_region: '#94C4E0',
  honam_region:       '#4A8EC0',
  yeongnam_region:    '#132B58',
  jeju_region:        '#B8D4EC',
};

const REGION_ORDER = [
  'capital_region',
  'gangwon_region',
  'chungcheong_region',
  'honam_region',
  'yeongnam_region',
  'jeju_region',
];

/* ─── 권역 끌어오기 ───
   실제 제주도는 육지에서 250px 넘게 떨어져 있어 지도가 세로로 늘어지고 허전하다.
   지도 범위 계산에서 빼고, 아래 설정대로 육지 쪽으로 당겨 붙인다.
   dx  = 오른쪽으로 미는 양(px)
   gap = 육지 남해안과의 세로 간격(px) — 실제 지오메트리 기준으로 매번 자동 계산됨 */
const REGION_INSET = {
  jeju_region: { dx: 60, gap: 55 },
};

/* ─── 배지 위치 보정 ───
   기본값은 각 권역의 면적 무게중심. 아래는 거기서 밀 거리 [오른쪽, 아래쪽] px */
const BADGE_OFFSET = {
  capital_region:     [0, 0],
  gangwon_region:     [0, 0],
  chungcheong_region: [0, 0],
  honam_region:       [0, 0],
  yeongnam_region:    [0, 0],
  jeju_region:        [0, 0],
};

/* 배지를 무게중심이 아니라 "권역에 걸쳐서" 놓는 경우.
   값 = 배지 왼쪽 가장자리가 섬 폭의 몇 지점에 오는가 (0 = 섬 왼쪽끝, 1 = 섬 오른쪽끝)
   0.67 이면 배지가 섬의 오른쪽 1/3 에 걸치고 나머지는 바다로 빠진다.
   제주도는 폭이 배지 지름보다 작아 정중앙에 얹으면 섬이 통째로 가려진다. */
const BADGE_OVERLAP = {
  jeju_region: 0.67,
};

/* 하단 "기준" 텍스트를 세로로 맞출 대상 권역.
   SVG 밖 요소라 절대 위치로 얹으며, 위치는 % 라서 지도가 축소돼도 따라간다. */
const LABEL_ALIGN_REGION = 'jeju_region';

/* ─── 배지 기본 스타일 ─── 크기 단위 = px (viewBox), 화면에선 ×0.385 */
const BADGE = {
  r1: 98*1.45,           // 가장 바깥 원
  r2: 78*1.5,
  r3: 59*1.55,           // 안쪽 원

  fill1: 'rgba(255,255,255,0.22)',
  fill2: 'rgba(210,222,238,0.55)',
  fill3: 'rgba(225,232,245,0.78)',
  textColor: '#1a2a4a',

  nameSize: 32,     // 권역 이름
  nameWeight: 700,
  valueSize: 70,    // 숫자
  valueWeight: 700,

  /* 이름과 숫자를 하나의 세로 묶음으로 보고 배치한다.
     gap 만 정하면 묶음 전체가 원 중심에 자동 정렬되므로,
     글씨 크기를 바꿔도 y 좌표를 다시 계산할 필요가 없다. */
  gap: 20,          // 이름 ↔ 숫자 세로 간격
  shiftY: 0,        // 묶음 전체 미세 이동 (양수 = 아래로)
};

/* 글자 높이 / 폰트크기 비율. Pretendard 의 한글·숫자 기준 약 0.72 */
const CAP_RATIO = 0.72;

/* ─── 권역별 덮어쓰기 ───
   바꾸고 싶은 항목만 적으면 나머지는 위 BADGE 기본값을 그대로 쓴다.
   색·반지름·글씨크기 무엇이든 여기서 권역별로 다르게 줄 수 있다. */
const BADGE_STYLE = {
  /* 제주 배지는 2/3 가 흰 바다 위에 놓여서 기본 흰색 계열이면 거의 안 보인다.
     섬 색(#B8D4EC) 계열로 톤을 넣어 흰 배경에서도 형태가 드러나게 함. */
  jeju_region: {
    fill1: 'rgba(184,212,236,0.30)',
    fill2: 'rgba(184,212,236,0.55)',
    fill3: 'rgba(184,212,236,0.85)',
  },
};

/* 권역의 최종 배지 스타일 = 기본값 + 덮어쓰기 */
function badgeStyle(regionId) {
  return { ...BADGE, ...(BADGE_STYLE[regionId] || {}) };
}

/* ─── 해안선·섬 단순화 ─── */
const SIMPLIFY = {
  /* 이 넓이(deg²) 미만인 섬은 삭제.
     거제도 0.038 / 진도 0.037 / 강화도 0.031 / 안면도 0.011
     울릉도 0.0075 / 백령도 0.0047 / 흑산도 0.002 */
  minIslandArea: 0.008,

  /* 좌표 격자(도). 키울수록 해안선이 단순·각짐. 0.005 ≈ 500m */
  grid: 0.005,

  /* 울릉도·독도 외곽선 단순화 강도 (섬 크기 대비 비율).
     키울수록 각져짐. 0.035 ≈ 약 15개 점 */
  isletRatio: 0.035,
};

/* ─── 울릉도·독도 ───
   실제 지오메트리는 독도가 0.2km라 어떤 배율로도 제대로 안 그려진다.
   지도 범위 계산에서만 빼고, 표기는 동해에 작은 점으로 대신한다. */
const ISLET = {
  lngFar:   130.0,        // 이 경도보다 동쪽 = 울릉도·독도 (지도 범위에서 제외)
  lngDokdo: 131.3,
  /* x,y = 배치 위치 / size = 그려질 크기 (viewBox 단위, 배율은 자동 계산)
     화면에서는 ×0.385 → 울릉도 약 9px / 독도 약 6px */
  ulleung: { x: 1058+30, y: 430+150, size: 24 },
  dokdo:   { x: 1108+30, y: 490+110, size: 16 },
};

const STROKE = { province: 1.7 };

/* ═══════════════ 지오메트리 유틸 (서버에서 1회 실행) ═══════════════ */

/* 신발끈 공식. 부호가 링의 감김 방향을 나타낸다 (음수 = 경위도 평면상 시계방향) */
function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

function ringArea(ring) {
  return Math.abs(signedArea(ring));
}

/* d3-geo 는 구면 좌표를 쓰기 때문에, 작은 폴리곤의 외곽 링이 "음수 shoelace"
   여야 그 안쪽을 섬으로 인식한다. 반대로 감겨 있으면 "지구 전체에서 그 섬을
   뺀 영역"으로 해석해 형태가 완전히 깨진다.
   원본 GeoJSON 의 감김 방향이 파일마다 제각각이라 여기서 강제로 맞춘다. */
function fixWinding(poly) {
  return poly.map((ring, i) => {
    const want = i === 0 ? -1 : 1;         // 외곽 링은 음수, 구멍은 양수
    const a = signedArea(ring);
    if (a === 0 || Math.sign(a) === want) return ring;
    return [...ring].reverse();
  });
}

function ringLng(ring) {
  let s = 0;
  for (const p of ring) s += p[0];
  return s / ring.length;
}

/* 좌표를 격자에 스냅 + 연속 중복점 제거.
   인접한 도(道)가 같은 격자로 붙으므로 경계에 틈이 생기지 않는다.
   ─ Douglas-Peucker를 안 쓰는 이유: 폴리곤마다 따로 단순화하면
     맞닿은 경계가 어긋나 지도 한가운데에 흰 틈이 생긴다. */
function quantizeRing(ring, grid) {
  const snapped = ring.map(([x, y]) => [
    Math.round(x / grid) * grid,
    Math.round(y / grid) * grid,
  ]);

  const out = [snapped[0]];
  for (let i = 1; i < snapped.length; i++) {
    const p = snapped[i];
    const q = out[out.length - 1];
    if (p[0] !== q[0] || p[1] !== q[1]) out.push(p);
  }

  if (out.length < 4) return ring;

  const f = out[0];
  const l = out[out.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  return out;
}

function toPolygons(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

/* ── 섬 외곽선 단순화 (Douglas-Peucker) ──
   울릉도·독도는 다른 도와 경계를 맞대지 않는 독립된 섬이라
   폴리곤별로 따로 단순화해도 경계에 틈이 생기지 않는다.
   (본토는 이걸 쓰면 안 됨 → 위의 quantizeRing 사용) */
function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifyRing(ring, tol) {
  const n = ring.length;
  if (n < 6) return ring;

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  /* 재귀 대신 명시적 스택 — 점이 많아도 스택 오버플로 없음 */
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;

    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(ring[i], ring[s], ring[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }

    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  return out.length >= 4 ? out : ring;   // 너무 깎이면 원본 유지
}

/* tolerance 를 섬 크기에 비례시켜, 크기가 4000배 차이나는
   울릉도와 독도가 같은 수준으로 단순화되게 한다 */
function simplifyIslet(poly, ratio) {
  const ring = poly[0];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;

  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }

  const tol = Math.max(x1 - x0, y1 - y0) * ratio;
  return poly.map(r => simplifyRing(r, tol));
}

/* 울릉도·독도 분리 → 작은 섬 제거 → 좌표 격자 스냅 */
function processFeature(feature) {
  const polys = toPolygons(feature.geometry);
  if (!polys.length) return { main: null, far: [] };

  const scored = polys.map(p => ({
    p,
    area: ringArea(p[0]),
    lng: ringLng(p[0]),
  }));

  const far = scored.filter(s => s.lng > ISLET.lngFar);
  let rest = scored.filter(s => s.lng <= ISLET.lngFar);
  if (!rest.length) return { main: null, far };

  /* 가장 큰 덩어리는 넓이와 무관하게 항상 유지 (도가 통째로 사라지지 않도록) */
  const maxArea = Math.max(...rest.map(s => s.area));
  rest = rest.filter(s => s.area >= SIMPLIFY.minIslandArea || s.area === maxArea);

  const coordinates = rest.map(({ p }) =>
    p.map(ring => quantizeRing(ring, SIMPLIFY.grid))
  );

  return {
    main: { ...feature, geometry: { type: 'MultiPolygon', coordinates } },
    far,
  };
}

/* ═══════════════ 컴포넌트 ═══════════════ */

function Badge({ name, value, cx, cy, s }) {
  /* ── 텍스트 묶음 세로 배치 ──
     이름 박스(높이 nameSize×CAP)와 숫자 박스(valueSize×CAP)를 gap 만큼 띄워 쌓고,
     그 묶음 전체의 중심을 원 중심(0)에 맞춘다.
     각 박스의 아래변이 곧 글자의 베이스라인이므로 그대로 y 로 쓴다. */
  const nameH = s.nameSize * CAP_RATIO;
  const valueH = s.valueSize * CAP_RATIO;
  const top = -(nameH + s.gap + valueH) / 2 + s.shiftY;

  const nameY = top + nameH;
  const valueY = nameY + s.gap + valueH;

  return (
    /* 바깥 <g>: 위치 전용 (SVG transform 속성) */
    <g transform={`translate(${cx},${cy})`}>
      {/* 안쪽 <g>: 확대 전용 (CSS transform) — 분리해야 hover 시 충돌하지 않음 */}
      <g className="badge-group">
        <circle r={s.r1} fill={s.fill1} />
        <circle r={s.r2} fill={s.fill2} />
        <circle r={s.r3} fill={s.fill3} />
        <text
          y={nameY}
          textAnchor="middle"
          style={{ fontSize: s.nameSize, fontWeight: s.nameWeight, fill: s.textColor, fontFamily: 'inherit', letterSpacing: '-0.01em' }}
        >
          {name}
        </text>
        <text
          y={valueY}
          textAnchor="middle"
          style={{ fontSize: s.valueSize, fontWeight: s.valueWeight, fill: s.textColor, fontFamily: 'inherit' }}
        >
          {value}
        </text>
      </g>
    </g>
  );
}

/* 울릉도·독도를 실제 위치가 아닌 지정한 자리에, 지정한 크기로 그린다.
   섬이 워낙 작아 원래 배율로는 안 보이므로 bbox 기준 자동 확대. */
function Islet({ geom, pathGen, cfg, fill }) {
  if (!geom) return null;

  const d = pathGen(geom);
  if (!d) return null;

  const [[x0, y0], [x1, y1]] = pathGen.bounds(geom);
  const span = Math.max(x1 - x0, y1 - y0);
  if (!Number.isFinite(span) || span <= 0) return null;

  const scale = cfg.size / span;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  return (
    <g transform={`translate(${cfg.x},${cfg.y}) scale(${scale}) translate(${-cx},${-cy})`}>
      <path d={d} fill={fill} />
    </g>
  );
}

export default function MapPage({ initialData, geoData, islets }) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    fetch('/api/regions')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!geoData) return null;

  const byRegion = {};
  geoData.features.forEach(f => {
    const r = f.properties.region;
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(f);
  });

  const asFC = feats => ({ type: 'FeatureCollection', features: feats || [] });

  /* 끌어올 권역(제주)을 뺀 "육지"에만 맞춰 투영.
     제주가 빠지면서 세로 범위가 1.1° 줄어 지도가 크게 확대된다. */
  const landFC = asFC(geoData.features.filter(f => !REGION_INSET[f.properties.region]));

  const projection = geoMercator().fitExtent(
    [[PAD.left, PAD.top], [SVG_W - PAD.right, SVG_H - PAD.bottom]],
    landFC
  );

  /* 육지를 위쪽에 붙여서 아래 공간을 제주 자리로 비운다 */
  {
    const b = geoPath(projection).bounds(landFC);
    const [tx, ty] = projection.translate();
    if (Number.isFinite(b[0][1])) projection.translate([tx, ty - (b[0][1] - PAD.top)]);
  }

  const pathGen = geoPath(projection);
  const landBounds = pathGen.bounds(landFC);

  /* 권역별 이동량 — 제주를 육지 아래 gap 만큼 떨어진 곳으로 당긴다 */
  const shift = {};
  REGION_ORDER.forEach(id => { shift[id] = [0, 0]; });

  Object.entries(REGION_INSET).forEach(([id, cfg]) => {
    const b = pathGen.bounds(asFC(byRegion[id]));
    if (!Number.isFinite(b[0][1])) return;
    shift[id] = [cfg.dx, -(b[0][1] - landBounds[1][1] - cfg.gap)];
  });

  /* 배지 위치 = 무게중심(또는 권역 오른쪽 옆) + 권역 이동량 + 보정값 */
  const badges = REGION_ORDER.map(regionId => {
    const feats = byRegion[regionId];
    if (!feats || !feats.length) return null;

    const fcR = asFC(feats);
    const s = badgeStyle(regionId);
    let cx;
    let cy;

    if (BADGE_OVERLAP[regionId] != null) {
      const b = pathGen.bounds(fcR);
      if (!Number.isFinite(b[0][0])) return null;
      /* 배지 왼쪽 가장자리를 섬 폭의 지정 지점에 맞춘다 */
      const left = b[0][0] + (b[1][0] - b[0][0]) * BADGE_OVERLAP[regionId];
      cx = left + s.r1;
      cy = (b[0][1] + b[1][1]) / 2;
    } else {
      [cx, cy] = pathGen.centroid(fcR);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    }

    const [sx, sy] = shift[regionId] || [0, 0];
    const [ox, oy] = BADGE_OFFSET[regionId] || [0, 0];
    return { regionId, cx: cx + sx + ox, cy: cy + sy + oy, s };
  }).filter(Boolean);

  const regions = data?.regions || {};
  const updatedLabel = data?.updated_label || '';
  const isletFill = REGION_COLORS[islets?.region] || REGION_COLORS.yeongnam_region;

  /* 기준 텍스트 세로 위치 — 대상 권역(제주도)의 세로 중심에 맞춘다 */
  let labelTop = 90;
  {
    const b = pathGen.bounds(asFC(byRegion[LABEL_ALIGN_REGION]));
    if (Number.isFinite(b[0][1])) {
      const [, sy] = shift[LABEL_ALIGN_REGION] || [0, 0];
      labelTop = ((b[0][1] + b[1][1]) / 2 + sy) / SVG_H * 100;
    }
  }

  const groupTransform = id => {
    const [x, y] = shift[id] || [0, 0];
    return x || y ? `translate(${x},${y})` : undefined;
  };

  return (
    <>
      <Head>
        <title>제휴 골프장 현황</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="map-page">
        <div className="map-wrapper">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="korea-svg"
            aria-label="권역별 제휴 골프장 수 지도"
          >
            {/* 도별 면 채우기 */}
            {REGION_ORDER.map(regionId => (
              <g key={regionId} transform={groupTransform(regionId)}>
                {(byRegion[regionId] || []).map(feature => (
                  <path
                    key={feature.properties.id}
                    d={pathGen(feature)}
                    className="province-path"
                    fill={REGION_COLORS[regionId]}
                  />
                ))}
              </g>
            ))}

            {/* 도 경계 흰 선 (전체 면 위에 덮어야 하므로 별도 패스) */}
            {REGION_ORDER.map(regionId => (
              <g key={`b-${regionId}`} transform={groupTransform(regionId)}>
                {(byRegion[regionId] || []).map(feature => (
                  <path
                    key={feature.properties.id}
                    d={pathGen(feature)}
                    fill="none"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={STROKE.province}
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            ))}

            {/* 울릉도·독도 — 단순화한 실제 섬 모양으로 동해에 표기 */}
            <Islet geom={islets?.ulleung} pathGen={pathGen} cfg={ISLET.ulleung} fill={isletFill} />
            <Islet geom={islets?.dokdo}   pathGen={pathGen} cfg={ISLET.dokdo}   fill={isletFill} />

            {/* 권역 배지 */}
            {badges.map(({ regionId, cx, cy, s }) => {
              const r = regions[regionId];
              if (!r) return null;
              return <Badge key={regionId} name={r.name} value={r.value} cx={cx} cy={cy} s={s} />;
            })}
          </svg>

          <div className="updated-label" style={{ top: `${labelTop}%` }}>
            <strong>{updatedLabel}</strong>
            국내 제휴 골프 코스는 직접 문의해주세요
          </div>

          <a href="/admin" className="admin-link">관리자</a>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps() {
  const raw = koreaProvinces;

  /* 해안선·섬 단순화 + 울릉도·독도 분리 (원본 json은 건드리지 않음) */
  const features = [];
  const ulleung = [];
  const dokdo = [];
  let isletRegion = null;

  raw.features.forEach(f => {
    const { main, far } = processFeature(f);
    if (main) features.push(main);

    far.forEach(s => {
      if (!isletRegion) isletRegion = f.properties.region;
      const simplified = fixWinding(simplifyIslet(s.p, SIMPLIFY.isletRatio));
      (s.lng > ISLET.lngDokdo ? dokdo : ulleung).push(simplified);
    });
  });

  const asMulti = list =>
    (list.length ? { type: 'MultiPolygon', coordinates: list } : null);

  let initialData = null;
  try {
    const { readData } = await import('../lib/db');
    initialData = await readData();
  } catch {}

  return {
    props: {
      initialData,
      geoData: { type: 'FeatureCollection', features },
      islets: {
        region: isletRegion,
        ulleung: asMulti(ulleung),
        dokdo: asMulti(dokdo),
      },
    },
  };
}
