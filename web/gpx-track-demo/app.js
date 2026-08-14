(() => {
  const RAW_URL = "/gpx-track-demo/track-raw.gpx";
  const EARTH_M = 6371000;

  /** Matches iOS SpeedGradient stops (km/h) — low range stretched. */
  const SPEED_STOPS = [
    { kmh: 0, color: [22, 163, 74] },
    { kmh: 5, color: [34, 197, 94] },
    { kmh: 15, color: [162, 214, 34] },
    { kmh: 25, color: [234, 179, 8] },
    { kmh: 50, color: [249, 115, 22] },
    { kmh: 90, color: [239, 68, 68] },
    { kmh: 140, color: [168, 85, 247] },
    { kmh: 200, color: [0, 0, 0] },
  ];
  const MIN_SEGMENT_DURATION_S = 0.35;
  const MEDIAN_RADIUS = 2;
  const MAX_ACCEL_MPS2 = 3.5;

  /** Matches iOS GpxSmoother. */
  const MIN_SPIKE_LENGTH_M = 25;
  const MAX_RETURN_FRACTION = 0.55;
  const MAX_SPIKE_PASSES = 5;
  const CROSS_TRACK_GAIN = 0.22;
  const HEADING_ALPHA = 0.35;
  const MIN_ALONG_FOR_HEADING_M = 4;
  const DWELL_MIN_DURATION_S = 45;
  const DWELL_MIN_PATH_M = 40;
  const DWELL_MAX_NET_M = 18;
  const DWELL_MIN_PATH_OVER_NET = 4;
  const DWELL_MAX_AVG_SPEED_MPS = 1.5;
  const DWELL_LOOKAHEAD_S = 240;

  const statusEl = document.getElementById("status");
  const map = L.map("map", { zoomControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const layers = {
    raw: L.layerGroup().addTo(map),
    smooth: L.layerGroup(),
    stop: L.layerGroup().addTo(map),
  };

  function hav(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_M * Math.asin(Math.sqrt(h));
  }

  function localMeters(p, origin) {
    const lat0 = (origin.lat * Math.PI) / 180;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(lat0);
    return {
      x: (p.lon - origin.lon) * mPerDegLon,
      y: (p.lat - origin.lat) * mPerDegLat,
    };
  }

  function fromLocalMeters(origin, east, north, ele, t) {
    const lat0 = (origin.lat * Math.PI) / 180;
    const mPerDegLat = 111320;
    const mPerDegLon = Math.max(111320 * Math.cos(lat0), 1e-6);
    return {
      lat: origin.lat + north / mPerDegLat,
      lon: origin.lon + east / mPerDegLon,
      ele,
      t,
    };
  }

  function crossTrackM(a, b, c) {
    const bp = localMeters(b, a);
    const cp = localMeters(c, a);
    const len2 = cp.x * cp.x + cp.y * cp.y;
    if (len2 < 1e-6) return hav(a, b);
    return Math.abs(cp.x * bp.y - cp.y * bp.x) / Math.sqrt(len2);
  }

  function bearing(from, to) {
    const d = localMeters(to, from);
    return Math.atan2(d.x, d.y);
  }

  function lerpAngle(a, b, t) {
    let delta = b - a;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return a + delta * t;
  }

  function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function speedColor(kmh) {
    const v = Math.max(0, kmh);
    if (v <= SPEED_STOPS[0].kmh) {
      const [r, g, b] = SPEED_STOPS[0].color;
      return `rgb(${r},${g},${b})`;
    }
    for (let i = 1; i < SPEED_STOPS.length; i += 1) {
      const a = SPEED_STOPS[i - 1];
      const b = SPEED_STOPS[i];
      if (v <= b.kmh) {
        const t = (v - a.kmh) / (b.kmh - a.kmh);
        return `rgb(${lerpChannel(a.color[0], b.color[0], t)},${lerpChannel(
          a.color[1],
          b.color[1],
          t,
        )},${lerpChannel(a.color[2], b.color[2], t)})`;
      }
    }
    const [r, g, b] = SPEED_STOPS[SPEED_STOPS.length - 1].color;
    return `rgb(${r},${g},${b})`;
  }

  function parseGpx(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const nodes = [...doc.querySelectorAll("trkpt")];
    return nodes.map((node) => {
      const eleNode = node.querySelector("ele");
      const timeNode = node.querySelector("time");
      return {
        lat: Number(node.getAttribute("lat")),
        lon: Number(node.getAttribute("lon")),
        ele: eleNode ? Number(eleNode.textContent) : null,
        t: timeNode ? Date.parse(timeNode.textContent) : NaN,
      };
    });
  }

  function segmentSpeeds(pts) {
    const speeds = [];
    for (let i = 1; i < pts.length; i += 1) {
      const d = hav(pts[i - 1], pts[i]);
      const dt = (pts[i].t - pts[i - 1].t) / 1000;
      speeds.push(dt >= MIN_SEGMENT_DURATION_S ? (d / dt) * 3.6 : 0);
    }
    return speeds;
  }

  function rollingMedian(values, radius) {
    return values.map((_, i) => {
      const lo = Math.max(0, i - radius);
      const hi = Math.min(values.length - 1, i + radius);
      const window = values.slice(lo, hi + 1).sort((a, b) => a - b);
      return window[Math.floor(window.length / 2)];
    });
  }

  function clampAcceleration(speeds, pts) {
    if (speeds.length < 2) return speeds;
    const out = speeds.slice();
    for (let i = 1; i < out.length; i += 1) {
      const dt = (pts[i + 1].t - pts[i].t) / 1000;
      if (dt < MIN_SEGMENT_DURATION_S) {
        out[i] = out[i - 1];
        continue;
      }
      const prev = out[i - 1] / 3.6;
      const curr = out[i] / 3.6;
      const maxDelta = MAX_ACCEL_MPS2 * dt;
      const clamped = Math.min(Math.max(curr, prev - maxDelta), prev + maxDelta);
      out[i] = Math.max(0, clamped * 3.6);
    }
    return out;
  }

  /** Display-only speeds: median + accel clamp (raw GPX untouched). */
  function displaySpeeds(pts) {
    return clampAcceleration(rollingMedian(segmentSpeeds(pts), MEDIAN_RADIUS), pts);
  }

  function pathLength(pts) {
    let sum = 0;
    for (let i = 1; i < pts.length; i += 1) sum += hav(pts[i - 1], pts[i]);
    return sum;
  }

  function dwellEndIndex(points, start) {
    let best = null;
    let path = 0;
    for (let j = start + 1; j < points.length; j += 1) {
      const dt = (points[j].t - points[start].t) / 1000;
      if (dt > DWELL_LOOKAHEAD_S) break;
      path += hav(points[j - 1], points[j]);
      const net = hav(points[start], points[j]);
      const avg = path / Math.max(dt, 0.1);
      if (
        dt >= DWELL_MIN_DURATION_S &&
        path >= DWELL_MIN_PATH_M &&
        net <= DWELL_MAX_NET_M &&
        path >= net * DWELL_MIN_PATH_OVER_NET &&
        avg <= DWELL_MAX_AVG_SPEED_MPS
      ) {
        best = j;
      }
    }
    return best;
  }

  function collapseStationaryWander(points) {
    if (points.length < 4) return points;
    const out = [];
    let i = 0;
    while (i < points.length) {
      const end = dwellEndIndex(points, i);
      if (end != null) {
        out.push(points[i]);
        i = end;
        continue;
      }
      out.push(points[i]);
      i += 1;
    }
    return out;
  }

  function removeOutAndBackSpikes(points) {
    if (points.length < 3) return { points, rejected: 0 };
    const keep = points.map(() => true);
    let rejected = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const ab = hav(a, b);
      const bc = hav(b, c);
      const ac = hav(a, c);
      const cte = crossTrackM(a, b, c);
      const farOut =
        Math.max(ab, bc) >= MIN_SPIKE_LENGTH_M &&
        cte >= MIN_SPIKE_LENGTH_M * 0.6;
      const cameBack =
        ac <= ab * MAX_RETURN_FRACTION && ac <= bc * MAX_RETURN_FRACTION;
      if (farOut && cameBack) {
        keep[i] = false;
        rejected += 1;
      }
    }
    return {
      points: points.filter((_, i) => keep[i]),
      rejected,
    };
  }

  function dampenCrossTrack(points) {
    if (points.length < 2) return points;
    let heading = bearing(points[0], points[1]);
    let position = { ...points[0] };
    const out = [{ ...points[0] }];

    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      const delta = localMeters(point, position);
      const along =
        delta.y * Math.cos(heading) + delta.x * Math.sin(heading);
      const cross =
        delta.x * Math.cos(heading) - delta.y * Math.sin(heading);
      const crossKept = cross * CROSS_TRACK_GAIN;
      const east =
        along * Math.sin(heading) + crossKept * Math.cos(heading);
      const north =
        along * Math.cos(heading) - crossKept * Math.sin(heading);
      position = fromLocalMeters(
        position,
        east,
        north,
        point.ele,
        point.t,
      );
      out.push(position);

      if (along >= MIN_ALONG_FOR_HEADING_M) {
        heading = lerpAngle(heading, Math.atan2(delta.x, delta.y), HEADING_ALPHA);
      }
    }
    return out;
  }

  function smoothTrack(raw) {
    let points = collapseStationaryWander(raw);
    let rejected = 0;
    for (let pass = 0; pass < MAX_SPIKE_PASSES; pass += 1) {
      const result = removeOutAndBackSpikes(points);
      rejected += result.rejected;
      if (result.points.length === points.length) break;
      points = result.points;
      if (points.length < 3) break;
    }
    return { points: dampenCrossTrack(points), rejected };
  }

  function findStopWander(pts) {
    let best = null;
    for (let i = 0; i < pts.length - 10; i += 1) {
      let path = 0;
      for (let j = i + 1; j < pts.length; j += 1) {
        const dt = (pts[j].t - pts[i].t) / 1000;
        if (dt > DWELL_LOOKAHEAD_S) break;
        path += hav(pts[j - 1], pts[j]);
        const net = hav(pts[i], pts[j]);
        const avg = path / Math.max(dt, 0.1);
        if (
          dt >= DWELL_MIN_DURATION_S &&
          path >= DWELL_MIN_PATH_M &&
          net <= DWELL_MAX_NET_M &&
          path >= net * DWELL_MIN_PATH_OVER_NET &&
          avg <= DWELL_MAX_AVG_SPEED_MPS &&
          (!best || path / Math.max(net, 1) > best.score)
        ) {
          best = {
            score: path / Math.max(net, 1),
            i,
            j,
            path,
            net,
            dt,
            center: pts[Math.floor((i + j) / 2)],
          };
        }
      }
    }
    return best;
  }

  function drawSpeedTrack(pts, group, { weight = 5, opacity = 0.95 } = {}) {
    group.clearLayers();
    const speeds = displaySpeeds(pts);
    for (let i = 0; i < speeds.length; i += 1) {
      L.polyline(
        [
          [pts[i].lat, pts[i].lon],
          [pts[i + 1].lat, pts[i + 1].lon],
        ],
        {
          color: speedColor(speeds[i]),
          weight,
          opacity,
          lineCap: "round",
          lineJoin: "round",
        },
      ).addTo(group);
    }
    return speeds;
  }

  function fmtM(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
  }

  function fmtDur(ms) {
    const min = Math.round(ms / 60000);
    return `${min} мин`;
  }

  function pct(sorted, q) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  }

  async function loadGpx(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return parseGpx(await res.text());
  }

  function syncLayers() {
    const rawOn = document.getElementById("toggle-raw").checked;
    const smoothOn = document.getElementById("toggle-smooth").checked;
    const stopOn = document.getElementById("toggle-stop").checked;
    if (rawOn) map.addLayer(layers.raw);
    else map.removeLayer(layers.raw);
    if (smoothOn) map.addLayer(layers.smooth);
    else map.removeLayer(layers.smooth);
    if (stopOn) map.addLayer(layers.stop);
    else map.removeLayer(layers.stop);
  }

  async function main() {
    try {
      const raw = await loadGpx(RAW_URL);
      if (raw.length < 2) throw new Error("Трек слишком короткий");

      const { points: smoothed, rejected } = smoothTrack(raw);
      const speeds = drawSpeedTrack(raw, layers.raw, { weight: 5 });
      drawSpeedTrack(smoothed, layers.smooth, { weight: 3.5, opacity: 0.85 });

      const stop = findStopWander(raw);
      layers.stop.clearLayers();
      if (stop) {
        L.circle([stop.center.lat, stop.center.lon], {
          radius: Math.max(40, stop.path * 0.35),
          color: "#0f172a",
          weight: 2,
          dashArray: "4 6",
          fillColor: "#22c55e",
          fillOpacity: 0.12,
        }).addTo(layers.stop);
        L.circleMarker([stop.center.lat, stop.center.lon], {
          radius: 7,
          color: "#0f172a",
          weight: 2,
          fillColor: "#eab308",
          fillOpacity: 0.95,
        })
          .bindPopup(
            `Стоянка / GPS-шум<br>${fmtM(stop.path)} пути при смещении ${fmtM(stop.net)} за ${Math.round(stop.dt)} с`,
          )
          .addTo(layers.stop);
      }

      const bounds = L.latLngBounds(raw.map((p) => [p.lat, p.lon]));
      map.fitBounds(bounds.pad(0.1));

      const sorted = [...speeds].sort((a, b) => a - b);
      document.getElementById("stat-pts").textContent = String(raw.length);
      document.getElementById("stat-len").textContent = fmtM(pathLength(raw));
      document.getElementById("stat-dur").textContent = fmtDur(
        raw[raw.length - 1].t - raw[0].t,
      );
      document.getElementById("stat-vmax").textContent =
        `${Math.max(...speeds).toFixed(0)} км/ч`;
      document.getElementById("stat-v50").textContent =
        `${pct(sorted, 0.5).toFixed(0)} км/ч`;
      document.getElementById("stat-stop").textContent = stop
        ? `${fmtM(stop.path)} / ${fmtM(stop.net)}`
        : "—";

      statusEl.textContent = stop
        ? `Остановка ~${new Date(raw[stop.i].t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}: GPS нарисовал ${fmtM(stop.path)} при смещении ${fmtM(stop.net)}. Export smoother схлопывает стоянку (спайков: ${rejected}).`
        : `Готово. Спайков out-and-back: ${rejected}.`;

      ["toggle-raw", "toggle-smooth", "toggle-stop"].forEach((id) => {
        document.getElementById(id).addEventListener("change", syncLayers);
      });
      syncLayers();
    } catch (err) {
      statusEl.textContent = `Ошибка: ${err.message || err}`;
      console.error(err);
    }
  }

  main();
})();
