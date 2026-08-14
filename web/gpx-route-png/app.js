(() => {
  'use strict';

  // ---------- Constants ----------
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const MIN_DIST_M = 10; // Douglas-Peucker simplification tolerance, meters
  const SAFE_MARGIN = 140; // safe margin in canvas px around the route
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'ru';
  const COPY = {
    ru: {
      parseXmlError: 'Не удалось разобрать GPX: файл повреждён или не является валидным XML.',
      notGpxRoot: 'Это не похоже на GPX-файл: отсутствует корневой элемент <gpx>.',
      notEnoughPoints: 'В GPX-файле не найдено достаточно координат (нужно минимум две точки).',
      distanceUnit: 'км',
      defaultStart: 'Старт',
      defaultFinish: 'Финиш',
      waypointTextPlaceholder: 'Текст',
      waypointTextAria: 'Текст подписи',
      waypointDistancePlaceholder: 'км',
      waypointDistanceAria: 'Расстояние от старта в километрах',
      offsetXAria: 'Смещение подписи по горизонтали в пикселях',
      offsetYAria: 'Смещение подписи по вертикали в пикселях',
      removeWaypointAria: 'Удалить подпись на треке',
      fileTypeError: 'Похоже, это не GPX-файл. Загрузите файл с расширением .gpx.',
      emptyFileError: 'Файл пустой. Загрузите GPX с хотя бы двумя точками.',
      largeFileError: 'Файл слишком большой (больше 50 МБ). Уменьшите размер GPX.',
      whitespaceFileError: 'Файл пустой или содержит только пробелы.',
      genericFileError: 'Не удалось обработать файл. Попробуйте другой GPX.',
      loadingSample: 'Загружаю sample.gpx…',
      sampleLoadError: 'Не удалось загрузить пример sample.gpx.',
      sampleUiError: 'Не удалось загрузить пример sample.gpx. Попробуйте обновить страницу.',
      sampleMiddle1: 'ТЦ Галерея',
      sampleMiddle2: 'Пивски\nзабавник',
      animEmpty: 'Загрузите GPX в шаге 1 — здесь можно посмотреть анимацию прохождения трека.',
      playAnim: 'Воспроизвести',
      playingAnim: 'Воспроизведение…',
      downloadAnimWebm: 'Скачать WebM (альфа)',
      downloadAnimPngZip: 'Скачать кадры PNG (ZIP)',
      exportingWebm: 'Запись WebM…',
      exportingPngFrame: (current, total) => `Кадры: ${current}/${total}…`,
      exportFailed: 'Не удалось экспортировать анимацию. Попробуйте ещё раз.',
      webmUnsupported: 'WebM не поддерживается в этом браузере. Скачайте PNG (ZIP).',
      chooseSourceVideo: 'Выбрать видео',
      sourceVideoEmpty: 'Видео ещё не выбрано.',
      sourceVideoReady: 'Видео готово',
      sourceVideoFromFiles: 'Загружаю видео из /files…',
      sourceVideoNotFound: 'Видео не найдено в /files.',
      sourceVideoUnavailable: 'Это видео можно открыть только с исходной страницы.',
      sourceVideoLoadFailed: 'Не удалось загрузить видео из /files.',
      finalVideoNeedsTrackAndVideo: 'Сначала загрузите GPX и выберите видео.',
      playFinalPreview: 'Превью',
      playingFinalPreview: 'Превью…',
      renderFinalVideo: 'Собрать финальное WebM',
      renderingFinalVideo: 'Собираю финальное WebM…',
      finalVideoReady: 'Готовое видео собрано.',
      downloadFinalVideo: 'Скачать',
      finalVideoUnsupported: 'WebM-запись не поддерживается в этом браузере.',
      finalVideoExportFailed: 'Не удалось собрать финальное видео.',
      sourceVideoDescription: 'Исходное видео, выбранное на странице GPX-трека.',
      finalVideoDescription: 'Финальное WebM-видео с наложенной анимацией трека.',
      ffmpegReadme: (fps) =>
        [
          'PNG-последовательность трека 1080×1920, прозрачный фон.',
          `Кадровая частота: ${fps} fps (имя файлов frame_0001.png …).`,
          '',
          'Пример наложения на видео через ffmpeg:',
          `ffmpeg -i video.mp4 -framerate ${fps} -i frame_%04d.png -filter_complex "overlay=0:0" -c:a copy output.mp4`,
          '',
          'WebM с альфой (если скачали отдельно):',
          'ffmpeg -i video.mp4 -i track-anim.webm -filter_complex "[1:v]format=yuva420p[ov];[0:v][ov]overlay=0:0" -c:a copy output.mp4',
        ].join('\n'),
      trackColorLabel: 'Цвет трека',
      trackColorAria: 'Цвет линии трека, точек и подписей',
      trackColorLabels: {
        lemon: 'Лимон',
        sunflower: 'Подсолнух',
        saffron: 'Шафран',
        honey: 'Мёд',
        tangerine: 'Мандарин',
        terracotta: 'Терракота',
        rust: 'Ржавчина',
      },
      resetSettings: 'Сбросить настройки',
      locale: 'ru-RU',
    },
    en: {
      parseXmlError: 'Could not parse GPX: the file is damaged or is not valid XML.',
      notGpxRoot: 'This does not look like a GPX file: the root <gpx> element is missing.',
      notEnoughPoints: 'The GPX file does not contain enough coordinates; at least two points are required.',
      distanceUnit: 'km',
      defaultStart: 'Start',
      defaultFinish: 'Finish',
      waypointTextPlaceholder: 'Text',
      waypointTextAria: 'Label text',
      waypointDistancePlaceholder: 'km',
      waypointDistanceAria: 'Distance from start in kilometers',
      offsetXAria: 'Horizontal label offset in pixels',
      offsetYAria: 'Vertical label offset in pixels',
      removeWaypointAria: 'Remove track label',
      fileTypeError: 'This does not look like a GPX file. Upload a file with the .gpx extension.',
      emptyFileError: 'The file is empty. Upload a GPX with at least two points.',
      largeFileError: 'The file is too large (over 50 MB). Reduce the GPX size.',
      whitespaceFileError: 'The file is empty or contains only whitespace.',
      genericFileError: 'Could not process the file. Try another GPX.',
      loadingSample: 'Loading sample.gpx...',
      sampleLoadError: 'Could not load sample.gpx.',
      sampleUiError: 'Could not load sample.gpx. Try refreshing the page.',
      sampleMiddle1: 'Galerija Mall',
      sampleMiddle2: 'Pivski\nzabavnik',
      animEmpty: 'Upload a GPX in step 1 to preview the track traversal animation here.',
      playAnim: 'Play',
      playingAnim: 'Playing…',
      downloadAnimWebm: 'Download WebM (alpha)',
      downloadAnimPngZip: 'Download PNG frames (ZIP)',
      exportingWebm: 'Recording WebM…',
      exportingPngFrame: (current, total) => `Frames: ${current}/${total}…`,
      exportFailed: 'Could not export the animation. Try again.',
      webmUnsupported: 'WebM is not supported in this browser. Download PNG (ZIP) instead.',
      chooseSourceVideo: 'Choose video',
      sourceVideoEmpty: 'No video selected yet.',
      sourceVideoReady: 'Video ready',
      sourceVideoFromFiles: 'Loading video from /files...',
      sourceVideoNotFound: 'Video was not found in /files.',
      sourceVideoUnavailable: 'This video can only be opened from its original page.',
      sourceVideoLoadFailed: 'Could not load video from /files.',
      finalVideoNeedsTrackAndVideo: 'Upload a GPX and choose a video first.',
      playFinalPreview: 'Preview',
      playingFinalPreview: 'Previewing...',
      renderFinalVideo: 'Render final WebM',
      renderingFinalVideo: 'Rendering final WebM...',
      finalVideoReady: 'Final video is ready.',
      downloadFinalVideo: 'Download',
      finalVideoUnsupported: 'WebM recording is not supported in this browser.',
      finalVideoExportFailed: 'Could not render the final video.',
      sourceVideoDescription: 'Source video selected on the GPX route page.',
      finalVideoDescription: 'Final WebM video with the track animation overlay.',
      ffmpegReadme: (fps) =>
        [
          'Track PNG sequence 1080×1920, transparent background.',
          `Frame rate: ${fps} fps (files frame_0001.png …).`,
          '',
          'Example ffmpeg overlay on video:',
          `ffmpeg -i video.mp4 -framerate ${fps} -i frame_%04d.png -filter_complex "overlay=0:0" -c:a copy output.mp4`,
          '',
          'WebM with alpha (if downloaded separately):',
          'ffmpeg -i video.mp4 -i track-anim.webm -filter_complex "[1:v]format=yuva420p[ov];[0:v][ov]overlay=0:0" -c:a copy output.mp4',
        ].join('\n'),
      trackColorLabel: 'Track color',
      trackColorAria: 'Color of the route line, points, and labels',
      trackColorLabels: {
        lemon: 'Lemon',
        sunflower: 'Sunflower',
        saffron: 'Saffron',
        honey: 'Honey',
        tangerine: 'Tangerine',
        terracotta: 'Terracotta',
        rust: 'Rust',
      },
      resetSettings: 'Reset settings to defaults',
      locale: 'en-US',
    },
  };
  const copy = COPY[LANG];

  // ---------- DOM ----------
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const sampleBtn = document.getElementById('sampleBtn');
  const sampleLine = sampleBtn?.closest('.sample-line');
  const errorBox = document.getElementById('errorBox');
  const results = document.getElementById('results');
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');
  const titleInput = document.getElementById('titleInput');
  const waypointList = document.getElementById('waypointList');
  const addWaypointBtn = document.getElementById('addWaypointBtn');
  const labelFontSelect = document.getElementById('labelFontSelect');
  const labelSizeInput = document.getElementById('labelSizeInput');
  const labelSizeOutput = document.getElementById('labelSizeOutput');
  const lineWidthInput = document.getElementById('lineWidthInput');
  const lineWidthOutput = document.getElementById('lineWidthOutput');
  const pointScaleInput = document.getElementById('pointScaleInput');
  const pointScaleOutput = document.getElementById('pointScaleOutput');
  const minDistanceInput = document.getElementById('minDistanceInput');
  const minDistanceOutput = document.getElementById('minDistanceOutput');
  const trackColorInput = document.getElementById('trackColorInput');
  const downloadTransparentPngBtn = document.getElementById('downloadTransparentPngBtn');
  const step2AnimCanvas = document.getElementById('step2AnimCanvas');
  const step2AnimPlaceholder = document.getElementById('step2AnimPlaceholder');
  const step2AnimBg = document.querySelector('.step2-anim-preview-shell .step2-preview-shell__bg');
  const step3TrackPreviewCanvas = document.getElementById('step3TrackPreviewCanvas');
  const step3TrackPlaceholder = document.getElementById('step3TrackPlaceholder');
  const animDurationInput = document.getElementById('animDurationInput');
  const animDurationOutput = document.getElementById('animDurationOutput');
  const animFpsSelect = document.getElementById('animFpsSelect');
  const playAnimBtn = document.getElementById('playAnimBtn');
  const downloadAnimWebmBtn = document.getElementById('downloadAnimWebmBtn');
  const downloadAnimPngZipBtn = document.getElementById('downloadAnimPngZipBtn');
  const sourceVideoInput = document.getElementById('sourceVideoInput');
  const browseSourceVideoBtn = document.getElementById('browseSourceVideoBtn');
  const sourceVideoPreview = document.getElementById('sourceVideoPreview');
  const sourceVideoPlaceholder = document.getElementById('sourceVideoPlaceholder');
  const sourceVideoMeta = document.getElementById('sourceVideoMeta');
  const sourceVideoStatus = document.getElementById('sourceVideoStatus');
  const finalVideoOverlayCanvas = document.getElementById('finalVideoOverlayCanvas');
  const playFinalPreviewBtn = document.getElementById('playFinalPreviewBtn');
  const renderFinalVideoBtn = document.getElementById('renderFinalVideoBtn');
  const finalVideoResult = document.getElementById('finalVideoResult');
  const finalVideoLink = document.getElementById('finalVideoLink');
  const finalVideoDownloadLink = document.getElementById('finalVideoDownloadLink');
  const finalVideoStatus = document.getElementById('finalVideoStatus');
  const finalOverlayScaleInput = document.getElementById('finalOverlayScaleInput');
  const finalOverlayScaleOutput = document.getElementById('finalOverlayScaleOutput');
  const finalOverlayOffsetXInput = document.getElementById('finalOverlayOffsetXInput');
  const finalOverlayOffsetYInput = document.getElementById('finalOverlayOffsetYInput');
  const finalAnimationStartInput = document.getElementById('finalAnimationStartInput');

  const statSource = document.getElementById('statSource');
  const statOriginal = document.getElementById('statOriginal');
  const statThinned = document.getElementById('statThinned');
  const statDistance = document.getElementById('statDistance');
  const statBbox = document.getElementById('statBbox');

  let currentState = null; // { points, thinned, distance, source, bbox, fileName }
  let fileIngestGeneration = 0;
  let currentTrackColor = '#e07a3c';
  let waypointCounter = 0;
  const DEFAULT_ROUTE_LINE_WIDTH = 14;
  const ROUTE_ANIM_UNREVEALED = '#FFFFFF';
  const ANIM_EXPORT_FPS_OPTIONS = [24, 25, 30, 60];
  let routePathCache = null;
  let routeAnimRafId = null;
  let routeAnimPlaying = false;
  let animExportInProgress = false;
  let sourceVideoFile = null;
  let selectedSourceVideoFileId = '';
  let sourceVideoObjectUrl = '';
  let step2VideoFrameDataUrl = '';
  let finalVideoObjectUrl = '';
  let finalPreviewRafId = null;
  let finalPreviewPlaying = false;
  let finalVideoExportInProgress = false;

  const LABEL_FONTS = {
    satoshi: '"Satoshi", sans-serif',
    montserrat: '"Montserrat", sans-serif',
    jetbrains: '"JetBrains Mono", monospace',
    georgia: 'Georgia, serif',
  };

  // ---------- Utility: Haversine distance (meters) ----------
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---------- GPX Parsing ----------
  function parseGPX(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error(copy.parseXmlError);
    }

    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'gpx') {
      throw new Error(copy.notGpxRoot);
    }

    const extractPoints = (selector) => {
      const nodes = doc.getElementsByTagName(selector);
      const pts = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const lat = parseFloat(n.getAttribute('lat'));
        const lon = parseFloat(n.getAttribute('lon'));
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          pts.push({ lat, lon });
        }
      }
      return pts;
    };

    let source = 'trkpt';
    let points = extractPoints('trkpt');
    if (points.length < 2) {
      const rte = extractPoints('rtept');
      if (rte.length >= 2) { points = rte; source = 'rtept'; }
      else {
        const wpt = extractPoints('wpt');
        if (wpt.length >= 2) { points = wpt; source = 'wpt'; }
      }
    }

    if (points.length < 2) {
      throw new Error(copy.notEnoughPoints);
    }
    return { points, source };
  }

  // ---------- Smoothing: moving average + Douglas-Peucker (same as /places) ----------
  // Moving average flattens GPS jitter; endpoints stay fixed.
  function smoothTrack(points, windowSize = 5) {
    if (points.length <= windowSize) return points.slice();
    const half = Math.floor(windowSize / 2);
    return points.map((point, index) => {
      if (index < half || index >= points.length - half) return point;
      let lat = 0;
      let lon = 0;
      for (let i = index - half; i <= index + half; i++) {
        lat += points[i].lat;
        lon += points[i].lon;
      }
      return { lat: lat / windowSize, lon: lon / windowSize };
    });
  }

  function pointToSegmentDeg(p, a, b) {
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    if (dx === 0 && dy === 0) {
      return Math.hypot(p.lon - a.lon, p.lat - a.lat);
    }
    let t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.lon - (a.lon + t * dx), p.lat - (a.lat + t * dy));
  }

  // Douglas-Peucker keeps the route shape while dropping redundant points.
  function simplifyTrack(points, toleranceMeters) {
    if (points.length <= 2) return points.slice();
    const tolerance = toleranceMeters / 111320; // meters -> degrees (approx)

    const keep = new Array(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];

    while (stack.length) {
      const [start, end] = stack.pop();
      let maxDistance = 0;
      let maxIndex = start;
      for (let i = start + 1; i < end; i++) {
        const distance = pointToSegmentDeg(points[i], points[start], points[end]);
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }
      if (maxDistance > tolerance) {
        keep[maxIndex] = true;
        stack.push([start, maxIndex], [maxIndex, end]);
      }
    }

    return points.filter((_, index) => keep[index]);
  }

  function thinPoints(points, toleranceMeters) {
    return simplifyTrack(smoothTrack(points), toleranceMeters);
  }

  function totalDistanceMeters(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    return total;
  }

  function pointAtDistance(points, targetMeters) {
    if (!points.length) return null;
    if (targetMeters <= 0) return points[0];
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const next = points[i];
      const segment = haversine(prev.lat, prev.lon, next.lat, next.lon);
      if (walked + segment >= targetMeters) {
        const t = segment > 0 ? (targetMeters - walked) / segment : 0;
        return {
          lat: prev.lat + (next.lat - prev.lat) * t,
          lon: prev.lon + (next.lon - prev.lon) * t,
        };
      }
      walked += segment;
    }
    return points[points.length - 1];
  }

  function parseDistanceKm(value) {
    const normalized = String(value || '').trim().replace(',', '.');
    if (!normalized) return NaN;
    const km = Number.parseFloat(normalized);
    return Number.isFinite(km) ? km : NaN;
  }

  function getPosterControls() {
    const labels = [...waypointList.querySelectorAll('.waypoint-row')]
      .map((row) => {
        const name = row.querySelector('.waypoint-name').value.trim();
        const km = parseDistanceKm(row.querySelector('.waypoint-distance').value);
        const offsetX = Number.parseFloat(String(row.querySelector('.waypoint-offset-x').value || '0').replace(',', '.')) || 0;
        const offsetY = Number.parseFloat(String(row.querySelector('.waypoint-offset-y').value || '0').replace(',', '.')) || 0;
        return { name, km, offsetX, offsetY };
      })
      .filter((w) => w.name && Number.isFinite(w.km) && w.km >= 0)
      .sort((a, b) => a.km - b.km);

    const labelFontKey = Object.prototype.hasOwnProperty.call(LABEL_FONTS, labelFontSelect.value)
      ? labelFontSelect.value
      : 'montserrat';
    const labelSize = Math.max(28, Math.min(72, Number.parseInt(labelSizeInput.value, 10) || 48));
    const lineWidth = Math.max(3, Math.min(24, Number.parseInt(lineWidthInput.value, 10) || DEFAULT_ROUTE_LINE_WIDTH));
    const pointScale = Math.max(2, Math.min(10, Number.parseFloat(pointScaleInput.value) || 3));
    const minDistanceMeters = Math.max(5, Math.min(100, Number.parseInt(minDistanceInput.value, 10) || MIN_DIST_M));

    return {
      labels,
      labelFontKey,
      labelFontFamily: LABEL_FONTS[labelFontKey],
      labelSize,
      lineWidth,
      pointScale,
      minDistanceMeters,
    };
  }

  function updateThinning() {
    if (!currentState || !currentState.points) return;
    const controls = getPosterControls();
    currentState.thinned = thinPoints(currentState.points, controls.minDistanceMeters);
    invalidateRoutePathCache();
    updateStatsPanel(currentState);
    render();
  }

  // ---------- Projection: equirectangular at track centroid, fit to canvas ----------
  function projectAndFit(points, width, height, margin) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const centerLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((centerLat * Math.PI) / 180);

    // Project to local meters-ish plane
    const projected = points.map((p) => ({
      x: (p.lon - minLon) * cosLat,
      y: -(p.lat - minLat), // flip y
    }));

    let pminX = Infinity, pmaxX = -Infinity, pminY = Infinity, pmaxY = -Infinity;
    for (const p of projected) {
      if (p.x < pminX) pminX = p.x;
      if (p.x > pmaxX) pmaxX = p.x;
      if (p.y < pminY) pminY = p.y;
      if (p.y > pmaxY) pmaxY = p.y;
    }
    const pw = Math.max(pmaxX - pminX, 1e-9);
    const ph = Math.max(pmaxY - pminY, 1e-9);

    const availW = width - margin * 2;
    const availH = height - margin * 2;
    const scale = Math.min(availW / pw, availH / ph);

    const drawW = pw * scale;
    const drawH = ph * scale;
    const offX = (width - drawW) / 2 - pminX * scale;
    const offY = (height - drawH) / 2 - pminY * scale;

    const fitted = projected.map((p) => ({
      x: p.x * scale + offX,
      y: p.y * scale + offY,
    }));

    return {
      points: fitted,
      bbox: { minLat, maxLat, minLon, maxLon, widthKm: 0, heightKm: 0 },
    };
  }

  // ---------- Catmull-Rom to Bezier draw ----------
  function cubicBezierPoint(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    const uuu = uu * u;
    const ttt = tt * t;
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
    };
  }

  function sampleCatmullRomPath(points, tension = 0.5, stepsPerSegment = 16) {
    if (points.length < 2) {
      const only = points[0] || { x: 0, y: 0 };
      return { samples: [{ x: only.x, y: only.y, dist: 0 }], totalLength: 0 };
    }

    const samples = [];
    let totalLength = 0;

    const pushPoint = (x, y) => {
      if (samples.length > 0) {
        const prev = samples[samples.length - 1];
        totalLength += Math.hypot(x - prev.x, y - prev.y);
      }
      samples.push({ x, y, dist: totalLength });
    };

    pushPoint(points[0].x, points[0].y);

    if (points.length === 2) {
      pushPoint(points[1].x, points[1].y);
      return { samples, totalLength };
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;

      const b0 = p1;
      const b1 = { x: cp1x, y: cp1y };
      const b2 = { x: cp2x, y: cp2y };
      const b3 = p2;

      for (let step = 1; step <= stepsPerSegment; step++) {
        const t = step / stepsPerSegment;
        const pt = cubicBezierPoint(t, b0, b1, b2, b3);
        pushPoint(pt.x, pt.y);
      }
    }

    return { samples, totalLength };
  }

  function arcLengthAtPoint(samples, x, y) {
    let bestDist = 0;
    let bestGap = Infinity;
    for (const sample of samples) {
      const gap = (sample.x - x) ** 2 + (sample.y - y) ** 2;
      if (gap < bestGap) {
        bestGap = gap;
        bestDist = sample.dist;
      }
    }
    return bestDist;
  }

  function strokeSampledPath(ctx, samples) {
    if (samples.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(samples[i].x, samples[i].y);
    }
    ctx.stroke();
  }

  function strokeSampledPathToLength(ctx, samples, maxLength) {
    if (samples.length < 2 || maxLength <= 0) return;

    ctx.beginPath();
    ctx.moveTo(samples[0].x, samples[0].y);

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      if (curr.dist <= maxLength) {
        ctx.lineTo(curr.x, curr.y);
        continue;
      }
      if (prev.dist < maxLength) {
        const segLen = curr.dist - prev.dist || 1;
        const t = (maxLength - prev.dist) / segLen;
        ctx.lineTo(prev.x + (curr.x - prev.x) * t, prev.y + (curr.y - prev.y) * t);
      }
      break;
    }

    ctx.stroke();
  }

  function invalidateRoutePathCache() {
    routePathCache = null;
  }

  function getRoutePathCache(pts, labelMarkers) {
    const cacheKey =
      pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';') +
      '|' +
      labelMarkers.map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)}`).join(';');
    if (routePathCache && routePathCache.cacheKey === cacheKey) return routePathCache;

    const sampled = sampleCatmullRomPath(pts, 0.5);
    routePathCache = {
      cacheKey,
      samples: sampled.samples,
      totalLength: sampled.totalLength,
      markerDistances: labelMarkers.map((marker) =>
        arcLengthAtPoint(sampled.samples, marker.x, marker.y),
      ),
    };
    return routePathCache;
  }

  function drawCatmullRom(ctx, points, tension = 0.5) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.stroke();
  }

  // ---------- Poster (fixed) + track color ----------
  const POSTER_THEME = {
    bg1: '#F1EADA',
    bg2: '#E2D6B5',
    paperGrain: 'rgba(120,100,60,0.06)',
    contour: 'rgba(78,107,74,0.10)',
    ink: '#1A2A24',
    inkMuted: '#6B776F',
  };

  const LEGACY_TRACK_COLORS = {
    lemon: '#ffe566',
    sunflower: '#f7c948',
    saffron: '#f0b429',
    honey: '#e8a838',
    tangerine: '#e8943a',
    terracotta: '#e07a3c',
    rust: '#c95a2b',
  };

  function sourceFileIdFromQuery() {
    return new URLSearchParams(window.location.search).get('sourceFile');
  }

  function videoFileIdFromPath() {
    const pathname = window.location.pathname.replace(/\/+$/, '');
    const pattern = LANG === 'en'
      ? /^\/gpx-route-png\/en\/(.+)$/
      : /^\/gpx-route-png\/(?!en(?:\/|$))(.+)$/;
    const match = pathname.match(pattern);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch (_e) {
      return match[1];
    }
  }

  function videoPagePath(fileId) {
    const encoded = /^[a-f0-9]{24}$/.test(fileId) ? fileId : encodeURIComponent(fileId);
    return LANG === 'en'
      ? `/gpx-route-png/en/${encoded}`
      : `/gpx-route-png/${encoded}`;
  }

  const PAGE_SOURCE_VIDEO_FILE_ID = videoFileIdFromPath() || sourceFileIdFromQuery() || '';
  const IS_VIDEO_CONTEXT = Boolean(PAGE_SOURCE_VIDEO_FILE_ID);
  const SETTINGS_STORAGE_KEY = IS_VIDEO_CONTEXT
    ? `gpx-route-png/video/${PAGE_SOURCE_VIDEO_FILE_ID}/v1`
    : '';
  const SECTION_PREFS_STORAGE_KEY = IS_VIDEO_CONTEXT
    ? `gpx-route-png/video/${PAGE_SOURCE_VIDEO_FILE_ID}/sections/v1`
    : 'gpx-route-png/sections/v1';
  const DEFAULT_SECTION_OPEN = {
    track: true,
    animation: true,
    video: true,
  };
  const DEFAULT_SETTINGS = {
    v: 1,
    title: '',
    labelFont: 'montserrat',
    labelSize: 48,
    lineWidth: 14,
    pointScale: 3,
    minDistance: MIN_DIST_M,
    trackColor: '#e07a3c',
    animDuration: 5,
    animFps: 30,
    finalOverlayScale: 100,
    finalOverlayOffsetX: 0,
    finalOverlayOffsetY: 0,
    finalAnimationStart: 0,
    sourceVideoFileId: '',
    waypoints: [],
  };

  let saveSettingsTimer = null;
  let settingsPersistSuspended = false;

  function clampSettingNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function clampFinalAnimationStart(value) {
    return Math.round(clampSettingNumber(value, 0, 600, DEFAULT_SETTINGS.finalAnimationStart) * 10) / 10;
  }

  function normalizeTrackColor(value) {
    if (typeof value !== 'string') return DEFAULT_SETTINGS.trackColor;
    const color = value.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LEGACY_TRACK_COLORS, color)) {
      return LEGACY_TRACK_COLORS[color];
    }
    const customColor = window.VlandivirColorPicker?.normalizeColor?.(color, '');
    return customColor || DEFAULT_SETTINGS.trackColor;
  }

  function collectWaypointsForStorage() {
    return [...waypointList.querySelectorAll('.waypoint-row')].map((row) => ({
      name: row.querySelector('.waypoint-name').value,
      distanceKm: row.querySelector('.waypoint-distance').value,
      offsetX: row.querySelector('.waypoint-offset-x').value,
      offsetY: row.querySelector('.waypoint-offset-y').value,
    }));
  }

  function collectSettings() {
    const fps = Number.parseInt(animFpsSelect?.value || String(DEFAULT_SETTINGS.animFps), 10);
    return {
      v: 1,
      title: titleInput.value,
      labelFont: labelFontSelect.value,
      labelSize: Number.parseInt(labelSizeInput.value, 10) || DEFAULT_SETTINGS.labelSize,
      lineWidth: Number.parseInt(lineWidthInput.value, 10) || DEFAULT_SETTINGS.lineWidth,
      pointScale: Number.parseFloat(pointScaleInput.value) || DEFAULT_SETTINGS.pointScale,
      minDistance: Number.parseInt(minDistanceInput.value, 10) || DEFAULT_SETTINGS.minDistance,
      trackColor: currentTrackColor,
      animDuration: Number.parseFloat(animDurationInput?.value || String(DEFAULT_SETTINGS.animDuration)) || DEFAULT_SETTINGS.animDuration,
      animFps: ANIM_EXPORT_FPS_OPTIONS.includes(fps) ? fps : DEFAULT_SETTINGS.animFps,
      finalOverlayScale: Number.parseInt(finalOverlayScaleInput?.value || String(DEFAULT_SETTINGS.finalOverlayScale), 10) || DEFAULT_SETTINGS.finalOverlayScale,
      finalOverlayOffsetX: Number.parseInt(finalOverlayOffsetXInput?.value || String(DEFAULT_SETTINGS.finalOverlayOffsetX), 10) || DEFAULT_SETTINGS.finalOverlayOffsetX,
      finalOverlayOffsetY: Number.parseInt(finalOverlayOffsetYInput?.value || String(DEFAULT_SETTINGS.finalOverlayOffsetY), 10) || DEFAULT_SETTINGS.finalOverlayOffsetY,
      finalAnimationStart: clampFinalAnimationStart(finalAnimationStartInput?.value),
      sourceVideoFileId: selectedSourceVideoFileId || PAGE_SOURCE_VIDEO_FILE_ID,
      waypoints: collectWaypointsForStorage(),
    };
  }

  function normalizeStoredSettings(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const labelFont = Object.prototype.hasOwnProperty.call(LABEL_FONTS, raw.labelFont)
      ? raw.labelFont
      : DEFAULT_SETTINGS.labelFont;
    const trackColor = normalizeTrackColor(raw.trackColor);
    const animFps = Number.parseInt(raw.animFps, 10);
    const waypoints = Array.isArray(raw.waypoints)
      ? raw.waypoints.map((entry) => ({
          name: String(entry?.name ?? ''),
          distanceKm: String(entry?.distanceKm ?? ''),
          offsetX: String(entry?.offsetX ?? '0'),
          offsetY: String(entry?.offsetY ?? '0'),
        }))
      : [];
    return {
      v: 1,
      title: String(raw.title ?? ''),
      labelFont,
      labelSize: clampSettingNumber(raw.labelSize, 28, 72, DEFAULT_SETTINGS.labelSize),
      lineWidth: clampSettingNumber(raw.lineWidth, 3, 24, DEFAULT_SETTINGS.lineWidth),
      pointScale: clampSettingNumber(raw.pointScale, 2, 10, DEFAULT_SETTINGS.pointScale),
      minDistance: clampSettingNumber(raw.minDistance, 5, 100, DEFAULT_SETTINGS.minDistance),
      trackColor,
      animDuration: clampSettingNumber(raw.animDuration, 1, 30, DEFAULT_SETTINGS.animDuration),
      animFps: ANIM_EXPORT_FPS_OPTIONS.includes(animFps) ? animFps : DEFAULT_SETTINGS.animFps,
      finalOverlayScale: clampSettingNumber(raw.finalOverlayScale, 20, 180, DEFAULT_SETTINGS.finalOverlayScale),
      finalOverlayOffsetX: clampSettingNumber(raw.finalOverlayOffsetX, -1080, 1080, DEFAULT_SETTINGS.finalOverlayOffsetX),
      finalOverlayOffsetY: clampSettingNumber(raw.finalOverlayOffsetY, -1920, 1920, DEFAULT_SETTINGS.finalOverlayOffsetY),
      finalAnimationStart: clampFinalAnimationStart(raw.finalAnimationStart),
      sourceVideoFileId: typeof raw.sourceVideoFileId === 'string' ? raw.sourceVideoFileId : '',
      waypoints,
    };
  }

  function persistSettings() {
    if (settingsPersistSuspended || !IS_VIDEO_CONTEXT) return;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(collectSettings()));
    } catch (_e) {
      /* private mode or quota */
    }
  }

  function schedulePersistSettings() {
    if (settingsPersistSuspended || !IS_VIDEO_CONTEXT) return;
    if (saveSettingsTimer) clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(() => {
      saveSettingsTimer = null;
      persistSettings();
    }, 250);
  }

  function loadStoredSettings() {
    if (!IS_VIDEO_CONTEXT) return null;
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return null;
      return normalizeStoredSettings(JSON.parse(raw));
    } catch (_e) {
      return null;
    }
  }

  function clearStoredSettings() {
    if (!IS_VIDEO_CONTEXT) return;
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  function sanitizeSectionPrefs(raw) {
    const result = { ...DEFAULT_SECTION_OPEN };
    if (!raw || typeof raw !== 'object') return result;
    for (const key of Object.keys(DEFAULT_SECTION_OPEN)) {
      if (typeof raw[key] === 'boolean') result[key] = raw[key];
    }
    return result;
  }

  function readSectionPrefs() {
    try {
      const raw = localStorage.getItem(SECTION_PREFS_STORAGE_KEY);
      return raw ? sanitizeSectionPrefs(JSON.parse(raw)) : { ...DEFAULT_SECTION_OPEN };
    } catch (_e) {
      return { ...DEFAULT_SECTION_OPEN };
    }
  }

  function writeSectionPrefs(prefs) {
    try {
      localStorage.setItem(SECTION_PREFS_STORAGE_KEY, JSON.stringify(sanitizeSectionPrefs(prefs)));
    } catch (_e) {
      /* private mode or quota */
    }
  }

  function initWorkflowSections() {
    const sections = [...document.querySelectorAll('.workflow-step[data-gpx-section]')];
    if (sections.length === 0) return;

    let prefs = readSectionPrefs();
    sections.forEach((section) => {
      const key = section.dataset.gpxSection;
      if (key in prefs) section.open = prefs[key];
    });

    sections.forEach((section) => {
      section.addEventListener('toggle', () => {
        const key = section.dataset.gpxSection;
        if (!key) return;
        prefs = {
          ...prefs,
          [key]: section.open,
        };
        writeSectionPrefs(prefs);
      });
    });
  }

  function applySettings(settings, { skipRender = false } = {}) {
    const normalized = normalizeStoredSettings(settings) || { ...DEFAULT_SETTINGS, waypoints: [] };
    settingsPersistSuspended = true;
    titleInput.value = normalized.title;
    labelFontSelect.value = normalized.labelFont;
    labelSizeInput.value = String(normalized.labelSize);
    labelSizeOutput.textContent = String(normalized.labelSize);
    lineWidthInput.value = String(normalized.lineWidth);
    lineWidthOutput.textContent = String(normalized.lineWidth);
    pointScaleInput.value = String(normalized.pointScale);
    pointScaleOutput.textContent = String(normalized.pointScale);
    minDistanceInput.value = String(normalized.minDistance);
    minDistanceOutput.textContent = String(normalized.minDistance);
    currentTrackColor = normalized.trackColor;
    syncTrackColorInput(normalized.trackColor);
    if (animDurationInput) {
      animDurationInput.value = String(normalized.animDuration);
      if (animDurationOutput) animDurationOutput.textContent = String(normalized.animDuration);
    }
    if (animFpsSelect) animFpsSelect.value = String(normalized.animFps);
    if (finalOverlayScaleInput) finalOverlayScaleInput.value = String(normalized.finalOverlayScale);
    if (finalOverlayScaleOutput) finalOverlayScaleOutput.textContent = String(normalized.finalOverlayScale);
    if (finalOverlayOffsetXInput) finalOverlayOffsetXInput.value = String(normalized.finalOverlayOffsetX);
    if (finalOverlayOffsetYInput) finalOverlayOffsetYInput.value = String(normalized.finalOverlayOffsetY);
    if (finalAnimationStartInput) finalAnimationStartInput.value = normalized.finalAnimationStart.toFixed(1);
    selectedSourceVideoFileId = normalized.sourceVideoFileId || PAGE_SOURCE_VIDEO_FILE_ID;
    waypointList.textContent = '';
    waypointCounter = 0;
    normalized.waypoints.forEach((waypoint) => {
      addWaypointRow(waypoint.name, waypoint.distanceKm, waypoint.offsetX, waypoint.offsetY, false);
    });
    settingsPersistSuspended = false;
    if (currentState) {
      updateThinning();
      if (!skipRender) {
        render();
        renderStep2AnimPreview(1);
      }
    } else if (!skipRender) {
      refreshWorkflowOutputs();
    }
    return normalized;
  }

  function applyDefaultSettings(options) {
    return applySettings(DEFAULT_SETTINGS, options);
  }

  function restoreStoredSettings() {
    const stored = loadStoredSettings();
    if (!stored) return false;
    applySettings(stored, { skipRender: true });
    return true;
  }

  function resetSettingsToDefaults() {
    clearStoredSettings();
    applyDefaultSettings({ skipRender: true });
    if (currentState) {
      resetDefaultLabels();
      updateThinning();
      render();
      renderStep2AnimPreview(1);
    } else {
      refreshWorkflowOutputs();
    }
    persistSettings();
  }

  function getTrackColorLine(color = currentTrackColor) {
    return normalizeTrackColor(color);
  }

  function syncTrackColorInput(color = currentTrackColor) {
    if (!trackColorInput) return;
    const normalized = normalizeTrackColor(color);
    if (trackColorInput.value.toLowerCase() === normalized) return;
    trackColorInput.value = normalized;
    trackColorInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function initTrackColorPicker() {
    window.VlandivirColorPicker?.initialize({
      text: {
        chooseColor: copy.trackColorLabel,
        shade: LANG === 'en' ? 'Shade' : 'Оттенок',
        whiteAndBlack: LANG === 'en' ? 'white and black' : 'белый и черный',
      },
    });
    syncTrackColorInput();
  }

  function setTrackColor(color) {
    const normalized = normalizeTrackColor(color);
    if (normalized === currentTrackColor) return;
    currentTrackColor = normalized;
    syncTrackColorInput(normalized);
    invalidateRoutePathCache();
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  }

  function computeRouteGeometry() {
    if (!currentState) return null;
    const W = CANVAS_W;
    const H = CANVAS_H;
    const topPad = 280;
    const bottomPad = 360;
    const routeArea = { x0: SAFE_MARGIN, y0: topPad, x1: W - SAFE_MARGIN, y1: H - bottomPad };
    const routeW = routeArea.x1 - routeArea.x0;
    const routeH = routeArea.y1 - routeArea.y0;
    const fitted = fitToBox(currentState.thinned, routeW, routeH);
    const pts = fitted.points.map((p) => ({ x: p.x + routeArea.x0, y: p.y + routeArea.y0 }));
    const controls = getPosterControls();
    const trackColor = getTrackColorLine();
    const labelMarkers = controls.labels
      .map((label, index) => {
        const targetMeters = Math.min(label.km * 1000, currentState.distance);
        const geoPoint = pointAtDistance(currentState.points, targetMeters);
        if (!geoPoint) return null;
        const projected = fitted.projectPoint(geoPoint);
        return {
          x: projected.x + routeArea.x0,
          y: projected.y + routeArea.y0,
          name: label.name,
          km: targetMeters / 1000,
          offsetX: label.offsetX,
          offsetY: label.offsetY,
          index: index + 1,
        };
      })
      .filter(Boolean);
    return { fitted, pts, controls, trackColor, labelMarkers };
  }

  function drawTrackOverlayLayers(targetCtx, geo) {
    const { pts, controls, trackColor, labelMarkers } = geo;
    targetCtx.save();
    targetCtx.strokeStyle = trackColor;
    targetCtx.lineWidth = controls.lineWidth;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    drawCatmullRom(targetCtx, pts, 0.5);
    targetCtx.restore();
    labelMarkers.forEach((marker, index) => {
      const routeIndex = nearestPointIndex(pts, marker.x, marker.y);
      const normal = outwardNormalForPoint(pts, routeIndex, marker.x, marker.y);
      drawWaypointMarker(targetCtx, marker, index, controls, normal, pts, trackColor);
    });
  }

  function drawTrackTraversalLayers(targetCtx, geo, progress) {
    const { pts, controls, trackColor, labelMarkers } = geo;
    const path = getRoutePathCache(pts, labelMarkers);
    const mix = Math.max(0, Math.min(1, progress));
    const revealLength = mix * path.totalLength;
    const markerEpsilon = Math.max(2, controls.lineWidth * 0.35);

    targetCtx.save();
    targetCtx.lineWidth = controls.lineWidth;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    targetCtx.strokeStyle = ROUTE_ANIM_UNREVEALED;
    strokeSampledPath(targetCtx, path.samples);

    if (revealLength > 0) {
      targetCtx.strokeStyle = trackColor;
      strokeSampledPathToLength(targetCtx, path.samples, revealLength);
    }
    targetCtx.restore();

    labelMarkers.forEach((marker, index) => {
      const reached = path.markerDistances[index] <= revealLength + markerEpsilon;
      const markerColor = reached ? trackColor : ROUTE_ANIM_UNREVEALED;
      const routeIndex = nearestPointIndex(pts, marker.x, marker.y);
      const normal = outwardNormalForPoint(pts, routeIndex, marker.x, marker.y);
      drawWaypointMarker(targetCtx, marker, index, controls, normal, pts, markerColor);
    });
  }

  function renderStep3TrackPreview() {
    if (!step3TrackPreviewCanvas || !step3TrackPlaceholder) return;
    const s2 = step3TrackPreviewCanvas.getContext('2d');
    if (!currentState) {
      step3TrackPreviewCanvas.hidden = true;
      step3TrackPlaceholder.hidden = false;
      return;
    }
    step3TrackPlaceholder.hidden = true;
    step3TrackPreviewCanvas.hidden = false;
    s2.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const geo = computeRouteGeometry();
    if (geo) drawTrackOverlayLayers(s2, geo);
  }

  function getAnimDurationMs() {
    const seconds = parseFloat(animDurationInput?.value || '5');
    if (!Number.isFinite(seconds) || seconds <= 0) return 5000;
    return seconds * 1000;
  }

  function getFinalAnimationStartMs() {
    const seconds = clampFinalAnimationStart(finalAnimationStartInput?.value);
    return seconds * 1000;
  }

  function getFinalTrackProgress(elapsedMs) {
    const startMs = getFinalAnimationStartMs();
    if (elapsedMs < startMs) return null;
    return Math.min(1, (elapsedMs - startMs) / getAnimDurationMs());
  }

  function getFinalOverlayControls() {
    return {
      scale: clampSettingNumber(finalOverlayScaleInput?.value, 20, 180, DEFAULT_SETTINGS.finalOverlayScale) / 100,
      offsetX: clampSettingNumber(finalOverlayOffsetXInput?.value, -1080, 1080, DEFAULT_SETTINGS.finalOverlayOffsetX),
      offsetY: clampSettingNumber(finalOverlayOffsetYInput?.value, -1920, 1920, DEFAULT_SETTINGS.finalOverlayOffsetY),
    };
  }

  function drawFinalTrackOverlay(targetCtx, geo, progress = 1) {
    if (progress === null) return;
    const overlay = getFinalOverlayControls();
    targetCtx.save();
    targetCtx.translate(CANVAS_W / 2 + overlay.offsetX, CANVAS_H / 2 + overlay.offsetY);
    targetCtx.scale(overlay.scale, overlay.scale);
    targetCtx.translate(-CANVAS_W / 2, -CANVAS_H / 2);
    if (progress >= 1) drawTrackOverlayLayers(targetCtx, geo);
    else drawTrackTraversalLayers(targetCtx, geo, progress);
    targetCtx.restore();
  }

  function getAnimExportFps() {
    const fps = parseInt(animFpsSelect?.value || '30', 10);
    return ANIM_EXPORT_FPS_OPTIONS.includes(fps) ? fps : 30;
  }

  function getAnimExportFrameCount() {
    const durationMs = getAnimDurationMs();
    const fps = getAnimExportFps();
    return Math.max(2, Math.round((durationMs / 1000) * fps) + 1);
  }

  function getAnimProgressForFrame(frameIndex, frameCount) {
    if (frameCount <= 1) return 1;
    return frameIndex / (frameCount - 1);
  }

  function renderTraversalExportFrame(targetCtx, geo, progress) {
    targetCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (progress >= 1) drawTrackOverlayLayers(targetCtx, geo);
    else drawTrackTraversalLayers(targetCtx, geo, progress);
  }

  function safeTrackBaseName() {
    return (currentState?.fileName || 'gpx-track').replace(/[^\wа-яА-Я\-_. ]+/g, '').trim() || 'gpx-track';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function rememberUserFile(file) {
    if (!window.UserFilesRegistry?.upsert) return Promise.resolve(null);
    return window.UserFilesRegistry.upsert(file).catch((error) => {
      console.warn('Failed to remember user file', error);
      return null;
    });
  }

  function rememberGpxFile(blob, filename, origin, description) {
    rememberUserFile({
      id: `gpx:${origin}:${filename}`,
      sourceApp: 'gpx-route-png',
      origin,
      name: filename,
      blob,
      mimeType: blob.type || 'application/octet-stream',
      size: blob.size,
      createdAt: new Date().toISOString(),
      pageUrl: window.location.pathname,
      description,
      context: currentState
        ? `${currentState.fileName || 'GPX'} · ${currentState.original || 0} точек · ${formatKm((currentState.distance || 0) / 1000)} км`
        : undefined,
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** unit;
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function sourceDownloadPathForRegistryRecord(record) {
    const match = String(record?.id || '').match(/^subs:([a-f0-9]{24}):(source|render)$/);
    if (!match) return '';
    const [, hash, kind] = match;
    return kind === 'source'
      ? `/subs-api/videos/${hash}/source/download`
      : `/subs-api/videos/${hash}/render/download`;
  }

  async function findSourceVideoRecord(id) {
    if (!window.UserFilesRegistry?.get) return null;

    const direct = await window.UserFilesRegistry.get(id);
    if (direct) return direct;

    if (/^[a-f0-9]{24}$/.test(id)) {
      const source = await window.UserFilesRegistry.get(`subs:${id}:source`);
      if (source) return source;
      const rendered = await window.UserFilesRegistry.get(`subs:${id}:render`);
      if (rendered) return rendered;
      return { id: `subs:${id}:source`, hash: id };
    }

    return null;
  }

  function registryFileName(record, fallback = 'source-video.mp4') {
    return String(record?.name || fallback).trim() || fallback;
  }

  async function registryRecordToVideoFile(record) {
    if (!record) throw new Error(copy.sourceVideoNotFound);
    const name = registryFileName(record);
    const type = record.mimeType && record.mimeType !== 'video' ? record.mimeType : 'video/mp4';

    if (record.blob) {
      return new File([record.blob], name, {
        type: record.blob.type || type,
        lastModified: Date.parse(record.updatedAt || record.createdAt) || Date.now(),
      });
    }

    const sameOriginPath = sourceDownloadPathForRegistryRecord(record);
    if (!sameOriginPath) throw new Error(copy.sourceVideoUnavailable);

    const response = await fetch(sameOriginPath);
    if (!response.ok) throw new Error(copy.sourceVideoLoadFailed);
    const blob = await response.blob();
    return new File([blob], name, {
      type: blob.type?.startsWith('video/') ? blob.type : type,
      lastModified: Date.parse(record.updatedAt || record.createdAt) || Date.now(),
    });
  }

  function clearFinalVideoResult() {
    if (finalVideoObjectUrl) URL.revokeObjectURL(finalVideoObjectUrl);
    finalVideoObjectUrl = '';
    if (finalVideoResult) finalVideoResult.hidden = true;
    if (finalVideoLink) finalVideoLink.href = '#';
    if (finalVideoDownloadLink) finalVideoDownloadLink.href = '#';
  }

  function setFinalVideoResult(blob, filename) {
    clearFinalVideoResult();
    finalVideoObjectUrl = URL.createObjectURL(blob);
    if (finalVideoLink) finalVideoLink.href = finalVideoObjectUrl;
    if (finalVideoDownloadLink) {
      finalVideoDownloadLink.href = finalVideoObjectUrl;
      finalVideoDownloadLink.download = filename;
      finalVideoDownloadLink.textContent = copy.downloadFinalVideo;
    }
    if (finalVideoResult) finalVideoResult.hidden = false;
  }

  function rememberGpxSourceVideo(file) {
    if (!file) return Promise.resolve(null);
    const id = `gpx:source-video:${file.name}:${file.size}:${file.lastModified || 0}`;
    return rememberUserFile({
      id,
      sourceApp: 'gpx-route-png',
      origin: 'gpx-source-video',
      name: file.name || 'source-video',
      blob: file,
      mimeType: file.type || 'video',
      size: file.size,
      createdAt: new Date().toISOString(),
      pageUrl: window.location.pathname,
      description: copy.sourceVideoDescription,
    });
  }

  function updateFinalVideoControls() {
    const hasTrack = Boolean(currentState);
    const hasVideo = Boolean(sourceVideoFile);
    const locked = finalPreviewPlaying || finalVideoExportInProgress;
    if (playFinalPreviewBtn) {
      playFinalPreviewBtn.disabled = !hasTrack || !hasVideo || locked;
      playFinalPreviewBtn.textContent = finalPreviewPlaying ? copy.playingFinalPreview : copy.playFinalPreview;
    }
    if (renderFinalVideoBtn) {
      renderFinalVideoBtn.disabled = !hasTrack || !hasVideo || locked;
      renderFinalVideoBtn.textContent = finalVideoExportInProgress
        ? copy.renderingFinalVideo
        : copy.renderFinalVideo;
    }
    if (browseSourceVideoBtn) {
      browseSourceVideoBtn.disabled = locked;
      browseSourceVideoBtn.textContent = copy.chooseSourceVideo;
    }
    if (sourceVideoInput) sourceVideoInput.disabled = locked;
    [finalOverlayScaleInput, finalOverlayOffsetXInput, finalOverlayOffsetYInput, finalAnimationStartInput].forEach((input) => {
      if (input) input.disabled = locked;
    });
    if (finalVideoStatus && (!hasTrack || !hasVideo) && !finalVideoExportInProgress) {
      finalVideoStatus.textContent = copy.finalVideoNeedsTrackAndVideo;
    }
  }

  function updateSampleButtonVisibility() {
    if (!sampleLine && !sampleBtn) return;
    const shouldHide = IS_VIDEO_CONTEXT || Boolean(currentState) || Boolean(sourceVideoFile);
    const target = sampleLine || sampleBtn;
    target.hidden = shouldHide;
  }

  function updateStep2VideoFrameBackground() {
    if (!step2AnimBg || !sourceVideoPreview || !sourceVideoFile) return;
    if (sourceVideoPreview.readyState < 2) return;
    try {
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = CANVAS_W;
      frameCanvas.height = CANVAS_H;
      const frameCtx = frameCanvas.getContext('2d');
      drawVideoCoverFrame(frameCtx, sourceVideoPreview, CANVAS_W, CANVAS_H);
      step2VideoFrameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.88);
      step2AnimBg.src = step2VideoFrameDataUrl;
    } catch (error) {
      console.warn('Failed to use source video frame as animation background', error);
    }
  }

  function renderFinalVideoOverlayPreview(progress = 1) {
    if (!finalVideoOverlayCanvas) return;
    if (!currentState || !sourceVideoFile) {
      finalVideoOverlayCanvas.hidden = true;
      return;
    }
    const overlayCtx = finalVideoOverlayCanvas.getContext('2d');
    const geo = computeRouteGeometry();
    if (!geo) return;
    finalVideoOverlayCanvas.hidden = false;
    overlayCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (progress === null) return;
    drawFinalTrackOverlay(overlayCtx, geo, progress);
  }

  async function setSourceVideoFile(file, options = {}) {
    if (!file) return null;
    const { remember = true, recordId = '' } = options;
    if (sourceVideoObjectUrl) URL.revokeObjectURL(sourceVideoObjectUrl);
    sourceVideoObjectUrl = URL.createObjectURL(file);
    sourceVideoFile = file;
    selectedSourceVideoFileId = recordId;
    clearFinalVideoResult();

    if (sourceVideoPreview) {
      sourceVideoPreview.src = sourceVideoObjectUrl;
      sourceVideoPreview.hidden = false;
      sourceVideoPreview.load();
    }
    if (sourceVideoPlaceholder) sourceVideoPlaceholder.hidden = true;
    if (sourceVideoMeta) {
      sourceVideoMeta.textContent = `${file.name || 'video'} · ${formatBytes(file.size)} · ${file.type || 'video'}`;
    }
    if (sourceVideoStatus) sourceVideoStatus.textContent = copy.sourceVideoReady;
    if (finalVideoStatus) finalVideoStatus.textContent = copy.sourceVideoReady;
    if (remember) {
      const record = await rememberGpxSourceVideo(file);
      if (record?.id) selectedSourceVideoFileId = record.id;
    }
    updateSampleButtonVisibility();
    updateStep2VideoFrameBackground();
    schedulePersistSettings();
    renderFinalVideoOverlayPreview(1);
    updateFinalVideoControls();
    return sourceVideoFile;
  }

  async function loadSourceVideoFromFiles() {
    const querySourceFileId = sourceFileIdFromQuery();
    const sourceFileId = PAGE_SOURCE_VIDEO_FILE_ID || querySourceFileId;
    if (!sourceFileId) return false;
    if (!window.UserFilesRegistry?.get) {
      if (finalVideoStatus) finalVideoStatus.textContent = copy.sourceVideoLoadFailed;
      return false;
    }

    if (sourceVideoStatus) sourceVideoStatus.textContent = copy.sourceVideoFromFiles;
    if (finalVideoStatus) finalVideoStatus.textContent = copy.sourceVideoFromFiles;
    try {
      const storedRecord = await findSourceVideoRecord(sourceFileId);
      const record = storedRecord || (/^subs:[a-f0-9]{24}:(source|render)$/.test(sourceFileId)
        ? { id: sourceFileId }
        : null);
      const file = await registryRecordToVideoFile(record);
      await setSourceVideoFile(file, {
        remember: !storedRecord,
        recordId: /^[a-f0-9]{24}$/.test(sourceFileId) ? sourceFileId : storedRecord?.id || sourceFileId,
      });
      if (querySourceFileId) {
        window.history.replaceState(null, '', videoPagePath(sourceFileId));
      }
      return true;
    } catch (error) {
      if (sourceVideoStatus) {
        sourceVideoStatus.textContent =
          error instanceof Error ? error.message : copy.sourceVideoLoadFailed;
      }
      finalVideoStatus.textContent =
        error instanceof Error ? error.message : copy.sourceVideoLoadFailed;
      return false;
    }
  }

  async function restoreStoredSourceVideo() {
    if (!IS_VIDEO_CONTEXT || !selectedSourceVideoFileId || sourceVideoFile || !window.UserFilesRegistry?.get) {
      return false;
    }

    try {
      const record = await findSourceVideoRecord(selectedSourceVideoFileId);
      if (!record) return false;
      const file = await registryRecordToVideoFile(record);
      await setSourceVideoFile(file, {
        remember: false,
        recordId: record.id,
      });
      return true;
    } catch (error) {
      console.warn('Failed to restore source video', error);
      return false;
    }
  }

  function drawVideoCoverFrame(targetCtx, video, width, height) {
    const videoWidth = video.videoWidth || width;
    const videoHeight = video.videoHeight || height;
    const scale = Math.max(width / videoWidth, height / videoHeight);
    const drawWidth = videoWidth * scale;
    const drawHeight = videoHeight * scale;
    const dx = (width - drawWidth) / 2;
    const dy = (height - drawHeight) / 2;
    targetCtx.drawImage(video, dx, dy, drawWidth, drawHeight);
  }

  function waitForVideoMetadata(video) {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(copy.sourceVideoLoadFailed));
    });
  }

  function waitForVideoPlaying(video) {
    if (!video.paused && video.readyState >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const onPlaying = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('playing', onPlaying);
        resolve();
      };
      video.addEventListener('playing', onPlaying);
      void video.play()
        .then(() => {
          if (video.readyState < 2 || settled) return;
          onPlaying();
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          video.removeEventListener('playing', onPlaying);
          resolve();
        });
    });
  }

  function stopFinalPreviewPlayback(options = {}) {
    const { resetVideo = true } = options;
    if (finalPreviewRafId !== null) {
      cancelAnimationFrame(finalPreviewRafId);
      finalPreviewRafId = null;
    }
    finalPreviewPlaying = false;
    if (sourceVideoPreview && resetVideo) {
      sourceVideoPreview.pause();
      sourceVideoPreview.currentTime = 0;
    }
    renderFinalVideoOverlayPreview(1);
    updateFinalVideoControls();
  }

  async function playFinalPreview(options = {}) {
    const { resetVideo = true } = options;
    if (!currentState || !sourceVideoFile || finalPreviewPlaying || finalVideoExportInProgress) return;
    stopFinalPreviewPlayback({ resetVideo });
    finalPreviewPlaying = true;
    updateFinalVideoControls();
    if (resetVideo) sourceVideoPreview.currentTime = 0;
    await waitForVideoPlaying(sourceVideoPreview);
    const totalAnimationMs = getFinalAnimationStartMs() + getAnimDurationMs();
    const durationMs = Math.min(
      totalAnimationMs,
      Number.isFinite(sourceVideoPreview.duration) ? sourceVideoPreview.duration * 1000 : totalAnimationMs,
    );
    const startedAt = performance.now();

    const tick = (now) => {
      const elapsedMs = now - startedAt;
      const progress = getFinalTrackProgress(elapsedMs);
      renderFinalVideoOverlayPreview(progress);
      if (elapsedMs < durationMs && progress < 1 && !sourceVideoPreview.ended) {
        finalPreviewRafId = requestAnimationFrame(tick);
        return;
      }
      finalPreviewRafId = null;
      finalPreviewPlaying = false;
      sourceVideoPreview.pause();
      renderFinalVideoOverlayPreview(getFinalTrackProgress(durationMs));
      updateFinalVideoControls();
    };

    renderFinalVideoOverlayPreview(getFinalTrackProgress(0));
    finalPreviewRafId = requestAnimationFrame(tick);
  }

  function setFinalVideoExportBusy(busy) {
    finalVideoExportInProgress = busy;
    updateFinalVideoControls();
  }

  async function exportFinalVideo() {
    if (!currentState || !sourceVideoFile || finalVideoExportInProgress) return;
    if (typeof MediaRecorder === 'undefined') {
      finalVideoStatus.textContent = copy.finalVideoUnsupported;
      return;
    }

    const exportCanvas = document.createElement('canvas');
    if (!exportCanvas.captureStream) {
      finalVideoStatus.textContent = copy.finalVideoUnsupported;
      return;
    }

    const mimeType = pickFinalWebmMimeType();
    if (!mimeType) {
      finalVideoStatus.textContent = copy.finalVideoUnsupported;
      return;
    }

    const controls = getPosterControls();
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (_e) {
        /* ignore */
      }
    }
    if (document.fonts && controls.labelFontKey !== 'georgia') {
      await document.fonts.load(`${controls.labelSize}px ${controls.labelFontFamily}`).catch(() => {});
    }

    const geo = computeRouteGeometry();
    if (!geo) return;
    getRoutePathCache(geo.pts, geo.labelMarkers);

    stopFinalPreviewPlayback();
    setFinalVideoExportBusy(true);
    clearFinalVideoResult();
    finalVideoStatus.textContent = copy.renderingFinalVideo;

    exportCanvas.width = CANVAS_W;
    exportCanvas.height = CANVAS_H;
    const exportCtx = exportCanvas.getContext('2d', { alpha: false });
    const exportVideo = document.createElement('video');
    exportVideo.src = sourceVideoObjectUrl;
    exportVideo.muted = true;
    exportVideo.playsInline = true;
    exportVideo.preload = 'auto';

    let stream;
    let sourceStream;
    try {
      await waitForVideoMetadata(exportVideo);
      exportVideo.currentTime = 0;
      const fps = getAnimExportFps();
      const totalAnimationMs = getFinalAnimationStartMs() + getAnimDurationMs();
      const durationMs = Math.max(
        500,
        Math.min(
          totalAnimationMs,
          Number.isFinite(exportVideo.duration) ? exportVideo.duration * 1000 : totalAnimationMs,
        ),
      );

      stream = exportCanvas.captureStream(fps);
      if (exportVideo.captureStream && (mimeType.includes('opus') || mimeType === 'video/webm')) {
        sourceStream = exportVideo.captureStream();
        sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }

      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12_000_000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      const drawFrame = (progress) => {
        exportCtx.fillStyle = '#000';
        exportCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawVideoCoverFrame(exportCtx, exportVideo, CANVAS_W, CANVAS_H);
        drawFinalTrackOverlay(exportCtx, geo, progress);
      };

      recorder.start();
      await waitForVideoPlaying(exportVideo);
      const startedAt = performance.now();
      await new Promise((resolve) => {
        const tick = (now) => {
          const elapsedMs = now - startedAt;
          const progress = getFinalTrackProgress(elapsedMs);
          drawFrame(progress);
          if (elapsedMs < durationMs && progress < 1 && !exportVideo.ended) {
            requestAnimationFrame(tick);
            return;
          }
          drawFrame(getFinalTrackProgress(durationMs));
          resolve();
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      await stopped;

      if (chunks.length === 0) throw new Error(copy.finalVideoExportFailed);
      const blob = new Blob(chunks, { type: mimeType });
      const filename = `${safeTrackBaseName()}-final-track.webm`;
      rememberGpxFile(blob, filename, 'gpx-final-video', copy.finalVideoDescription);
      setFinalVideoResult(blob, filename);
      finalVideoStatus.textContent = `${copy.finalVideoReady} · ${formatBytes(blob.size)}`;
    } catch (error) {
      console.error(error);
      finalVideoStatus.textContent =
        error instanceof Error ? error.message : copy.finalVideoExportFailed;
    } finally {
      exportVideo.pause();
      exportVideo.removeAttribute('src');
      exportVideo.load();
      stream?.getTracks().forEach((track) => track.stop());
      sourceStream?.getTracks().forEach((track) => track.stop());
      setFinalVideoExportBusy(false);
      renderFinalVideoOverlayPreview(1);
    }
  }

  function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32Uint8(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildStoredZipArchive(entries) {
    const nameEncoder = new TextEncoder();
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = nameEncoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32Uint8(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lh = new DataView(localHeader.buffer);
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      fileParts.push(localHeader, data);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      centralParts.push(cd);
      offset += localHeader.length + data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endv = new DataView(end.buffer);
    endv.setUint32(0, 0x06054b50, true);
    endv.setUint16(8, entries.length, true);
    endv.setUint16(10, entries.length, true);
    endv.setUint32(12, centralSize, true);
    endv.setUint32(16, offset, true);

    const totalSize =
      fileParts.reduce((sum, part) => sum + part.length, 0) + centralSize + end.length;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const part of fileParts) {
      out.set(part, pos);
      pos += part.length;
    }
    for (const part of centralParts) {
      out.set(part, pos);
      pos += part.length;
    }
    out.set(end, pos);
    return out;
  }

  function canvasToPngUint8(exportCanvas) {
    return new Promise((resolve, reject) => {
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG encode failed'));
          return;
        }
        blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)))
          .catch(reject);
      }, 'image/png');
    });
  }

  function pickWebmMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
  }

  function pickFinalWebmMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
  }

  async function prepareAnimExportContext() {
    if (!currentState || animExportInProgress) return null;
    stopRouteAnimPlayback();
    clearError();

    const controls = getPosterControls();
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (_e) {
        /* ignore */
      }
    }
    if (document.fonts && controls.labelFontKey !== 'georgia') {
      await document.fonts.load(`${controls.labelSize}px ${controls.labelFontFamily}`).catch(() => {});
    }

    const geo = computeRouteGeometry();
    if (!geo) return null;

    getRoutePathCache(geo.pts, geo.labelMarkers);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = CANVAS_W;
    exportCanvas.height = CANVAS_H;
    const exportCtx = exportCanvas.getContext('2d', { alpha: true });
    return { geo, exportCanvas, exportCtx };
  }

  function setAnimExportBusy(busy) {
    animExportInProgress = busy;
    updateStep2Controls();
  }

  async function exportAnimWebm() {
    const exportContext = await prepareAnimExportContext();
    if (!exportContext) return;

    const mimeType = pickWebmMimeType();
    if (!mimeType) {
      showError(copy.webmUnsupported);
      return;
    }

    setAnimExportBusy(true);
    if (downloadAnimWebmBtn) downloadAnimWebmBtn.textContent = copy.exportingWebm;

    try {
      const { geo, exportCanvas, exportCtx } = exportContext;
      const frameCount = getAnimExportFrameCount();
      const exportFps = getAnimExportFps();
      const frameDelayMs = Math.round(1000 / exportFps);
      const stream = exportCanvas.captureStream(exportFps);
      const videoTrack = stream.getVideoTracks()[0];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12_000_000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      recorder.start();
      for (let i = 0; i < frameCount; i++) {
        const progress = getAnimProgressForFrame(i, frameCount);
        renderTraversalExportFrame(exportCtx, geo, progress);
        if (videoTrack?.requestFrame) videoTrack.requestFrame();
        await delayMs(frameDelayMs);
      }
      renderTraversalExportFrame(exportCtx, geo, 1);
      if (videoTrack?.requestFrame) videoTrack.requestFrame();
      await delayMs(frameDelayMs);

      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      const filename = `${safeTrackBaseName()}-track-anim.webm`;
      rememberGpxFile(blob, filename, 'gpx-animation', 'WebM-анимация прохождения трека с альфа-каналом.');
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
      showError(copy.exportFailed);
    } finally {
      setAnimExportBusy(false);
      renderStep2AnimPreview(1);
    }
  }

  async function exportAnimPngZip() {
    const exportContext = await prepareAnimExportContext();
    if (!exportContext) return;

    setAnimExportBusy(true);
    try {
      const { geo, exportCanvas, exportCtx } = exportContext;
      const frameCount = getAnimExportFrameCount();
      const zipEntries = [];

      for (let i = 0; i < frameCount; i++) {
        if (downloadAnimPngZipBtn) {
          downloadAnimPngZipBtn.textContent = copy.exportingPngFrame(i + 1, frameCount);
        }
        const progress = getAnimProgressForFrame(i, frameCount);
        renderTraversalExportFrame(exportCtx, geo, progress);
        const pngBytes = await canvasToPngUint8(exportCanvas);
        zipEntries.push({
          name: `frame_${String(i + 1).padStart(4, '0')}.png`,
          data: pngBytes,
        });
      }

      zipEntries.push({
        name: 'ffmpeg.txt',
        data: new TextEncoder().encode(copy.ffmpegReadme(getAnimExportFps())),
      });

      const zipBytes = buildStoredZipArchive(zipEntries);
      const blob = new Blob([zipBytes], { type: 'application/zip' });
      const filename = `${safeTrackBaseName()}-track-anim-frames.zip`;
      rememberGpxFile(blob, filename, 'gpx-frames', 'ZIP-архив PNG-кадров и ffmpeg-инструкции для анимации трека.');
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
      showError(copy.exportFailed);
    } finally {
      setAnimExportBusy(false);
      renderStep2AnimPreview(1);
    }
  }

  function stopRouteAnimPlayback() {
    if (routeAnimRafId !== null) {
      cancelAnimationFrame(routeAnimRafId);
      routeAnimRafId = null;
    }
    routeAnimPlaying = false;
    updateStep2Controls();
  }

  function renderStep2AnimFrame(progress) {
    if (!step2AnimCanvas || !step2AnimPlaceholder) return;
    const animCtx = step2AnimCanvas.getContext('2d');
    if (!currentState) {
      step2AnimCanvas.hidden = true;
      step2AnimPlaceholder.hidden = false;
      if (step2AnimPlaceholder.textContent !== copy.animEmpty) {
        step2AnimPlaceholder.textContent = copy.animEmpty;
      }
      return;
    }
    step2AnimPlaceholder.hidden = true;
    step2AnimCanvas.hidden = false;
    const geo = computeRouteGeometry();
    if (!geo) return;
    renderTraversalExportFrame(animCtx, geo, progress);
  }

  function renderStep2AnimPreview(progress = 1) {
    if (routeAnimPlaying) return;
    renderStep2AnimFrame(progress);
    updateStep2Controls();
  }

  function playRouteAnim() {
    if (!currentState || routeAnimPlaying || animExportInProgress) return;
    stopRouteAnimPlayback();
    routeAnimPlaying = true;
    updateStep2Controls();
    const durationMs = getAnimDurationMs();
    const startedAt = performance.now();

    const tick = (now) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      renderStep2AnimFrame(progress);
      if (progress < 1) {
        routeAnimRafId = requestAnimationFrame(tick);
        return;
      }
      routeAnimRafId = null;
      routeAnimPlaying = false;
      updateStep2Controls();
    };

    renderStep2AnimFrame(0);
    routeAnimRafId = requestAnimationFrame(tick);
  }

  // ---------- Rendering ----------
  function render() {
    if (!currentState) return;
    const posterTheme = POSTER_THEME;
    const W = CANVAS_W, H = CANVAS_H;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, posterTheme.bg1);
    grad.addColorStop(1, posterTheme.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Soft topographic contour rings (decorative)
    ctx.save();
    ctx.strokeStyle = posterTheme.contour;
    ctx.lineWidth = 2;
    for (let r = 200; r < 1400; r += 80) {
      ctx.beginPath();
      ctx.ellipse(W * 0.18, H * 0.18, r * 0.9, r * 0.55, 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let r = 200; r < 1400; r += 80) {
      ctx.beginPath();
      ctx.ellipse(W * 0.86, H * 0.82, r * 0.85, r * 0.5, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Subtle grain
    ctx.save();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = posterTheme.paperGrain;
      const x = Math.random() * W;
      const y = Math.random() * H;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.restore();

    const geo = computeRouteGeometry();
    if (geo) drawTrackOverlayLayers(ctx, geo);

    // Top text block
    drawTopBlock(ctx, posterTheme);

    // Bottom stats block
    drawBottomBlock(ctx, posterTheme);

    // Outer frame
    ctx.save();
    ctx.strokeStyle = posterTheme.ink;
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.restore();

    refreshWorkflowOutputs();
  }

  function fitToBox(points, boxW, boxH) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const centerLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    const projected = points.map((p) => ({
      x: (p.lon - minLon) * cosLat,
      y: -(p.lat - maxLat),
    }));
    let pminX = Infinity, pmaxX = -Infinity, pminY = Infinity, pmaxY = -Infinity;
    for (const p of projected) {
      if (p.x < pminX) pminX = p.x;
      if (p.x > pmaxX) pmaxX = p.x;
      if (p.y < pminY) pminY = p.y;
      if (p.y > pmaxY) pmaxY = p.y;
    }
    const pw = Math.max(pmaxX - pminX, 1e-9);
    const ph = Math.max(pmaxY - pminY, 1e-9);
    const scale = Math.min(boxW / pw, boxH / ph);
    const drawW = pw * scale;
    const drawH = ph * scale;
    const offX = (boxW - drawW) / 2 - pminX * scale;
    const offY = (boxH - drawH) / 2 - pminY * scale;
    const projectPoint = (point) => ({
      x: ((point.lon - minLon) * cosLat) * scale + offX,
      y: (-(point.lat - maxLat)) * scale + offY,
    });
    return {
      points: projected.map((p) => ({ x: p.x * scale + offX, y: p.y * scale + offY })),
      projectPoint,
    };
  }

  function nearestPointIndex(points, x, y) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x;
      const dy = points[i].y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function outwardNormalForPoint(points, index, x, y) {
    const prev = points[Math.max(0, index - 1)] || points[index];
    const next = points[Math.min(points.length - 1, index + 1)] || points[index];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    let nx = -dy / length;
    let ny = dx / length;
    const centerX = CANVAS_W / 2;
    const centerY = CANVAS_H / 2;
    if (nx * (x - centerX) + ny * (y - centerY) < 0) {
      nx *= -1;
      ny *= -1;
    }
    return { x: nx, y: ny };
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq));
    const x = ax + abx * t;
    const y = ay + aby * t;
    return Math.hypot(px - x, py - y);
  }

  function rectDistanceToRoute(rect, routePoints) {
    const samples = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    ];
    let best = Infinity;
    for (let i = 1; i < routePoints.length; i++) {
      for (const sample of samples) {
        best = Math.min(best, distanceToSegment(sample.x, sample.y, routePoints[i - 1].x, routePoints[i - 1].y, routePoints[i].x, routePoints[i].y));
      }
    }
    return best;
  }

  function candidateLabelPosition(anchorX, anchorY, labelW, labelH, offset, dir) {
    let x = anchorX + dir.x * offset;
    let y = anchorY + dir.y * offset;
    if (dir.x < -0.15) x -= labelW;
    else if (Math.abs(dir.x) <= 0.15) x -= labelW / 2;
    if (dir.y < -0.15) y -= labelH;
    else if (Math.abs(dir.y) <= 0.15) y -= labelH / 2;
    x = Math.max(64, Math.min(CANVAS_W - 64 - labelW, x));
    y = Math.max(286, Math.min(CANVAS_H - 430 - labelH, y));
    return { x, y, w: labelW, h: labelH };
  }

  function chooseLabelRect(anchorX, anchorY, labelW, labelH, offset, normal, routePoints) {
    const base = normal || { x: 1, y: 0 };
    const dirs = [
      base,
      { x: -base.x, y: -base.y },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: 0.72, y: -0.72 },
      { x: -0.72, y: -0.72 },
      { x: 0.72, y: 0.72 },
      { x: -0.72, y: 0.72 },
    ];
    let best = null;
    let bestScore = -Infinity;
    for (const dir of dirs) {
      const rect = candidateLabelPosition(anchorX, anchorY, labelW, labelH, offset, dir);
      const routeClearance = routePoints ? rectDistanceToRoute(rect, routePoints) : 999;
      const anchorDistance = Math.hypot(rect.x + rect.w / 2 - anchorX, rect.y + rect.h / 2 - anchorY);
      const score = routeClearance * 8 + anchorDistance * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = rect;
      }
    }
    return best;
  }

  function drawWaypointMarker(
    ctx,
    marker,
    index,
    controls = getPosterControls(),
    normal = null,
    routePoints = null,
    lineColor,
  ) {
    const side = index % 2 === 0 ? 'right' : 'left';
    const markerRadius = (controls.lineWidth * controls.pointScale) / 2;
    ctx.save();
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, markerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawTrackLabel(ctx, marker, side, controls, normal, routePoints, lineColor);
  }

  function splitLabelLines(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  function roundPx(value) {
    return Math.round(value * 10) / 10;
  }

  /**
   * Same geometry as drawTrackLabel; used for canvas export and for AI prompt text.
   * @returns {null | { lines: string[], textX: number, firstLineY: number, lineHeight: number, fontSize: number, fontWeight: number, fontFamily: string, color: string }}
   */
  function computeTrackLabelLayout(
    marker,
    side,
    controls,
    normal,
    routePoints,
    measureCtx,
    lineColor,
  ) {
    const clean = marker.name.trim();
    if (!clean) return null;

    const fontSize = controls.labelSize;
    const weight = 700;
    measureCtx.save();
    measureCtx.font = `${weight} ${fontSize}px ${controls.labelFontFamily}`;
    measureCtx.textBaseline = 'middle';
    const maxWidth = Math.max(240, Math.min(390, fontSize * 14));
    const lines = splitLabelLines(clean).map((line) => {
      let label = line;
      while (measureCtx.measureText(label).width > maxWidth && label.length > 8) {
        label = label.slice(0, -2).trim() + '…';
      }
      return label;
    });
    if (!lines.length) {
      measureCtx.restore();
      return null;
    }

    const labelW = Math.max(...lines.map((line) => measureCtx.measureText(line).width));
    const lineHeight = fontSize * 1.14;
    const labelH = lineHeight * lines.length;
    const markerRadius = (controls.lineWidth * controls.pointScale) / 2;
    const offset = markerRadius + Math.max(controls.labelSize * 0.75, controls.lineWidth * 3, 34);
    let textX;
    let textY;
    if (routePoints) {
      const rect = chooseLabelRect(marker.x, marker.y, labelW, labelH, offset, normal, routePoints);
      textX = rect.x;
      textY = rect.y + labelH / 2;
    } else if (normal) {
      const rect = candidateLabelPosition(marker.x, marker.y, labelW, labelH, offset, normal);
      textX = rect.x;
      textY = rect.y + labelH / 2;
    } else {
      textX = side === 'left' ? marker.x - labelW - offset : marker.x + offset;
      textY = marker.y;
    }
    textX += marker.offsetX || 0;
    textY += marker.offsetY || 0;
    textX = Math.max(64, Math.min(CANVAS_W - 64 - labelW, textX));
    textY = Math.max(286, Math.min(CANVAS_H - 430, textY));

    const firstLineY = textY - ((lines.length - 1) * lineHeight) / 2;
    measureCtx.restore();

    return {
      lines,
      textX,
      firstLineY,
      lineHeight,
      fontSize,
      fontWeight: weight,
      fontFamily: controls.labelFontFamily,
      color: lineColor,
    };
  }

  function drawTrackLabel(
    ctx,
    marker,
    side,
    controls = getPosterControls(),
    normal = null,
    routePoints = null,
    lineColor,
  ) {
    const layout = computeTrackLabelLayout(marker, side, controls, normal, routePoints, ctx, lineColor);
    if (!layout) return;

    ctx.save();
    ctx.font = `${layout.fontWeight} ${layout.fontSize}px ${layout.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = layout.color;
    layout.lines.forEach((line, i) => {
      ctx.fillText(line, layout.textX, layout.firstLineY + i * layout.lineHeight);
    });
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawTopBlock(ctx, theme) {
    const title = (titleInput.value || '').trim() || 'GPX TRACK';

    // Eyebrow
    ctx.save();
    ctx.fillStyle = theme.inkMuted;
    ctx.font = '500 26px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('· TRAIL · TRACK · ROUTE ·', 90, 110);
    ctx.restore();

    // Title — wrap if needed
    ctx.save();
    ctx.fillStyle = theme.ink;
    ctx.font = '700 86px "Satoshi", sans-serif';
    ctx.textBaseline = 'top';
    const maxWidth = CANVAS_W - 180;
    const lines = wrapText(ctx, title.toUpperCase(), maxWidth);
    let ty = 150;
    for (const line of lines.slice(0, 2)) {
      ctx.fillText(line, 90, ty);
      ty += 90;
    }
    ctx.restore();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawBottomBlock(ctx, theme) {
    const W = CANVAS_W, H = CANVAS_H;
    const baseY = H - 280;

    // Divider line
    ctx.save();
    ctx.strokeStyle = theme.ink;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, baseY - 30);
    ctx.lineTo(W - 90, baseY - 30);
    ctx.stroke();
    ctx.restore();

    const distKm = (currentState.distance / 1000);
    const distStr = distKm < 10 ? distKm.toFixed(2) : distKm.toFixed(1);
    const ptsStr = String(currentState.thinned.length);
    const { minLat, maxLat, minLon, maxLon } = currentState.bbox;
    const formatCoord = (v, isLat) => {
      const dir = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
      return Math.abs(v).toFixed(3) + '° ' + dir;
    };

    const cols = [
      { label: 'DISTANCE', value: distStr + ' km' },
      { label: 'POINTS', value: ptsStr },
      { label: 'LAT', value: formatCoord(minLat, true) + ' / ' + formatCoord(maxLat, true) },
      { label: 'LON', value: formatCoord(minLon, false) + ' / ' + formatCoord(maxLon, false) },
    ];

    ctx.save();
    let y = baseY;
    ctx.textBaseline = 'top';
    // Row 1: distance & points (large)
    ctx.fillStyle = theme.inkMuted;
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText('DISTANCE', 90, y);
    ctx.fillText('POINTS', W / 2 + 20, y);

    ctx.fillStyle = theme.ink;
    ctx.font = '700 58px "Satoshi", sans-serif';
    ctx.fillText(distStr + ' km', 90, y + 32);
    ctx.fillText(ptsStr + ' pts', W / 2 + 20, y + 32);

    // Row 2: coords
    y = baseY + 130;
    ctx.fillStyle = theme.inkMuted;
    ctx.font = '500 20px "JetBrains Mono", monospace';
    ctx.fillText('LAT  ' + formatCoord(minLat, true) + '  →  ' + formatCoord(maxLat, true), 90, y);
    ctx.fillText('LON  ' + formatCoord(minLon, false) + '  →  ' + formatCoord(maxLon, false), 90, y + 32);
    ctx.restore();
  }

  // ---------- UI: stats panel ----------
  function updateStatsPanel(state) {
    statSource.textContent = state.source;
    statOriginal.textContent = state.original.toLocaleString(copy.locale);
    statThinned.textContent = state.thinned.length.toLocaleString(copy.locale);
    const km = state.distance / 1000;
    statDistance.textContent = (km < 10 ? km.toFixed(2) : km.toFixed(1)) + ' ' + copy.distanceUnit;
    const { minLat, maxLat, minLon, maxLon } = state.bbox;
    // Width/height in km
    const wKm = haversine(minLat, minLon, minLat, maxLon) / 1000;
    const hKm = haversine(minLat, minLon, maxLat, minLon) / 1000;
    statBbox.textContent = wKm.toFixed(1) + ' × ' + hKm.toFixed(1) + ' ' + copy.distanceUnit;
  }

  function refreshWorkflowOutputs() {
    if (!currentState) {
      stopRouteAnimPlayback();
      invalidateRoutePathCache();
      updateStep2Controls();
      updateStep3Controls();
      updateFinalVideoControls();
      renderStep3TrackPreview();
      renderStep2AnimPreview(1);
      renderFinalVideoOverlayPreview(1);
      return;
    }
    updateStep2Controls();
    updateStep3Controls();
    updateFinalVideoControls();
    renderStep3TrackPreview();
    renderStep2AnimPreview(1);
    renderFinalVideoOverlayPreview(1);
  }

  function updateStep2Controls() {
    const hasTrack = Boolean(currentState);
    const locked = routeAnimPlaying || animExportInProgress;
    if (playAnimBtn) {
      playAnimBtn.disabled = !hasTrack || locked;
      playAnimBtn.textContent = routeAnimPlaying ? copy.playingAnim : copy.playAnim;
    }
    if (animDurationInput) animDurationInput.disabled = locked;
    if (animFpsSelect) animFpsSelect.disabled = locked;
    if (downloadAnimWebmBtn) {
      downloadAnimWebmBtn.disabled = !hasTrack || locked;
      if (!animExportInProgress) downloadAnimWebmBtn.textContent = copy.downloadAnimWebm;
    }
    if (downloadAnimPngZipBtn) {
      downloadAnimPngZipBtn.disabled = !hasTrack || locked;
      if (!animExportInProgress) downloadAnimPngZipBtn.textContent = copy.downloadAnimPngZip;
    }
  }

  function updateStep3Controls() {
    const hasTrack = Boolean(currentState);
    if (downloadTransparentPngBtn) {
      downloadTransparentPngBtn.disabled = !hasTrack;
    }
  }

  async function downloadTransparentTrackPng() {
    if (!currentState) return;
    const controls = getPosterControls();
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_e) {
        /* ignore */
      }
    }
    if (document.fonts && controls.labelFontKey !== 'georgia') {
      await document.fonts.load(`${controls.labelSize}px ${controls.labelFontFamily}`).catch(() => {});
    }
    const geo = computeRouteGeometry();
    if (!geo) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = CANVAS_W;
    exportCanvas.height = CANVAS_H;
    const x = exportCanvas.getContext('2d');
    x.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawTrackOverlayLayers(x, geo);
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const base =
        (currentState.fileName || 'gpx-track').replace(/[^\wа-яА-Я\-_. ]+/g, '').trim() || 'gpx-track';
      const filename = base + '-track-alpha.png';
      rememberGpxFile(blob, filename, 'gpx-track-alpha', 'PNG-слой трека на прозрачном фоне для монтажа.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function formatKm(value) {
    const rounded = Math.round(value * 10) / 10;
    const formatted = String(rounded);
    return LANG === 'ru' ? formatted.replace('.', ',') : formatted;
  }

  function resetDefaultLabels() {
    waypointList.textContent = '';
    if (!currentState) return;
    addWaypointRow(copy.defaultStart, '0', '0', '0', false);
    addWaypointRow(copy.defaultFinish, formatKm(currentState.distance / 1000), '0', '0', false);
  }

  function addWaypointRow(name = '', distanceKm = '', offsetX = '0', offsetY = '0', shouldRender = true) {
    waypointCounter += 1;
    const row = document.createElement('div');
    row.className = 'waypoint-row';
    row.dataset.id = String(waypointCounter);

    const nameInput = document.createElement('textarea');
    nameInput.className = 'waypoint-name';
    nameInput.maxLength = 80;
    nameInput.rows = 1;
    nameInput.placeholder = copy.waypointTextPlaceholder;
    nameInput.value = name;
    nameInput.setAttribute('aria-label', copy.waypointTextAria);

    const distanceInput = document.createElement('input');
    distanceInput.type = 'text';
    distanceInput.className = 'waypoint-distance';
    distanceInput.inputMode = 'decimal';
    distanceInput.pattern = '[0-9]+([\\.,][0-9]+)?';
    distanceInput.placeholder = copy.waypointDistancePlaceholder;
    distanceInput.value = distanceKm;
    distanceInput.setAttribute('aria-label', copy.waypointDistanceAria);

    const offsetXInput = document.createElement('input');
    offsetXInput.type = 'text';
    offsetXInput.className = 'waypoint-offset-x';
    offsetXInput.inputMode = 'decimal';
    offsetXInput.pattern = '-?[0-9]+([\\.,][0-9]+)?';
    offsetXInput.placeholder = 'X';
    offsetXInput.value = offsetX;
    offsetXInput.setAttribute('aria-label', copy.offsetXAria);

    const offsetYInput = document.createElement('input');
    offsetYInput.type = 'text';
    offsetYInput.className = 'waypoint-offset-y';
    offsetYInput.inputMode = 'decimal';
    offsetYInput.pattern = '-?[0-9]+([\\.,][0-9]+)?';
    offsetYInput.placeholder = 'Y';
    offsetYInput.value = offsetY;
    offsetYInput.setAttribute('aria-label', copy.offsetYAria);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-waypoint';
    removeBtn.setAttribute('aria-label', copy.removeWaypointAria);
    const trashIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trashIcon.setAttribute('viewBox', '0 0 24 24');
    trashIcon.setAttribute('aria-hidden', 'true');
    trashIcon.classList.add('trash-icon');
    const trashLid = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trashLid.setAttribute('d', 'M9 6V4.8C9 4.36 9.36 4 9.8 4H14.2C14.64 4 15 4.36 15 4.8V6M5 6H19');
    const trashBin = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trashBin.setAttribute('d', 'M8 9L8.7 19H15.3L16 9M10.5 10.5V17M13.5 10.5V17');
    trashIcon.append(trashLid, trashBin);
    removeBtn.append(trashIcon);

    const controlsRow = document.createElement('div');
    controlsRow.className = 'waypoint-controls';
    controlsRow.append(distanceInput, offsetXInput, offsetYInput, removeBtn);

    row.append(nameInput, controlsRow);
    waypointList.append(row);
    if (shouldRender) {
      nameInput.focus();
      if (currentState) render();
      else refreshWorkflowOutputs();
    }
  }

  // ---------- File handling ----------
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    results.hidden = true;
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  async function handleFile(file, opts = {}) {
    const { scrollToResults = true, suppressError = false, preserveWaypoints = false } = opts;
    clearError();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.gpx') && file.type !== 'application/gpx+xml' && file.type !== 'text/xml' && file.type !== 'application/xml') {
      showError(copy.fileTypeError);
      return;
    }
    if (file.size === 0) {
      showError(copy.emptyFileError);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showError(copy.largeFileError);
      return;
    }
    const generation = ++fileIngestGeneration;
    try {
      const text = await file.text();
      if (!text.trim()) {
        showError(copy.whitespaceFileError);
        return;
      }
      const { points, source } = parseGPX(text);
      const original = points.length;

      if (generation !== fileIngestGeneration) return;

      // Bounding box on raw points
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const p of points) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      }

      const controls = getPosterControls();
      const thinned = thinPoints(points, controls.minDistanceMeters);
      const distance = totalDistanceMeters(points);

      currentState = {
        points,
        original,
        thinned,
        distance,
        source,
        bbox: { minLat, maxLat, minLon, maxLon },
        fileName: file.name.replace(/\.gpx$/i, ''),
      };

      clearFinalVideoResult();
      invalidateRoutePathCache();
      if (!preserveWaypoints) resetDefaultLabels();
      updateStatsPanel(currentState);
      render();
      results.hidden = false;
      updateSampleButtonVisibility();
      schedulePersistSettings();
      if (scrollToResults) {
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error(err);
      if (!suppressError) {
        showError(err.message || copy.genericFileError);
      }
    }
  }

  async function loadSampleTrack(options = {}) {
    const { quiet = false, applyDemoContent = true, preserveWaypoints = false } = options;
    const scrollToResults = !quiet;
    const suppressError = quiet;
    if (!quiet) {
      clearError();
      sampleBtn.disabled = true;
    }
    const previousText = quiet ? '' : sampleBtn.textContent;
    if (!quiet) sampleBtn.textContent = copy.loadingSample;
    try {
      const response = await fetch('/gpx-route-png/sample.gpx?v=20260514-8');
      if (!response.ok) {
        throw new Error(copy.sampleLoadError);
      }
      const blob = await response.blob();
      const file = new File([blob], 'sample.gpx', { type: 'application/gpx+xml' });
      await handleFile(file, { scrollToResults, suppressError, preserveWaypoints });
      if (applyDemoContent && currentState) {
        settingsPersistSuspended = true;
        titleInput.value = 'Evening Mountain Bike Ride';
        minDistanceInput.value = '30';
        minDistanceOutput.textContent = '30';
        waypointList.textContent = '';
        waypointCounter = 0;
        addWaypointRow(copy.defaultStart, '0', '0', '0', false);
        addWaypointRow(copy.sampleMiddle1, formatKm(5.4), '0', '0', false);
        addWaypointRow(copy.sampleMiddle2, formatKm(9.1), '240', '-200', false);
        addWaypointRow(copy.defaultFinish, formatKm(currentState.distance / 1000), '0', '0', false);
        settingsPersistSuspended = false;
        updateThinning();
        render();
        persistSettings();
      }
    } catch (err) {
      console.error(err);
      if (!quiet) {
        showError(copy.sampleUiError);
      }
    } finally {
      if (!quiet) {
        sampleBtn.disabled = false;
        sampleBtn.textContent = previousText;
      }
    }
  }

  // ---------- Events ----------
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  sampleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadSampleTrack({ quiet: false });
  });
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('is-drag');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('is-drag');
    })
  );
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  // Prevent default drop on window
  ['dragover', 'drop'].forEach((evt) => {
    window.addEventListener(evt, (e) => {
      if (e.target !== dropZone && !dropZone.contains(e.target)) {
        e.preventDefault();
      }
    });
  });
  window.addEventListener('beforeunload', () => {
    if (sourceVideoObjectUrl) URL.revokeObjectURL(sourceVideoObjectUrl);
    if (finalVideoObjectUrl) URL.revokeObjectURL(finalVideoObjectUrl);
  });

  downloadBtn.addEventListener('click', () => {
    if (!currentState) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const safeName = (currentState.fileName || 'gpx-track').replace(/[^\wа-яА-Я\-_. ]+/g, '').trim() || 'gpx-track';
      const filename = safeName + '-1080x1920.png';
      rememberGpxFile(blob, filename, 'gpx-poster', 'PNG-постер 1080x1920 с линией маршрута, точками и подписями.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });

  if (downloadTransparentPngBtn) {
    downloadTransparentPngBtn.addEventListener('click', () => {
      void downloadTransparentTrackPng();
    });
  }

  if (playAnimBtn) {
    playAnimBtn.addEventListener('click', () => playRouteAnim());
  }
  if (downloadAnimWebmBtn) {
    downloadAnimWebmBtn.addEventListener('click', () => {
      void exportAnimWebm();
    });
  }
  if (downloadAnimPngZipBtn) {
    downloadAnimPngZipBtn.addEventListener('click', () => {
      void exportAnimPngZip();
    });
  }
  if (browseSourceVideoBtn && sourceVideoInput) {
    browseSourceVideoBtn.addEventListener('click', () => {
      sourceVideoInput.click();
    });
    sourceVideoInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) void setSourceVideoFile(file);
      sourceVideoInput.value = '';
    });
  }
  if (sourceVideoPreview) {
    sourceVideoPreview.addEventListener('loadedmetadata', () => {
      if (!sourceVideoFile || !sourceVideoMeta) return;
      const seconds = Number.isFinite(sourceVideoPreview.duration)
        ? ` · ${sourceVideoPreview.duration.toFixed(1)} s`
        : '';
      sourceVideoMeta.textContent = `${sourceVideoFile.name || 'video'} · ${formatBytes(sourceVideoFile.size)} · ${sourceVideoFile.type || 'video'}${seconds}`;
      if (sourceVideoPreview.currentTime === 0 && Number.isFinite(sourceVideoPreview.duration) && sourceVideoPreview.duration > 0.2) {
        sourceVideoPreview.currentTime = 0.1;
      } else {
        updateStep2VideoFrameBackground();
      }
    });
    sourceVideoPreview.addEventListener('play', () => {
      if (currentState && !finalPreviewPlaying && !finalVideoExportInProgress) {
        void playFinalPreview({ resetVideo: false });
        return;
      }
      renderFinalVideoOverlayPreview(1);
    });
    sourceVideoPreview.addEventListener('seeked', () => {
      updateStep2VideoFrameBackground();
      renderFinalVideoOverlayPreview(1);
    });
  }
  if (playFinalPreviewBtn) {
    playFinalPreviewBtn.addEventListener('click', () => {
      void playFinalPreview();
    });
  }
  if (renderFinalVideoBtn) {
    renderFinalVideoBtn.addEventListener('click', () => {
      void exportFinalVideo();
    });
  }
  if (animDurationInput) {
    animDurationInput.addEventListener('input', () => {
      if (animDurationOutput) animDurationOutput.textContent = animDurationInput.value;
      renderFinalVideoOverlayPreview(1);
      schedulePersistSettings();
    });
  }
  if (animFpsSelect) {
    animFpsSelect.addEventListener('change', () => schedulePersistSettings());
  }
  if (finalOverlayScaleInput) {
    finalOverlayScaleInput.addEventListener('input', () => {
      if (finalOverlayScaleOutput) finalOverlayScaleOutput.textContent = finalOverlayScaleInput.value;
      renderFinalVideoOverlayPreview(1);
      schedulePersistSettings();
    });
  }
  [finalOverlayOffsetXInput, finalOverlayOffsetYInput, finalAnimationStartInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      renderFinalVideoOverlayPreview(1);
      schedulePersistSettings();
    });
  });
  if (finalAnimationStartInput) {
    finalAnimationStartInput.addEventListener('change', () => {
      finalAnimationStartInput.value = clampFinalAnimationStart(finalAnimationStartInput.value).toFixed(1);
      schedulePersistSettings();
    });
  }

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => resetSettingsToDefaults());
  }

  resetBtn.addEventListener('click', () => {
    stopRouteAnimPlayback();
    stopFinalPreviewPlayback();
    invalidateRoutePathCache();
    currentState = null;
    clearFinalVideoResult();
    results.hidden = true;
    clearError();
    titleInput.value = '';
    waypointList.textContent = '';
    waypointCounter = 0;
    refreshWorkflowOutputs();
    updateSampleButtonVisibility();
    schedulePersistSettings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  [titleInput].forEach((input) => input.addEventListener('input', () => {
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  }));

  labelFontSelect.addEventListener('change', async () => {
    const controls = getPosterControls();
    if (document.fonts && controls.labelFontKey !== 'georgia') {
      await document.fonts.load(`${controls.labelSize}px ${controls.labelFontFamily}`).catch(() => {});
    }
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  });

  labelSizeInput.addEventListener('input', () => {
    labelSizeOutput.textContent = labelSizeInput.value;
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  });

  lineWidthInput.addEventListener('input', () => {
    lineWidthOutput.textContent = lineWidthInput.value;
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  });

  pointScaleInput.addEventListener('input', () => {
    pointScaleOutput.textContent = pointScaleInput.value;
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  });

  minDistanceInput.addEventListener('input', () => {
    minDistanceOutput.textContent = minDistanceInput.value;
    if (currentState) updateThinning();
    else refreshWorkflowOutputs();
    schedulePersistSettings();
  });

  addWaypointBtn.addEventListener('click', () => {
    addWaypointRow();
    schedulePersistSettings();
  });

  waypointList.addEventListener('input', (e) => {
    if (e.target.matches('.waypoint-name, .waypoint-distance, .waypoint-offset-x, .waypoint-offset-y')) {
      if (currentState) {
        render();
        renderStep2AnimPreview(1);
      } else refreshWorkflowOutputs();
      schedulePersistSettings();
    }
  });

  waypointList.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-waypoint');
    if (!btn) return;
    btn.closest('.waypoint-row').remove();
    if (currentState) {
      render();
      renderStep2AnimPreview(1);
    } else refreshWorkflowOutputs();
    schedulePersistSettings();
  });

  trackColorInput?.addEventListener('change', () => {
    setTrackColor(trackColorInput.value);
  });

  initWorkflowSections();
  initTrackColorPicker();
  if (IS_VIDEO_CONTEXT) {
    restoreStoredSettings();
  } else {
    applyDefaultSettings({ skipRender: true });
  }
  updateStep2Controls();
  updateStep3Controls();
  updateFinalVideoControls();
  updateSampleButtonVisibility();
  renderStep2AnimPreview(1);
  renderFinalVideoOverlayPreview(1);
  if (IS_VIDEO_CONTEXT) {
    void loadSourceVideoFromFiles().then((loadedFromQuery) => {
      if (!loadedFromQuery) return restoreStoredSourceVideo();
      return null;
    });
  }
  if (!IS_VIDEO_CONTEXT) {
    void loadSampleTrack({
      quiet: true,
      applyDemoContent: true,
      preserveWaypoints: false,
    });
  }
})();
