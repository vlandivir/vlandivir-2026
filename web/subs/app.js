const SF = window.SubsFonts;
const DB_NAME = SF.DB_NAME;
const VIDEO_STORE = SF.VIDEO_STORE;
const STYLE_STORE = SF.STYLE_STORE;
const CUE_STORE = SF.CUE_STORE;
const POSITION_STORE = SF.POSITION_STORE;
const MAX_UPLOAD_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
const REQUIRED_UPLOAD_VIDEO_WIDTH = 1080;
const REQUIRED_UPLOAD_VIDEO_HEIGHT = 1920;
const ASS_PLAY_RES_X = 1080;
const ASS_PLAY_RES_Y = 1920;
const DEFAULT_STRETCH_MARGIN = 80;
const IS_EN = document.documentElement.lang?.startsWith('en');
const NAME_COLLATOR = new Intl.Collator(IS_EN ? 'en' : 'ru', {
  numeric: true,
  sensitivity: 'base',
});
const TEXT = IS_EN
  ? {
      bottomCenter: 'Bottom center',
      bottomLeft: 'Bottom left',
      topCenter: 'Top center',
      middleCenter: 'Center',
      chooseFonts: 'Choose fonts on /font',
      noWaveform: 'Waveform unavailable',
      audioFirst: 'Extract audio first.',
      transcriptNotRun: 'Transcription has not been run yet.',
      edited: 'edited',
      recognized: 'Transcribed',
      words: 'words',
      audioReady: 'Audio ready',
      audioNotExtracted: 'Audio has not been extracted yet.',
      openFile: 'Open file',
      archive: 'Archive',
      doNotDraw: 'Do not draw',
      chooseColor: 'Choose color',
      shade: 'Shade',
      whiteAndBlack: 'white and black',
      styleDeleted: 'Style deleted',
      addStyle: 'Add style',
      addCue: 'Add cue',
      addPosition: 'Add position',
      saveStyle: 'Save style',
      saveCue: 'Save cue',
      savePosition: 'Save position',
      noCueAtCurrentTime: 'No cue at the current time',
      loadVideoForPreview: 'Upload video for preview',
      addCuesForPreview: 'Add cues for preview',
      pickVideoColor: 'Pick color',
      pickVideoColorActive: 'Move over the video to pick a color',
      pickVideoColorFailed: 'Could not read this video frame.',
      jassubLoading: 'JASSUB is loading renderer...',
      jassubFailed: 'JASSUB failed to render subtitles',
      addCues: 'Add cues.',
      addVideoAndCues: 'Add a video and cues.',
      readyToRender: 'Ready to render.',
      video: 'Video',
      done: 'Done',
      uploading: 'Uploading',
      preparingUpload: 'Preparing upload...',
      uploadFailed: 'Failed to upload video',
      importingSourceVideo: 'Importing video from files...',
      importSourceVideoFailed: 'Failed to import video from files.',
      sourceVideoNotFound: 'Video was not found in files.',
      sourceVideoUnavailable:
        'This video can only be opened from its original page.',
      extractAudio: 'Extracting audio on backend...',
      extractAudioFailed: 'Failed to extract audio',
      transcribing: 'Transcribing speech on backend...',
      transcribeFailed: 'Failed to transcribe speech',
      translationLanguage: 'Translation language',
      translateText: 'Translate text',
      translating: 'Translating text on backend...',
      translateFailed: 'Failed to translate text',
      translated: 'Translated',
      targetLanguageRequired: 'Choose a translation language.',
      saved: 'Saved',
      chooseCueStyle: 'Choose a cue style.',
      noWordLines: 'No lines in “00.00 word” format.',
      noSentenceLines: 'No sentence lines.',
      timingsSet: 'Timings set',
      cuesCreated: 'Cues created',
      rendering: 'Burning subtitles on backend...',
      renderFailed: 'Failed to burn subtitles',
      linkFetchFailed: 'Failed to fetch data for this link.',
      videoName: 'Video',
      fileMeta: '',
      videoTooLarge: 'Video must be 200 MB or smaller.',
      videoWrongDimensions:
        'Video must be vertical 1080p: 1080×1920 px. Selected video is {width}×{height} px.',
      videoMetadataFailed: 'Could not read video dimensions.',
      loadingError: 'IndexedDB error',
      editPosition: 'Edit position',
      editStyle: 'Edit style',
      editCue: 'Edit cue',
      deleteCue: 'Delete cue',
      deleteAllCuesConfirm:
        'Delete all cues for this video? This cannot be undone.',
      cueOverrides: 'overrides',
      cueFontOverride: 'font',
      cueColorOverride: 'color',
      cueSizeOverride: 'ASS size',
      cueVariantOverride: 'variant',
      cueLineSpacingOverride: 'line spacing',
      cueStretchOverride: 'stretch',
      cueStretchOn: 'yes',
      cueStretchOff: 'no',
      cueStretchMargin: 'margins',
      cueSecondaryColorOverride: 'secondary',
      cueOutlineColorOverride: 'outline',
      cueBackColorOverride: 'back',
      cueBadgeColorOverride: 'badge',
      cueBadgePaddingOverride: 'badge padding',
      cueBadgeRadiusOverride: 'radius',
      cueBoxColorOverride: 'box',
      cueBoxPaddingOverride: 'box padding',
      cuePositionOverride: 'position',
      stretchMeta: 'stretch',
      fromStyle: 'From style',
      colorNone: 'none',
      pause: 'Pause',
      play: 'Play',
      unmute: 'Unmute',
      mute: 'Mute',
      alignment: 'Alignment',
      cancel: 'Cancel',
      timelineTitle: 'Horizontal timeline',
      scaleLabel: 'Scale',
      scaleAria: 'Timeline scale',
      timelineAria: 'Cue timeline',
      fitWidth: 'Fit width',
      secondsSuffix: 's',
      previewBadge: 'Badge',
      previewBox: 'Box',
      deleteCueConfirm: 'Delete this cue?',
      assImportNoStyles: 'No “Style:” lines found.',
      assImportDone: 'Styles added: {count}',
      assImportUnknownFonts: 'unknown fonts replaced with Montserrat: {fonts}',
    }
  : {
      bottomCenter: 'Снизу по центру',
      bottomLeft: 'Снизу слева',
      topCenter: 'Сверху по центру',
      middleCenter: 'По центру кадра',
      chooseFonts: 'Выберите шрифты на /font',
      noWaveform: 'Waveform недоступен',
      audioFirst: 'Сначала выделите audio.',
      transcriptNotRun: 'Распознавание ещё не запускалось.',
      edited: 'отредактировано',
      recognized: 'Распознано',
      words: 'слов',
      audioReady: 'Audio готово',
      audioNotExtracted: 'Audio ещё не выделено.',
      openFile: 'Открыть файл',
      archive: 'В архив',
      doNotDraw: 'Не рисовать',
      chooseColor: 'Выбрать цвет',
      shade: 'Оттенок',
      whiteAndBlack: 'белый и черный',
      styleDeleted: 'Стиль удален',
      addStyle: 'Добавить стиль',
      addCue: 'Добавить реплику',
      addPosition: 'Добавить позицию',
      saveStyle: 'Сохранить стиль',
      saveCue: 'Сохранить реплику',
      savePosition: 'Сохранить позицию',
      noCueAtCurrentTime: 'На текущем времени нет реплики',
      loadVideoForPreview: 'Загрузите видео для превью',
      addCuesForPreview: 'Добавьте реплики для превью',
      pickVideoColor: 'Пипетка',
      pickVideoColorActive: 'Ведите курсором по видео, чтобы выбрать цвет',
      pickVideoColorFailed: 'Не удалось прочитать этот кадр видео.',
      jassubLoading: 'JASSUB загружает renderer...',
      jassubFailed: 'JASSUB не смог отрендерить субтитры',
      addCues: 'Добавьте реплики.',
      addVideoAndCues: 'Добавьте видео и реплики.',
      readyToRender: 'Готово к рендеру.',
      video: 'Видео',
      done: 'Готово',
      uploading: 'Загрузка',
      preparingUpload: 'Подготовка загрузки...',
      uploadFailed: 'Не удалось загрузить видео',
      importingSourceVideo: 'Импортирую видео из файлов...',
      importSourceVideoFailed: 'Не удалось импортировать видео из файлов.',
      sourceVideoNotFound: 'Видео не найдено в файлах.',
      sourceVideoUnavailable:
        'Это видео можно открыть только с исходной страницы.',
      extractAudio: 'Выделяю audio на backend...',
      extractAudioFailed: 'Не удалось выделить audio',
      transcribing: 'Распознаю речь на backend...',
      transcribeFailed: 'Не удалось распознать речь',
      translationLanguage: 'Язык перевода',
      translateText: 'Перевести текст',
      translating: 'Перевожу текст на backend...',
      translateFailed: 'Не удалось перевести текст',
      translated: 'Переведено',
      targetLanguageRequired: 'Выберите язык перевода.',
      saved: 'Сохранено',
      chooseCueStyle: 'Выберите стиль для реплик.',
      noWordLines: 'Не нашёл строки в формате “00.00 слово”.',
      noSentenceLines: 'Нет строк с предложениями.',
      timingsSet: 'Тайминги расставлены',
      cuesCreated: 'Создано реплик',
      rendering: 'Накладываю субтитры на backend...',
      renderFailed: 'Не удалось наложить субтитры',
      linkFetchFailed: 'Не удалось получить данные по этой ссылке.',
      videoName: 'Видео',
      fileMeta: '',
      videoTooLarge: 'Видео должно быть не больше 200 МБ.',
      videoWrongDimensions:
        'Видео должно быть вертикальным 1080p: 1080×1920 px. Выбранное видео: {width}×{height} px.',
      videoMetadataFailed: 'Не удалось прочитать размеры видео.',
      loadingError: 'Ошибка IndexedDB',
      editPosition: 'Редактировать позицию',
      editStyle: 'Редактировать стиль',
      editCue: 'Редактировать реплику',
      deleteCue: 'Удалить реплику',
      deleteAllCuesConfirm:
        'Удалить все реплики этого видео? Действие нельзя отменить.',
      cueOverrides: 'переопределения',
      cueFontOverride: 'шрифт',
      cueColorOverride: 'цвет',
      cueSizeOverride: 'ASS размер',
      cueVariantOverride: 'начертание',
      cueLineSpacingOverride: 'интервал',
      cueStretchOverride: 'растянуть',
      cueStretchOn: 'да',
      cueStretchOff: 'нет',
      cueStretchMargin: 'поля',
      cueSecondaryColorOverride: 'secondary',
      cueOutlineColorOverride: 'обводка',
      cueBackColorOverride: 'тень',
      cueBadgeColorOverride: 'плашка',
      cueBadgePaddingOverride: 'отступы плашки',
      cueBadgeRadiusOverride: 'скругление',
      cueBoxColorOverride: 'подложка',
      cueBoxPaddingOverride: 'отступ подложки',
      cuePositionOverride: 'позиция',
      stretchMeta: 'растянуть',
      fromStyle: 'Из стиля',
      colorNone: 'нет',
      pause: 'Пауза',
      play: 'Воспроизвести',
      unmute: 'Включить звук',
      mute: 'Выключить звук',
      alignment: 'Выравнивание',
      cancel: 'Отменить',
      timelineTitle: 'Горизонтальный таймлайн',
      scaleLabel: 'Масштаб',
      scaleAria: 'Масштаб таймлайна',
      timelineAria: 'Таймлайн реплик',
      fitWidth: 'По ширине',
      secondsSuffix: 'с',
      previewBadge: 'Плашка',
      previewBox: 'Подложка',
      deleteCueConfirm: 'Удалить эту реплику?',
      assImportNoStyles: 'Не нашёл строки «Style:».',
      assImportDone: 'Добавлено стилей: {count}',
      assImportUnknownFonts:
        'неизвестные шрифты заменены на Montserrat: {fonts}',
    };
const DEFAULT_POSITIONS = [
  {
    id: 'position-bottom-center',
    name: TEXT.bottomCenter,
    x: 540,
    y: 1700,
    alignment: 2,
    legacy: 'bottom-center',
  },
  {
    id: 'position-bottom-left',
    name: TEXT.bottomLeft,
    x: 140,
    y: 1700,
    alignment: 1,
    legacy: 'bottom-left',
  },
  {
    id: 'position-top-center',
    name: TEXT.topCenter,
    x: 540,
    y: 220,
    alignment: 8,
    legacy: 'top-center',
  },
  {
    id: 'position-middle-center',
    name: TEXT.middleCenter,
    x: 540,
    y: 960,
    alignment: 5,
    legacy: 'middle-center',
  },
];
const SUBS_ASSET_BASE_URL = new URL('/subs/', window.location.origin);
const JASSUB_MODULE_URL = new URL(
  'vendor/jassub/jassub.js',
  SUBS_ASSET_BASE_URL,
).href;
const JASSUB_WORKER_URL = new URL(
  'vendor/jassub/worker/worker.js',
  SUBS_ASSET_BASE_URL,
).href;
const JASSUB_WASM_URL = new URL(
  'vendor/jassub/wasm/jassub-worker.wasm',
  SUBS_ASSET_BASE_URL,
).href;
const JASSUB_MODERN_WASM_URL = new URL(
  'vendor/jassub/wasm/jassub-worker-modern.wasm',
  SUBS_ASSET_BASE_URL,
).href;
const SUBS_FONTS_BASE_URL = new URL('fonts/', SUBS_ASSET_BASE_URL);
const JASSUB_DEFAULT_FONT_URL = new URL(
  'vendor/jassub/default.woff2',
  SUBS_ASSET_BASE_URL,
).href;
const STYLE_PREVIEW_TEXT = 'Preview\nПревью Događaj';
const CUE_TIMELINE_PX_PER_SECOND = 30;
const CUE_TIMELINE_MAX_PX_PER_SECOND = 260;
const CUE_TIMELINE_MIN_TICK_GAP = 84;
const CUE_TIMELINE_MIN_WIDTH = 720;
const CUE_TIMELINE_SCALE_HEIGHT = 30;
const CUE_TIMELINE_CLIP_HEIGHT = 48;
const CUE_TIMELINE_LANE_GAP = 8;
const CUE_TIMELINE_PADDING = 9;
const CUE_TIMELINE_TICK_STEPS = [
  0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
];
// Canvas glyph bounds run slightly wider than the same bundled fonts in libass.
const ASS_BADGE_TEXT_METRIC_SCALE = 0.91;
const CUE_TIMELINE_ACCENTS = [
  '#e86f2d',
  '#f08b35',
  '#f3a64c',
  '#d95b25',
  '#efb763',
  '#c94d20',
];

function subsFontUrl(fileName) {
  return new URL(fileName, SUBS_FONTS_BASE_URL).href;
}

const SUBTITLE_FONTS = SF.SUBTITLE_FONTS;
const BUNDLED_FONT_FAMILIES = SF.VALID_FAMILIES;

let enabledFontFamilies = [...SF.DEFAULT_ENABLED_FAMILIES];

function getPickerSubtitleFonts() {
  return SF.getFontsForFamilies(enabledFontFamilies);
}

function getJassubSubtitleFonts() {
  const usedFamilies = [
    ...cachedStyles.map((style) => style.font),
    ...cachedCues.map((cue) => cue.fontOverride),
    ...cachedCues.map((cue) => getStyleById(cue.styleId)?.font),
  ].filter((font) => typeof font === 'string' && font.trim());
  const families = [...new Set([...enabledFontFamilies, ...usedFamilies])];
  return SF.getFontsForFamilies(families);
}

function buildJassubFontConfig() {
  const availableFonts = { 'liberation sans': JASSUB_DEFAULT_FONT_URL };

  for (const font of getJassubSubtitleFonts()) {
    const family = font.family.toLowerCase();
    availableFonts[family] = subsFontUrl(font.regular);
    availableFonts[`${family} bold`] = subsFontUrl(font.bold);
  }

  return {
    availableFonts,
    fonts: [...new Set(Object.values(availableFonts))],
  };
}

async function loadEnabledFontFamilies() {
  enabledFontFamilies = await SF.readEnabledFontFamilies();
}

function populateStyleFontOptions() {
  if (!styleFontInput) return;

  const currentValue = styleFontInput.value;
  const pickerFonts = getPickerSubtitleFonts().sort((a, b) =>
    a.family.localeCompare(b.family, 'ru', { sensitivity: 'base' }),
  );
  styleFontInput.replaceChildren();

  if (pickerFonts.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = TEXT.chooseFonts;
    option.disabled = true;
    option.selected = true;
    styleFontInput.append(option);
    styleFontInput.disabled = true;
    return;
  }

  styleFontInput.disabled = false;

  for (const font of pickerFonts) {
    const option = document.createElement('option');
    option.value = font.family;
    option.textContent = font.family;
    styleFontInput.append(option);
  }

  const hasCurrent = pickerFonts.some((font) => font.family === currentValue);
  const fallback = pickerFonts.some((font) => font.family === 'Montserrat')
    ? 'Montserrat'
    : pickerFonts[0].family;
  styleFontInput.value = hasCurrent ? currentValue : fallback;
}

function populateCueFontOptions() {
  if (!cueFontInput) return;

  const currentValue = cueFontInput.value;
  const pickerFonts = getPickerSubtitleFonts().sort((a, b) =>
    a.family.localeCompare(b.family, 'ru', { sensitivity: 'base' }),
  );
  cueFontInput.replaceChildren();

  const styleOption = document.createElement('option');
  styleOption.value = '';
  styleOption.textContent = cueFontInput.dataset.defaultLabel || 'From style';
  cueFontInput.append(styleOption);

  for (const font of pickerFonts) {
    const option = document.createElement('option');
    option.value = font.family;
    option.textContent = font.family;
    cueFontInput.append(option);
  }

  cueFontInput.value = pickerFonts.some((font) => font.family === currentValue)
    ? currentValue
    : '';
}

async function reloadFontPickerFromDb() {
  const previous = enabledFontFamilies.join('\0');
  await loadEnabledFontFamilies();
  if (previous === enabledFontFamilies.join('\0')) return;

  populateStyleFontOptions();
  populateCueFontOptions();
  await destroyJassubRenderer();
  await renderJassubPreview();
}

const VIDEO_ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7z" /><path d="M13 5h4v14h-4z" /></svg>',
  volume:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 9a4 4 0 0 1 0 6" /></svg>',
  muted:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="m17 9 4 4" /><path d="m21 9-4 4" /></svg>',
};
const EDIT_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
    <path d="m14 7 3 3" />
  </svg>
`;

const form = document.querySelector('#uploadForm');
const input = document.querySelector('#videoInput');
const fileMeta = document.querySelector('#fileMeta');
const uploadButton = document.querySelector('#uploadButton');
const uploadStatus = document.querySelector('#uploadStatus');
const progress = document.querySelector('#uploadProgress');
const progressBar = document.querySelector('#uploadProgressBar');
const linksList = document.querySelector('#linksList');
const emptyState = document.querySelector('#emptyState');
const clearLinksButton = document.querySelector('#clearLinksButton');
const videoBoundPanel = document.querySelector('#videoBoundPanel');
const currentVideoSection = document.querySelector('#currentVideoSection');
const videoStage = document.querySelector('#videoStage');
const currentVideo = document.querySelector('#currentVideo');
const currentVideoMeta = document.querySelector('#currentVideoMeta');
const videoSubtitleOverlay = document.querySelector('#videoSubtitleOverlay');
const safeZoneOverlayToggle = document.querySelector('#safeZoneOverlayToggle');
const reelsSafeZoneOverlay = document.querySelector('#reelsSafeZoneOverlay');
const videoPlayButton = document.querySelector('#videoPlayButton');
const videoSeekInput = document.querySelector('#videoSeekInput');
const videoTimeLabel = document.querySelector('#videoTimeLabel');
const videoMuteButton = document.querySelector('#videoMuteButton');
const videoColorPickerButton = document.querySelector(
  '#videoColorPickerButton',
);
const videoColorPickerResult = document.querySelector(
  '#videoColorPickerResult',
);
const videoColorSwatch = document.querySelector('#videoColorSwatch');
const videoColorInput = document.querySelector('#videoColorInput');
const styleForm = document.querySelector('#styleForm');
const styleNameInput = document.querySelector('#styleNameInput');
const styleLivePreviewText = document.querySelector('#styleLivePreviewText');
const styleLivePreviewMeta = document.querySelector('#styleLivePreviewMeta');
const styleLivePreviewColors = document.querySelector(
  '#styleLivePreviewColors',
);
const styleFontInput = document.querySelector('#styleFontInput');
const styleFontSizeInput = document.querySelector('#styleFontSizeInput');
const styleFontVariantInput = document.querySelector('#styleFontVariantInput');
const styleLineSpacingInput = document.querySelector('#styleLineSpacingInput');
const stylePrimaryColorInput = document.querySelector(
  '#stylePrimaryColorInput',
);
const styleSecondaryColorInput = document.querySelector(
  '#styleSecondaryColorInput',
);
const styleOutlineColorInput = document.querySelector(
  '#styleOutlineColorInput',
);
const styleBackColorInput = document.querySelector('#styleBackColorInput');
const styleBadgeColorInput = document.querySelector('#styleBadgeColorInput');
const styleBadgePaddingXInput = document.querySelector(
  '#styleBadgePaddingXInput',
);
const styleBadgePaddingYInput = document.querySelector(
  '#styleBadgePaddingYInput',
);
const styleBadgeRadiusInput = document.querySelector('#styleBadgeRadiusInput');
const styleBoxColorInput = document.querySelector('#styleBoxColorInput');
const styleBoxPaddingInput = document.querySelector('#styleBoxPaddingInput');
const styleStretchToWidthInput = document.querySelector(
  '#styleStretchToWidthInput',
);
const styleMarginLeftInput = document.querySelector('#styleMarginLeftInput');
const styleMarginRightInput = document.querySelector('#styleMarginRightInput');
const stylePositionInput = document.querySelector('#stylePositionInput');
const styleSubmitButton = document.querySelector('#styleSubmitButton');
const newStyleButton = document.querySelector('#newStyleButton');
const cancelStyleEditButton = document.querySelector('#cancelStyleEditButton');
const styleList = document.querySelector('#styleList');
const stylesEmptyState = document.querySelector('#stylesEmptyState');
const styleAssImportInput = document.querySelector('#styleAssImportInput');
const importStyleAssButton = document.querySelector('#importStyleAssButton');
const styleAssImportStatus = document.querySelector('#styleAssImportStatus');
const positionForm = document.querySelector('#positionForm');
const positionNameInput = document.querySelector('#positionNameInput');
const positionXInput = document.querySelector('#positionXInput');
const positionYInput = document.querySelector('#positionYInput');
const positionAlignmentInput = document.querySelector(
  '#positionAlignmentInput',
);
const alignControlButtons = document.querySelectorAll('[data-align-cell]');
const positionSubmitButton = document.querySelector('#positionSubmitButton');
const newPositionButton = document.querySelector('#newPositionButton');
const cancelPositionEditButton = document.querySelector(
  '#cancelPositionEditButton',
);
const positionList = document.querySelector('#positionList');
const positionsEmptyState = document.querySelector('#positionsEmptyState');
const cueForm = document.querySelector('#cueForm');
const cueTextInput = document.querySelector('#cueTextInput');
const cueStartInput = document.querySelector('#cueStartInput');
const cueEndInput = document.querySelector('#cueEndInput');
const cueStyleInput = document.querySelector('#cueStyleInput');
const cueFontInput = document.querySelector('#cueFontInput');
const cueColorInput = document.querySelector('#cueColorInput');
const cueFontSizeInput = document.querySelector('#cueFontSizeInput');
const cueFontVariantInput = document.querySelector('#cueFontVariantInput');
const cueLineSpacingInput = document.querySelector('#cueLineSpacingInput');
const cueStretchToWidthInput = document.querySelector(
  '#cueStretchToWidthInput',
);
const cueMarginLeftInput = document.querySelector('#cueMarginLeftInput');
const cueMarginRightInput = document.querySelector('#cueMarginRightInput');
const cueSecondaryColorInput = document.querySelector(
  '#cueSecondaryColorInput',
);
const cueOutlineColorInput = document.querySelector('#cueOutlineColorInput');
const cueBackColorInput = document.querySelector('#cueBackColorInput');
const cueBadgeColorInput = document.querySelector('#cueBadgeColorInput');
const cueBadgePaddingXInput = document.querySelector('#cueBadgePaddingXInput');
const cueBadgePaddingYInput = document.querySelector('#cueBadgePaddingYInput');
const cueBadgeRadiusInput = document.querySelector('#cueBadgeRadiusInput');
const cueBoxColorInput = document.querySelector('#cueBoxColorInput');
const cueBoxPaddingInput = document.querySelector('#cueBoxPaddingInput');
const cuePositionInput = document.querySelector('#cuePositionInput');
const cueMotionDxInput = document.querySelector('#cueMotionDxInput');
const cueMotionDyInput = document.querySelector('#cueMotionDyInput');
const cueMotionStartMsInput = document.querySelector('#cueMotionStartMsInput');
const cueMotionMsInput = document.querySelector('#cueMotionMsInput');
const cueSubmitButton = document.querySelector('#cueSubmitButton');
const newCueButton = document.querySelector('#newCueButton');
const cancelCueEditButton = document.querySelector('#cancelCueEditButton');
const closeCueEditorButton = document.querySelector('#closeCueEditorButton');
const deleteCueButton = document.querySelector('#deleteCueButton');
const deleteAllCuesButton = document.querySelector('#deleteAllCuesButton');
const cueList = document.querySelector('#cueList');
const cuesEmptyState = document.querySelector('#cuesEmptyState');
const cueTimelineCard = document.querySelector('#cueTimelineCard');
const previewMeta = document.querySelector('#previewMeta');
const assOutput = document.querySelector('#assOutput');
const downloadAssButton = document.querySelector('#downloadAssButton');
const resetAssButton = document.querySelector('#resetAssButton');
const refreshPreviewButton = document.querySelector('#refreshPreviewButton');
const audioPanel = document.querySelector('#audioPanel');
const extractAudioButton = document.querySelector('#extractAudioButton');
const audioStatus = document.querySelector('#audioStatus');
const audioWaveformWrap = document.querySelector('#audioWaveformWrap');
const audioWaveformCanvas = document.querySelector('#audioWaveformCanvas');
const audioPlayer = document.querySelector('#audioPlayer');
const transcriptionPanel = document.querySelector('#transcriptionPanel');
const transcriptionLanguageInput = document.querySelector(
  '#transcriptionLanguageInput',
);
const transcribeAudioButton = document.querySelector('#transcribeAudioButton');
const transcriptionStatus = document.querySelector('#transcriptionStatus');
const transcriptionOutput = document.querySelector('#transcriptionOutput');
const transcriptionOutputsGrid = document.querySelector(
  '#transcriptionOutputsGrid',
);
const transcriptionSentencesOutput = document.querySelector(
  '#transcriptionSentencesOutput',
);
const setSentenceTimingsButton = document.querySelector(
  '#setSentenceTimingsButton',
);
const saveTranscriptionButton = document.querySelector(
  '#saveTranscriptionButton',
);
const transcriptionTranslationPanel = document.querySelector(
  '#transcriptionTranslationPanel',
);
const translationLanguageInput = document.querySelector(
  '#translationLanguageInput',
);
const translateTranscriptionButton = document.querySelector(
  '#translateTranscriptionButton',
);
const transcriptionToCuesPanel = document.querySelector(
  '#transcriptionToCuesPanel',
);
const transcriptionCueStyleInput = document.querySelector(
  '#transcriptionCueStyleInput',
);
const createCuesFromTranscriptionButton = document.querySelector(
  '#createCuesFromTranscriptionButton',
);
const ffmpegCommandExample = document.querySelector('#ffmpegCommandExample');
const renderSubtitledVideoButton = document.querySelector(
  '#renderSubtitledVideoButton',
);
const renderSubtitledVideoSpinner = document.querySelector(
  '#renderSubtitledVideoSpinner',
);
const renderedVideoResult = document.querySelector('#renderedVideoResult');
const renderedVideoLink = document.querySelector('#renderedVideoLink');
const renderedVideoDownloadLink = document.querySelector(
  '#renderedVideoDownloadLink',
);
const renderSubtitledVideoStatus = document.querySelector(
  '#renderSubtitledVideoStatus',
);

let cachedStyles = [];
let cachedCues = [];
let cachedPositions = [];
const cachedRenderedVideos = new Map();
const stylesById = new Map();
const positionsById = new Map();
let jassubModulePromise;
let jassubRenderer;
let jassubTrack = '';
let jassubRenderToken = 0;
let useDomSubtitleFallback = false;
let editingStyleId;
let editingCueId;
let editingPositionId;
let cueEditorOpen = true;
let cueEditorDock;
let cueTimelineScaleInput;
let cueTimelineScaleOutput;
let addCueButton;
let cueTimelineZoom = 0;
let currentVideoHash = null;
let assOutputManuallyEdited = false;
let assOutputVideoHash = null;
let currentAudioWaveform = [];
let audioAnimationFrame = null;
let uploadValidationToken = 0;
let isVideoColorPicking = false;
let activeTranscriptOutputKey = null;
let activeTranscriptOutputLanguage = null;
const videoColorSampleCanvas = document.createElement('canvas');
videoColorSampleCanvas.width = 1;
videoColorSampleCanvas.height = 1;
const subtitleMeasureCanvas = document.createElement('canvas');
const subtitleMeasureContext = subtitleMeasureCanvas.getContext('2d');

function initExperimentalCueWorkbench() {
  const workbench = cueTimelineCard?.closest('.video-bound-grid');
  if (!workbench || !cueTimelineCard || !currentVideoSection) return;

  const timelineHead = document.createElement('div');
  timelineHead.className = 'cue-timeline__head';

  const timelineCopy = document.createElement('div');
  timelineCopy.className = 'cue-timeline__copy';
  const title = document.createElement('h3');
  title.textContent = TEXT.timelineTitle;
  const scaleControl = document.createElement('label');
  scaleControl.className = 'cue-timeline__scale-control';
  const scaleLabel = document.createElement('span');
  scaleLabel.textContent = TEXT.scaleLabel;
  cueTimelineScaleInput = document.createElement('input');
  cueTimelineScaleInput.type = 'range';
  cueTimelineScaleInput.min = '0';
  cueTimelineScaleInput.max = '100';
  cueTimelineScaleInput.step = '1';
  cueTimelineScaleInput.value = String(cueTimelineZoom);
  cueTimelineScaleInput.setAttribute('aria-label', TEXT.scaleAria);
  cueTimelineScaleOutput = document.createElement('output');
  cueTimelineScaleOutput.className = 'cue-timeline__scale-output';
  cueTimelineScaleInput.addEventListener('input', () => {
    cueTimelineZoom = Number(cueTimelineScaleInput.value) || 0;
    const scrollContainer = cueList.closest('.cue-timeline-scroll');
    if (scrollContainer && isCueTimelineFitMode()) {
      scrollContainer.scrollLeft = 0;
    }
    syncCueTimelineScaleControl();
    renderCues();
  });
  scaleControl.append(scaleLabel, cueTimelineScaleInput, cueTimelineScaleOutput);
  timelineCopy.append(title, scaleControl);

  addCueButton = document.createElement('button');
  addCueButton.className = 'primary-link cue-timeline__add';
  addCueButton.type = 'button';
  addCueButton.textContent = TEXT.addCue;
  addCueButton.addEventListener('click', openNewCueEditor);
  timelineHead.append(timelineCopy, addCueButton);

  cueEditorDock = document.createElement('div');
  cueEditorDock.className = 'cue-editor-dock cue-workbench__editor';
  cueEditorDock.hidden = false;
  cueEditorDock.append(cueForm);
  cueForm.hidden = false;
  if (closeCueEditorButton) closeCueEditorButton.hidden = true;

  const timelineScroll = document.createElement('div');
  timelineScroll.className = 'cue-timeline-scroll';
  timelineScroll.setAttribute('aria-label', TEXT.timelineAria);
  timelineScroll.append(cueList);
  cueList.classList.add('cue-timeline');
  cueTimelineCard.classList.add('cue-workbench__timeline');
  cueTimelineCard.replaceChildren(timelineHead, timelineScroll, cuesEmptyState);

  const previewPanel = document.createElement('aside');
  previewPanel.className = 'cue-workbench__preview';
  currentVideoSection.classList.add('current-video--timeline');
  previewPanel.append(currentVideoSection);

  workbench.classList.add('cue-workbench');
  workbench.replaceChildren(cueTimelineCard, cueEditorDock, previewPanel);
  syncCueTimelineScaleControl();
}

function openDb() {
  return SF.openDb();
}

async function readStore(storeName) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putRecord(storeName, record) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteRecord(storeName, id) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function clearStore(storeName) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readVideos() {
  return SF.readActiveVideos();
}

async function saveVideo(video) {
  const now = new Date().toISOString();
  const existing = video.hash ? await SF.getVideoByHash(video.hash) : null;
  return SF.putVideo({
    ...existing,
    ...video,
    createdAt: video.createdAt || existing?.createdAt || now,
    updatedAt: now,
    archivedAt:
      video.archivedAt !== undefined ? video.archivedAt : existing?.archivedAt,
  });
}

async function touchCurrentVideoUpdated() {
  if (!currentVideoHash) return;
  await SF.touchVideoUpdatedAt(currentVideoHash);
}

function compareRecordsByName(a, b) {
  return (
    NAME_COLLATOR.compare(String(a.name || ''), String(b.name || '')) ||
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''))
  );
}

async function readStyles() {
  return (await SF.readActiveStyles()).sort(compareRecordsByName);
}

async function saveStyle(style) {
  const now = new Date().toISOString();
  const existing = style.id ? await SF.getStyleById(style.id) : null;
  return SF.putStyle({
    ...existing,
    ...style,
    createdAt: style.createdAt || existing?.createdAt || now,
    updatedAt: now,
    archivedAt:
      style.archivedAt !== undefined ? style.archivedAt : existing?.archivedAt,
  });
}

async function archiveStyle(id) {
  return SF.archiveStyleById(id);
}

async function readPositions() {
  return (await SF.readActivePositions()).sort(compareRecordsByName);
}

async function savePosition(position) {
  const now = new Date().toISOString();
  const existing = position.id ? await SF.getPositionById(position.id) : null;
  return SF.putPosition({
    ...existing,
    ...position,
    createdAt: position.createdAt || existing?.createdAt || now,
    updatedAt: now,
    archivedAt:
      position.archivedAt !== undefined
        ? position.archivedAt
        : existing?.archivedAt,
  });
}

async function archivePosition(id) {
  return SF.archivePositionById(id);
}

async function reloadStylePositionLookups() {
  stylesById.clear();
  positionsById.clear();
  for (const style of await SF.readAllStyles()) {
    stylesById.set(style.id, style);
  }
  for (const position of await SF.readAllPositions()) {
    positionsById.set(position.id, position);
  }
}

function sortCuesByStart(cues) {
  return cues
    .map((cue, sourceIndex) => ({ cue, sourceIndex }))
    .sort((a, b) => {
      const aStart = parseTimeToSeconds(a.cue.start);
      const bStart = parseTimeToSeconds(b.cue.start);
      return (
        (Number.isFinite(aStart) ? aStart : 0) -
          (Number.isFinite(bStart) ? bStart : 0) ||
        String(a.cue.createdAt || '').localeCompare(
          String(b.cue.createdAt || ''),
        ) ||
        a.sourceIndex - b.sourceIndex
      );
    })
    .map(({ cue }) => cue);
}

function isCueTimelineFitMode() {
  return cueTimelineZoom <= 0;
}

function currentCueTimelinePxPerSecond() {
  if (isCueTimelineFitMode()) return CUE_TIMELINE_PX_PER_SECOND;

  const progress = Math.min(1, Math.max(0, cueTimelineZoom / 100));
  return Math.round(
    CUE_TIMELINE_PX_PER_SECOND +
      (CUE_TIMELINE_MAX_PX_PER_SECOND - CUE_TIMELINE_PX_PER_SECOND) *
        progress,
  );
}

function syncCueTimelineScaleControl() {
  if (!cueTimelineScaleOutput) return;

  cueTimelineScaleOutput.textContent = isCueTimelineFitMode()
    ? TEXT.fitWidth
    : `${currentCueTimelinePxPerSecond()} px/${TEXT.secondsSuffix}`;
}

function cueTimelinePointPosition(seconds, layout) {
  const safeSeconds = Math.max(0, Math.min(seconds, layout.duration));
  if (isCueTimelineFitMode()) {
    return `${(safeSeconds / Math.max(layout.duration, 1)) * 100}%`;
  }

  return `${Math.round(safeSeconds * currentCueTimelinePxPerSecond())}px`;
}

function cueTimelineTickInterval(layout) {
  const scrollWidth =
    cueList?.closest('.cue-timeline-scroll')?.clientWidth ||
    CUE_TIMELINE_MIN_WIDTH;
  const timelineWidth = isCueTimelineFitMode()
    ? scrollWidth
    : Math.max(
        CUE_TIMELINE_MIN_WIDTH,
        Math.ceil(layout.duration * currentCueTimelinePxPerSecond()),
      );
  const desiredTickSeconds =
    layout.duration /
    Math.max(2, Math.floor(timelineWidth / CUE_TIMELINE_MIN_TICK_GAP));
  return (
    CUE_TIMELINE_TICK_STEPS.find((step) => step >= desiredTickSeconds) ||
    CUE_TIMELINE_TICK_STEPS.at(-1)
  );
}

function formatCueTimelineTickLabel(seconds, step) {
  if (step < 1 && seconds < 60) {
    return `${Number(seconds.toFixed(2)).toString()}${TEXT.secondsSuffix}`;
  }

  return formatVideoTime(seconds);
}

function createCueTimelineScale(layout) {
  const scale = document.createElement('div');
  scale.className = 'cue-timeline__scale';
  scale.setAttribute('aria-hidden', 'true');

  const step = cueTimelineTickInterval(layout);
  const tickCount = Math.floor(layout.duration / step);
  for (let index = 0; index <= tickCount; index += 1) {
    const seconds = index * step;
    const tick = document.createElement('span');
    tick.className = 'cue-timeline__tick';
    if (seconds >= layout.duration) {
      tick.classList.add('cue-timeline__tick--end');
    }
    tick.style.left = cueTimelinePointPosition(seconds, layout);

    const label = document.createElement('span');
    label.className = 'cue-timeline__tick-label';
    label.textContent = formatCueTimelineTickLabel(seconds, step);
    tick.append(label);
    scale.append(tick);
  }

  if (tickCount * step < layout.duration) {
    const tick = document.createElement('span');
    tick.className = 'cue-timeline__tick cue-timeline__tick--end';
    tick.style.left = cueTimelinePointPosition(layout.duration, layout);

    const label = document.createElement('span');
    label.className = 'cue-timeline__tick-label';
    label.textContent = formatCueTimelineTickLabel(layout.duration, step);
    tick.append(label);
    scale.append(tick);
  }

  return scale;
}

function buildCueTimelineLayout(cues) {
  const intervals = sortCuesByStart(cues).map((cue, order) => {
    const parsedStart = parseTimeToSeconds(cue.start);
    const parsedEnd = parseTimeToSeconds(cue.end);
    const start = Number.isFinite(parsedStart) ? Math.max(0, parsedStart) : 0;
    const end =
      Number.isFinite(parsedEnd) && parsedEnd > start
        ? parsedEnd
        : start + 1;
    return { cue, order, start, end };
  });
  const groups = [];

  for (const interval of intervals) {
    const occupancyEnd =
      interval.end > interval.start ? interval.end : interval.start + 0.001;
    const currentGroup = groups.at(-1);
    if (!currentGroup || interval.start >= currentGroup.end) {
      groups.push({ end: occupancyEnd, intervals: [interval] });
    } else {
      currentGroup.end = Math.max(currentGroup.end, occupancyEnd);
      currentGroup.intervals.push(interval);
    }
  }

  const entries = groups.flatMap((group) => {
    const laneEnds = [];
    const groupEntries = group.intervals.map((interval) => {
      const occupancyEnd =
        interval.end > interval.start ? interval.end : interval.start + 0.001;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= interval.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = occupancyEnd;
      return { ...interval, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);

    return groupEntries.map((entry) => ({
      ...entry,
      laneCount,
    }));
  });
  const maxEnd = intervals.reduce((max, interval) => Math.max(max, interval.end), 0);
  const videoDuration =
    currentVideo && Number.isFinite(currentVideo.duration)
      ? currentVideo.duration
      : 0;
  const duration = Math.max(videoDuration, maxEnd, 1);
  const laneCount = entries.reduce(
    (max, entry) => Math.max(max, entry.lane + 1),
    1,
  );
  const height =
    CUE_TIMELINE_SCALE_HEIGHT +
    CUE_TIMELINE_PADDING * 2 +
    laneCount * CUE_TIMELINE_CLIP_HEIGHT +
    Math.max(0, laneCount - 1) * CUE_TIMELINE_LANE_GAP;
  const width = isCueTimelineFitMode()
    ? '100%'
    : `${Math.max(
        CUE_TIMELINE_MIN_WIDTH,
        Math.ceil(duration * currentCueTimelinePxPerSecond()),
      )}px`;

  return {
    duration,
    height,
    width,
    entries,
  };
}

function cueTimelineAccent(entry) {
  return CUE_TIMELINE_ACCENTS[entry.lane % CUE_TIMELINE_ACCENTS.length];
}

function cueTimelinePlacement(entry, layout) {
  const duration = Math.max(layout.duration, 1);
  if (isCueTimelineFitMode()) {
    return {
      left: `${(entry.start / duration) * 100}%`,
      width: `${Math.max(0.001, ((entry.end - entry.start) / duration) * 100)}%`,
    };
  }

  const pxPerSecond = currentCueTimelinePxPerSecond();
  return {
    left: `${Math.round(entry.start * pxPerSecond)}px`,
    width: `${Math.max(1, Math.round((entry.end - entry.start) * pxPerSecond))}px`,
  };
}

function applyCueTimelineCardGeometry(item, entry, layout, accent) {
  const placement = cueTimelinePlacement(entry, layout);
  const top =
    CUE_TIMELINE_SCALE_HEIGHT +
    CUE_TIMELINE_PADDING +
    entry.lane * (CUE_TIMELINE_CLIP_HEIGHT + CUE_TIMELINE_LANE_GAP);
  item.dataset.cueOrder = String(entry.order);
  item.style.setProperty('--cue-card-top', `${top}px`);
  item.style.setProperty('--cue-card-left', placement.left);
  item.style.setProperty('--cue-card-width', placement.width);
  item.style.setProperty('--cue-card-height', `${CUE_TIMELINE_CLIP_HEIGHT}px`);
  item.style.setProperty('--cue-accent', accent);
}

function updateCueTimelinePlayhead(currentTime = currentVideo?.currentTime || 0) {
  const playhead = cueList?.querySelector('.cue-timeline__playhead');
  if (!playhead) return;

  const layoutDuration = Number(cueList.dataset.timelineDuration) || 1;
  const safeTime = Math.min(Math.max(currentTime, 0), layoutDuration);
  playhead.style.left = cueTimelinePointPosition(safeTime, {
    duration: layoutDuration,
  });
}

async function readCuesForVideo(videoHash) {
  if (!videoHash) return [];

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUE_STORE, 'readonly');
    const store = tx.objectStore(CUE_STORE);

    const finish = (cues) => resolve(sortCuesByStart(cues));

    if (store.indexNames.contains('videoHash')) {
      const request = store.index('videoHash').getAll(videoHash);
      request.onsuccess = () => finish(request.result);
      request.onerror = () => reject(request.error);
      return;
    }

    const request = store.getAll();
    request.onsuccess = () => {
      finish(request.result.filter((cue) => cue.videoHash === videoHash));
    };
    request.onerror = () => reject(request.error);
  });
}

function saveCue(cue) {
  return putRecord(CUE_STORE, cue);
}

function deleteCue(id) {
  return deleteRecord(CUE_STORE, id);
}

async function deleteCuesForVideo(videoHash) {
  if (!videoHash) return;

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CUE_STORE, 'readwrite');
    const store = transaction.objectStore(CUE_STORE);
    const hasVideoHashIndex = store.indexNames.contains('videoHash');
    const request = hasVideoHashIndex
      ? store.index('videoHash').openCursor(IDBKeyRange.only(videoHash))
      : store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      if (hasVideoHashIndex || cursor.value.videoHash === videoHash) {
        cursor.delete();
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSubsPagePath(hash) {
  return IS_EN ? `/subs/en/${hash}` : `/subs/${hash}`;
}

function getAbsoluteSubsPageUrl(hash) {
  return new URL(getSubsPagePath(hash), window.location.origin).href;
}

function getSubsSourceVideoUrl(hash) {
  return `/subs-api/videos/${hash}/source`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unit;
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function rememberUserFile(file) {
  if (!window.UserFilesRegistry?.upsert) return Promise.resolve(null);
  return window.UserFilesRegistry.upsert(file).catch((error) => {
    console.warn('Failed to remember user file', error);
    return null;
  });
}

function describeSubsVideo(video) {
  const parts = [];
  if (video.originalName) parts.push(video.originalName);
  if (video.hash) parts.push(`hash ${video.hash}`);
  if (video.size) parts.push(formatBytes(video.size));
  return parts.join(' · ');
}

function rememberSubsSourceVideo(video) {
  if (!video?.videoUrl) return Promise.resolve(null);
  return rememberUserFile({
    id: `subs:${video.hash}:source`,
    sourceApp: 'subs',
    origin: 'subs-source',
    name: video.originalName || `${TEXT.videoName} ${video.hash}`,
    url: video.videoUrl,
    pageUrl: video.pageUrl,
    mimeType: video.mimeType || 'video',
    size: video.size || 0,
    createdAt: video.createdAt,
    description: `Исходное видео, загруженное на странице Subs. ${describeSubsVideo(video)}`,
  });
}

function rememberSubsAudioFile(hash, audio) {
  if (!hash || !audio?.audioUrl) return Promise.resolve(null);
  return rememberUserFile({
    id: `subs:${hash}:audio`,
    sourceApp: 'subs',
    origin: 'subs-audio',
    name: `${hash}-audio.mp3`,
    url: audio.audioUrl,
    pageUrl: getSubsPagePath(hash),
    mimeType: audio.mimeType || 'audio/mpeg',
    size: audio.size || 0,
    createdAt: audio.createdAt,
    description: `Аудиодорожка, извлеченная из видео ${hash} на странице Subs.`,
  });
}

function rememberSubsRenderedFile(renderedVideo) {
  if (!renderedVideo?.videoUrl) return Promise.resolve(null);
  const hash = renderedVideo.hash || currentVideoHash;
  return rememberUserFile({
    id: `subs:${hash}:render`,
    sourceApp: 'subs',
    origin: 'subs-render',
    name: `${hash}-subtitled.mp4`,
    url: renderedVideo.videoUrl,
    pageUrl: getSubsPagePath(hash),
    mimeType: renderedVideo.mimeType || 'video/mp4',
    size: renderedVideo.size || 0,
    createdAt: renderedVideo.createdAt,
    description: `Финальное видео с наложенными ASS-субтитрами для ${hash}.`,
  });
}

function getSourceFileIdFromQuery() {
  return new URLSearchParams(window.location.search).get('sourceFile');
}

function sourceDownloadPathForRegistryRecord(record) {
  const match = String(record?.id || '').match(
    /^subs:([a-f0-9]{24}):(source|render)$/,
  );
  if (!match) return '';
  const [, hash, kind] = match;
  return kind === 'source'
    ? `/subs-api/videos/${hash}/source/download`
    : `/subs-api/videos/${hash}/render/download`;
}

function fileNameFromRecord(record, fallback) {
  return (
    String(record?.name || fallback || TEXT.videoName).trim() || TEXT.videoName
  );
}

async function registryRecordToVideoFile(record) {
  if (!record) throw new Error(TEXT.sourceVideoNotFound);

  const name = fileNameFromRecord(record, 'source-video.mp4');
  const type =
    record.mimeType && record.mimeType !== 'video'
      ? record.mimeType
      : 'video/mp4';

  if (record.blob) {
    return new File([record.blob], name, {
      type: record.blob.type || type,
      lastModified:
        Date.parse(record.updatedAt || record.createdAt) || Date.now(),
    });
  }

  const downloadPath = sourceDownloadPathForRegistryRecord(record);
  if (!downloadPath) {
    throw new Error(TEXT.sourceVideoUnavailable);
  }

  const response = await fetch(downloadPath);
  if (!response.ok) {
    throw new Error(TEXT.importSourceVideoFailed);
  }

  const blob = await response.blob();
  return new File([blob], name, {
    type: blob.type?.startsWith('video/') ? blob.type : type,
    lastModified:
      Date.parse(record.updatedAt || record.createdAt) || Date.now(),
  });
}

function formatText(template, values) {
  return template.replace(/\{(\w+)}/g, (_match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : '',
  );
}

function readLocalVideoDimensions(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const dimensions = {
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(dimensions);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(TEXT.videoMetadataFailed));
    };
    video.src = url;
  });
}

async function validateUploadVideoFile(file) {
  if (file.size > MAX_UPLOAD_VIDEO_SIZE_BYTES) {
    throw new Error(TEXT.videoTooLarge);
  }

  const dimensions = await readLocalVideoDimensions(file);
  if (
    dimensions.width !== REQUIRED_UPLOAD_VIDEO_WIDTH ||
    dimensions.height !== REQUIRED_UPLOAD_VIDEO_HEIGHT
  ) {
    throw new Error(formatText(TEXT.videoWrongDimensions, dimensions));
  }

  return dimensions;
}

function resizeAudioWaveformCanvas() {
  if (!audioWaveformCanvas) return { width: 0, height: 0 };

  const pixelRatio = window.devicePixelRatio || 1;
  const rect = audioWaveformCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const scaledWidth = Math.round(width * pixelRatio);
  const scaledHeight = Math.round(height * pixelRatio);

  if (
    audioWaveformCanvas.width !== scaledWidth ||
    audioWaveformCanvas.height !== scaledHeight
  ) {
    audioWaveformCanvas.width = scaledWidth;
    audioWaveformCanvas.height = scaledHeight;
  }

  return { width, height, pixelRatio };
}

function drawAudioWaveform(waveform) {
  if (!audioWaveformCanvas) return;

  const context = audioWaveformCanvas.getContext('2d');
  if (!context) return;

  const { width, height, pixelRatio } = resizeAudioWaveformCanvas();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const timelineHeight = 30;
  const waveformTop = timelineHeight + 8;
  const waveformHeight = height - waveformTop - 14;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#172026';
  context.fillRect(0, 0, width, height);

  if (!waveform?.length) {
    context.fillStyle = '#65747b';
    context.font = '600 14px sans-serif';
    context.fillText(TEXT.noWaveform, 18, waveformTop + waveformHeight / 2);
    return;
  }

  const duration = Number.isFinite(audioPlayer?.duration)
    ? audioPlayer.duration
    : 0;
  const currentTime = Number.isFinite(audioPlayer?.currentTime)
    ? audioPlayer.currentTime
    : 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const progressX = Math.round(progress * width);
  const centerY = waveformTop + waveformHeight / 2;
  const barGap = 2;
  const barWidth = Math.max(2, Math.floor(width / waveform.length) - barGap);

  context.strokeStyle = 'rgba(233, 240, 237, 0.22)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, timelineHeight);
  context.lineTo(width, timelineHeight);
  context.stroke();

  const tickCount =
    duration > 0 ? Math.min(8, Math.max(2, Math.ceil(duration / 5))) : 4;
  context.font = '700 11px JetBrains Mono, monospace';
  context.textBaseline = 'top';
  for (let tick = 0; tick <= tickCount; tick += 1) {
    const tickProgress = tick / tickCount;
    const x = Math.round(tickProgress * width);
    const time = duration > 0 ? duration * tickProgress : 0;
    context.strokeStyle = 'rgba(233, 240, 237, 0.3)';
    context.beginPath();
    context.moveTo(x, timelineHeight - 8);
    context.lineTo(x, timelineHeight);
    context.stroke();

    context.fillStyle = '#aab7b2';
    const label = formatVideoTime(time);
    const labelWidth = context.measureText(label).width;
    const labelX = Math.min(
      Math.max(6, x - labelWidth / 2),
      width - labelWidth - 6,
    );
    context.fillText(label, labelX, 7);
  }

  waveform.forEach((peak, index) => {
    const x = Math.round((index / waveform.length) * width);
    const barHeight = Math.max(2, peak * waveformHeight);
    context.fillStyle = x <= progressX ? '#fbbf24' : '#f97316';
    context.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
  });

  context.fillStyle = 'rgba(251, 191, 36, 0.16)';
  context.fillRect(0, waveformTop - 2, progressX, waveformHeight + 4);

  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(progressX, waveformTop - 4);
  context.lineTo(progressX, waveformTop + waveformHeight + 6);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(progressX, waveformTop - 6, 4, 0, Math.PI * 2);
  context.fill();
}

function redrawCurrentAudioWaveform() {
  drawAudioWaveform(currentAudioWaveform);
}

function stopAudioWaveformAnimation() {
  if (!audioAnimationFrame) return;

  cancelAnimationFrame(audioAnimationFrame);
  audioAnimationFrame = null;
}

function animateAudioWaveform() {
  redrawCurrentAudioWaveform();
  if (!audioPlayer.paused && !audioPlayer.ended) {
    audioAnimationFrame = requestAnimationFrame(animateAudioWaveform);
  } else {
    audioAnimationFrame = null;
  }
}

function startAudioWaveformAnimation() {
  if (audioAnimationFrame) return;

  audioAnimationFrame = requestAnimationFrame(animateAudioWaveform);
}

function getSelectedTranscriptionLanguage() {
  return transcriptionLanguageInput?.value || 'auto';
}

function getSelectedTranslationLanguage() {
  return translationLanguageInput?.value || 'en';
}

function getTranscriptOutputKey(language = getSelectedTranscriptionLanguage()) {
  return `${language}Output`;
}

function getTranscriptTranslationOutputKey(
  targetLanguage = getSelectedTranslationLanguage(),
) {
  return `translationOutput_${targetLanguage}`;
}

function getTranscriptSentencesKey(outputKey) {
  return `sentences_${outputKey}`;
}

function stripLineTiming(line) {
  return line.replace(/^\s*\d+\.\d{1,3}\s+/, '').trim();
}

function buildSentencesText(outputText) {
  const plain = (outputText || '')
    .split('\n')
    .map((line) => stripLineTiming(line))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';

  const sentences = plain.match(/[^.!?…]+(?:[.!?…]+["»)\]]*|$)/g) || [plain];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeWordToken(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function setSentenceTimings() {
  const words = parseTranscriptionWords(transcriptionOutput.value);
  if (words.length === 0) {
    transcriptionStatus.textContent = TEXT.noWordLines;
    return;
  }

  const lines = transcriptionSentencesOutput.value
    .split('\n')
    .map((line) => stripLineTiming(line))
    .filter(Boolean);
  if (lines.length === 0) {
    transcriptionStatus.textContent = TEXT.noSentenceLines;
    return;
  }

  let pointer = 0;
  const timedLines = lines.map((text) => {
    const tokens = text.split(/\s+/).map(normalizeWordToken).filter(Boolean);
    let anchor = -1;
    if (tokens[0]) {
      for (let index = pointer; index < words.length; index += 1) {
        if (normalizeWordToken(words[index].word) === tokens[0]) {
          anchor = index;
          break;
        }
      }
    }
    if (anchor === -1) anchor = Math.min(pointer, words.length - 1);
    pointer = anchor + tokens.length;
    return `${formatTranscriptTime(words[anchor].start, 0)} ${text}`;
  });

  transcriptionSentencesOutput.value = timedLines.join('\n');
  transcriptionStatus.textContent = TEXT.timingsSet;
}

function formatTranscriptTime(value, width = 5) {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2).padStart(width, ' ');
}

function formatTranscript(transcript) {
  if (Array.isArray(transcript?.words) && transcript.words.length > 0) {
    const timeWidth = Math.max(
      5,
      ...transcript.words.map(
        (word) => formatTranscriptTime(word.start, 0).length,
      ),
    );
    return transcript.words
      .map(
        (word) => `${formatTranscriptTime(word.start, timeWidth)} ${word.word}`,
      )
      .join('\n');
  }

  if (Array.isArray(transcript?.cues) && transcript.cues.length > 0) {
    return transcript.cues
      .map(
        (cue) =>
          `${formatTranscriptTime(cue.start)} → ${formatTranscriptTime(cue.end)}  ${cue.text}`,
      )
      .join('\n');
  }

  return transcript?.text || '';
}

function setTranscriptionOutputsVisible(visible) {
  transcriptionOutput.hidden = !visible;
  if (transcriptionOutputsGrid) transcriptionOutputsGrid.hidden = !visible;
}

function renderTranscription(video = null) {
  if (!transcriptionPanel) return;

  const hasAudio = Boolean(video?.audioUrl);
  transcriptionPanel.hidden = !hasAudio;
  if (!hasAudio) {
    activeTranscriptOutputKey = null;
    activeTranscriptOutputLanguage = null;
    transcriptionOutput.value = '';
    transcriptionSentencesOutput.value = '';
    setTranscriptionOutputsVisible(false);
    saveTranscriptionButton.hidden = true;
    transcriptionTranslationPanel.hidden = true;
    translateTranscriptionButton.disabled = true;
    transcriptionToCuesPanel.hidden = true;
    transcriptionStatus.textContent = TEXT.audioFirst;
    return;
  }

  transcriptionTranslationPanel.hidden = false;
  translateTranscriptionButton.disabled = true;

  const language = getSelectedTranscriptionLanguage();
  const transcript = video?.transcripts?.[language];
  if (transcript) {
    const sourceOutputKey = getTranscriptOutputKey(language);
    const translationOutputKey = getTranscriptTranslationOutputKey();
    const hasTranslationOutput = Boolean(transcript[translationOutputKey]);
    activeTranscriptOutputKey = hasTranslationOutput
      ? translationOutputKey
      : sourceOutputKey;
    activeTranscriptOutputLanguage = hasTranslationOutput
      ? getSelectedTranslationLanguage()
      : language;
    transcriptionOutput.value =
      transcript[activeTranscriptOutputKey] || formatTranscript(transcript);
    transcriptionSentencesOutput.value =
      transcript[getTranscriptSentencesKey(activeTranscriptOutputKey)] ||
      buildSentencesText(transcriptionOutput.value);
    setTranscriptionOutputsVisible(true);
    saveTranscriptionButton.hidden = false;
    translateTranscriptionButton.disabled = false;
    transcriptionToCuesPanel.hidden = false;
    const editedSuffix =
      !hasTranslationOutput && transcript[sourceOutputKey]
        ? ` · ${TEXT.edited}`
        : '';
    const baseStatus = hasTranslationOutput
      ? `${TEXT.translated} · ${activeTranscriptOutputLanguage}`
      : `${TEXT.recognized} · ${transcript.language} · ${transcript.words?.length || 0} ${TEXT.words}`;
    transcriptionStatus.textContent = `${baseStatus}${editedSuffix}`;
  } else {
    activeTranscriptOutputKey = null;
    activeTranscriptOutputLanguage = null;
    transcriptionOutput.value = '';
    transcriptionSentencesOutput.value = '';
    setTranscriptionOutputsVisible(false);
    saveTranscriptionButton.hidden = true;
    transcriptionToCuesPanel.hidden = true;
    transcriptionStatus.textContent = TEXT.transcriptNotRun;
  }
}

function renderAudioPanel(video = null) {
  if (!audioPanel) return;

  audioPanel.hidden = !currentVideoHash;
  if (!currentVideoHash) return;

  const audioUrl = video?.audioUrl || '';
  const waveform = Array.isArray(video?.waveform) ? video.waveform : [];
  currentAudioWaveform = waveform;

  if (audioUrl) {
    audioStatus.textContent = `${TEXT.audioReady} · ${formatBytes(video.audioSize)} · ${
      video.audioMimeType || 'audio/mpeg'
    }`;
    audioPlayer.src = audioUrl;
    audioPlayer.hidden = false;
    audioWaveformWrap.hidden = false;
    redrawCurrentAudioWaveform();
    renderTranscription(video);
  } else {
    audioStatus.textContent = TEXT.audioNotExtracted;
    stopAudioWaveformAnimation();
    audioPlayer.removeAttribute('src');
    audioPlayer.hidden = true;
    audioWaveformWrap.hidden = true;
    redrawCurrentAudioWaveform();
    renderTranscription(null);
  }
}

function getAudioPatch(audio) {
  if (!audio?.audioUrl) return {};

  return {
    audioUrl: audio.audioUrl,
    audioMimeType: audio.mimeType,
    audioSize: audio.size,
    waveform: audio.waveform,
    audioCreatedAt: audio.createdAt,
  };
}

function renderVideos(videos) {
  if (!linksList || !emptyState || !clearLinksButton) return;

  linksList.replaceChildren();
  emptyState.hidden = videos.length > 0;
  clearLinksButton.hidden = videos.length === 0;

  for (const video of videos) {
    const item = document.createElement('article');
    item.className = 'link-item';

    const title = document.createElement('h3');
    title.textContent = video.originalName || video.hash;

    const meta = document.createElement('p');
    const createdAt = new Date(video.createdAt).toLocaleString(
      IS_EN ? 'en-US' : 'ru-RU',
    );
    meta.textContent = `${createdAt} · ${formatBytes(video.size)} · ${
      video.mimeType || 'video'
    }`;

    const pageLink = document.createElement('a');
    pageLink.className = 'link-item__url';
    pageLink.href = video.pageUrl;
    pageLink.textContent =
      video.absolutePageUrl ||
      new URL(video.pageUrl, window.location.origin).href;

    const actions = document.createElement('div');
    actions.className = 'link-item__actions';

    const videoLink = document.createElement('a');
    videoLink.className = 'secondary-link';
    videoLink.href = video.videoUrl;
    videoLink.target = '_blank';
    videoLink.rel = 'noopener noreferrer';
    videoLink.textContent = TEXT.openFile;

    const archiveButton = document.createElement('button');
    archiveButton.className = 'secondary-link link-item__archive';
    archiveButton.type = 'button';
    archiveButton.textContent = TEXT.archive;
    archiveButton.addEventListener('click', async () => {
      await SF.archiveVideoByHash(video.hash);
      await refreshList();
    });

    actions.append(videoLink, archiveButton);
    item.append(title, meta, pageLink, actions);
    linksList.append(item);
  }
}

function positionLabel(position) {
  if (!position) return TEXT.bottomCenter;
  if (typeof position === 'object')
    return `${position.name} · ${position.x}, ${position.y}`;

  const matchedPosition =
    getPositionById(position) || getPositionByLegacy(position);
  return matchedPosition
    ? `${matchedPosition.name} · ${matchedPosition.x}, ${matchedPosition.y}`
    : position;
}

function getStyleById(id) {
  if (!id) return undefined;
  return stylesById.get(id) || cachedStyles.find((style) => style.id === id);
}

function getPositionById(id) {
  if (!id) return undefined;
  return (
    positionsById.get(id) ||
    cachedPositions.find((position) => position.id === id)
  );
}

function collectStylesForAss() {
  const byId = new Map(cachedStyles.map((style) => [style.id, style]));
  for (const cue of cachedCues) {
    const style = getStyleById(cue.styleId);
    if (style) byId.set(style.id, style);
  }
  return [...byId.values()];
}

function getPositionByLegacy(legacy) {
  return cachedPositions.find((position) => position.legacy === legacy);
}

function defaultPosition() {
  return (
    cachedPositions.find(
      (position) => position.id === DEFAULT_POSITIONS[0].id,
    ) ||
    cachedPositions[0] ||
    DEFAULT_POSITIONS[0]
  );
}

function positionIdForAlignment(alignment) {
  const target = Number(alignment);
  const match = cachedPositions.find(
    (position) => Number(position.alignment) === target,
  );
  return (match || defaultPosition()).id;
}

function parseTimeToSeconds(value) {
  const trimmed = value.trim().replace(',', '.');
  if (/^\d+(?:\.\d{1,3})?$/.test(trimmed)) {
    return Number(trimmed);
  }

  const match = trimmed.match(
    /^(?:(\d+):)?([0-5]?\d):([0-5]?\d(?:\.\d{1,3})?)$/,
  );
  if (!match) return Number.NaN;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatTimeInput(value) {
  const seconds = parseTimeToSeconds(value);
  if (!Number.isFinite(seconds)) return value.trim();

  return Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatAssTime(value) {
  const totalSeconds = parseTimeToSeconds(value);
  if (!Number.isFinite(totalSeconds)) return value.trim();

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function formatVideoTime(value) {
  if (!Number.isFinite(value)) return '0:00';

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function isNoneColor(color) {
  return color === 'none';
}

function clampColorNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseColorChannel(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const isPercent = text.endsWith('%');
  const number = Number.parseFloat(isPercent ? text.slice(0, -1) : text);
  if (!Number.isFinite(number)) return null;
  return Math.round(
    clampColorNumber(isPercent ? (number / 100) * 255 : number, 0, 255),
  );
}

function parseAlphaChannel(value) {
  const text = String(value ?? '').trim();
  if (!text) return 1;
  const isPercent = text.endsWith('%');
  const number = Number.parseFloat(isPercent ? text.slice(0, -1) : text);
  if (!Number.isFinite(number)) return null;
  return clampColorNumber(isPercent ? number / 100 : number, 0, 1);
}

function formatCssAlpha(alpha) {
  return String(Math.round(alpha * 1000) / 1000)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

function parseHexSubtitleColor(value) {
  if (typeof value !== 'string') return null;
  const match = value
    .trim()
    .match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;

  let hex = match[1].toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((character) => character + character).join('');
  }

  const hasAlpha = hex.length === 8;
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hasAlpha ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbSubtitleColor(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^rgba?\((.+)\)$/i);
  if (!match) return null;

  const [colorPart, alphaPart = ''] = match[1]
    .split('/')
    .map((part) => part.trim());
  const components = colorPart.includes(',')
    ? colorPart.split(',').map((part) => part.trim())
    : colorPart.split(/\s+/).filter(Boolean);
  const inlineAlpha = components.length === 4 ? components.pop() : '';
  if (components.length !== 3) return null;

  const red = parseColorChannel(components[0]);
  const green = parseColorChannel(components[1]);
  const blue = parseColorChannel(components[2]);
  const alpha = parseAlphaChannel(alphaPart || inlineAlpha);
  if ([red, green, blue, alpha].some((channel) => channel === null))
    return null;

  return { red, green, blue, alpha };
}

function parseSubtitleColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  if (!color) return null;
  if (color === 'transparent') {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }
  return parseHexSubtitleColor(color) || parseRgbSubtitleColor(color);
}

function colorToHexByte(value) {
  return Math.round(clampColorNumber(value, 0, 255))
    .toString(16)
    .padStart(2, '0');
}

function assAlphaFromCss(alpha) {
  return colorToHexByte((1 - clampColorNumber(alpha ?? 1, 0, 1)) * 255);
}

function formatRgbaSubtitleColor(color) {
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${formatCssAlpha(color.alpha ?? 1)})`;
}

function normalizeSubtitleColor(color, fallback = 'rgba(255, 255, 255, 1)') {
  const parsed = parseSubtitleColor(color);
  if (parsed) return formatRgbaSubtitleColor(parsed);
  const fallbackColor = parseSubtitleColor(fallback);
  return fallbackColor ? formatRgbaSubtitleColor(fallbackColor) : fallback;
}

function normalizeOptionalSubtitleColor(color, fallback) {
  return isNoneColor(color) ? 'none' : normalizeSubtitleColor(color, fallback);
}

function formatSubtitleColor(color) {
  return normalizeSubtitleColor(color, color);
}

function colorToAss(color) {
  if (isNoneColor(color)) return '&HFF000000';

  const parsed = parseSubtitleColor(color) || parseSubtitleColor('#ffffff');
  const red = colorToHexByte(parsed.red);
  const green = colorToHexByte(parsed.green);
  const blue = colorToHexByte(parsed.blue);
  const alpha = assAlphaFromCss(parsed.alpha);
  return `&H${alpha}${blue}${green}${red}`.toUpperCase();
}

// Parse an ASS colour literal (&HAABBGGRR, &HBBGGRR, with optional trailing &,
// or a bare hex/decimal number) back into an { red, green, blue, alpha } object.
// ASS stores alpha inverted (00 = opaque, FF = transparent).
function assColorToRgb(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^&?h?([0-9a-f]{1,8})&?$/i);
  if (!match) return null;
  const hex = match[1].toLowerCase().padStart(8, '0');
  const alphaByte = Number.parseInt(hex.slice(0, 2), 16);
  return {
    blue: Number.parseInt(hex.slice(2, 4), 16),
    green: Number.parseInt(hex.slice(4, 6), 16),
    red: Number.parseInt(hex.slice(6, 8), 16),
    alpha: clampColorNumber(1 - alphaByte / 255, 0, 1),
  };
}

// Convert an ASS colour field to the editor's CSS colour string. When optional,
// a fully transparent colour maps to the "none" sentinel (matches colorToAss).
function assColorField(value, { optional = false } = {}) {
  const parsed = assColorToRgb(value);
  if (!parsed) return optional ? 'none' : null;
  if (optional && parsed.alpha === 0) return 'none';
  return formatRgbaSubtitleColor(parsed);
}

function parseAssBooleanFlag(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0;
}

// Match an ASS Fontname against a bundled family, case-insensitively.
function matchBundledFontFamily(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  for (const family of SF.VALID_FAMILIES) {
    if (family.toLowerCase() === lowered) return family;
  }
  return null;
}

// Parse a single ASS "Style:" line (standard V4+ Styles column order) into a
// raw style draft the editor can store. Returns null for non-Style lines.
function parseAssStyleLine(line) {
  const match = String(line ?? '')
    .trim()
    .match(/^Style:\s*(.+)$/i);
  if (!match) return null;

  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 18) return null;

  const rawFont = parts[1] || '';
  const matchedFont = matchBundledFontFamily(rawFont);
  const fontSize = Math.round(Number(parts[2]));
  const borderStyle = Number(parts[15]);
  const outlineWidth = Number(parts[16]);
  const shadow = Number(parts[17]);
  const alignment = Number(parts[21]);
  const boxOn = borderStyle === 3;

  const fontVariant = parseAssBooleanFlag(parts[7])
    ? 'bold'
    : parseAssBooleanFlag(parts[8])
      ? 'italic'
      : 'regular';

  return {
    name: parts[0] || 'Style',
    font: matchedFont || 'Montserrat',
    fontMatched: Boolean(matchedFont),
    rawFont,
    fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 72,
    fontVariant,
    primaryColor:
      assColorField(parts[3]) || 'rgba(255, 255, 255, 1)',
    secondaryColor: assColorField(parts[4], { optional: true }),
    outlineColor: boxOn
      ? 'none'
      : Number.isFinite(outlineWidth) && outlineWidth > 0
        ? assColorField(parts[5], { optional: true })
        : 'none',
    backColor:
      Number.isFinite(shadow) && shadow > 0
        ? assColorField(parts[6], { optional: true })
        : 'none',
    boxColor: boxOn
      ? assColorField(parts[5]) || 'rgba(0, 0, 0, 1)'
      : 'none',
    boxPadding: boxOn
      ? normalizeStyleBadgeNumber(outlineWidth, 8)
      : 8,
    alignment: Number.isFinite(alignment) ? alignment : 2,
  };
}

function colorToAssPrimaryOverrideTags(color) {
  const parsed = parseSubtitleColor(color);
  if (!parsed) return [];

  const red = colorToHexByte(parsed.red);
  const green = colorToHexByte(parsed.green);
  const blue = colorToHexByte(parsed.blue);
  const alpha = assAlphaFromCss(parsed.alpha).toUpperCase();
  const bgr = `${blue}${green}${red}`.toUpperCase();
  const tags = [`\\c&H${bgr}&`];
  if (alpha !== '00') tags.push(`\\1a&H${alpha}&`);
  return tags;
}

function colorToAssDrawingOverrideTags(color) {
  const parsed = parseSubtitleColor(color) || parseSubtitleColor('#ffffff');
  const red = colorToHexByte(parsed.red);
  const green = colorToHexByte(parsed.green);
  const blue = colorToHexByte(parsed.blue);
  const alpha = assAlphaFromCss(parsed.alpha).toUpperCase();
  const bgr = `${blue}${green}${red}`.toUpperCase();
  return `\\1c&H${bgr}&\\1a&H${alpha}&`;
}

function setColorInputValue(input, value) {
  if (window.VlandivirColorPicker) {
    window.VlandivirColorPicker.setColorInputValue(input, value);
    return;
  }
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function initializeColorPickers() {
  window.VlandivirColorPicker?.initialize({
    text: {
      doNotDraw: TEXT.doNotDraw,
      chooseColor: TEXT.chooseColor,
      shade: TEXT.shade,
      whiteAndBlack: TEXT.whiteAndBlack,
      inherit: TEXT.fromStyle,
    },
  });
}

function escapeAssText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\\N')
    .split('\n')
    .join('\\N');
}

function stripAssMarkup(text) {
  return String(text || '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();
}

function sanitizeAssName(name) {
  return name.replace(/,/g, ' ').trim() || 'Default';
}

function normalizeCueMotion(cue) {
  if (!cue) return null;

  const motionMs = Math.round(Number(cue.motionMs));
  const motionStartMs = Math.max(0, Math.round(Number(cue.motionStartMs) || 0));
  const motionDx = Math.round(Number(cue.motionDx) || 0);
  const motionDy = Math.round(Number(cue.motionDy) || 0);

  if (motionDx === 0 && motionDy === 0) return null;
  if (!Number.isFinite(motionMs) || motionMs <= 0) {
    return { motionDx, motionDy, motionStartMs: 0, motionMs: 0 };
  }

  return { motionDx, motionDy, motionStartMs, motionMs };
}

function readCueMotionFromForm() {
  const motionMs = Math.round(Number(cueMotionMsInput?.value));
  const motionStartMs = Math.max(
    0,
    Math.round(Number(cueMotionStartMsInput?.value) || 0),
  );
  const motionDx = Math.round(Number(cueMotionDxInput?.value) || 0);
  const motionDy = Math.round(Number(cueMotionDyInput?.value) || 0);

  if (motionDx === 0 && motionDy === 0) {
    return {
      motionDx: 0,
      motionDy: 0,
      motionStartMs: 0,
      motionMs: 0,
    };
  }

  if (!Number.isFinite(motionMs) || motionMs <= 0) {
    return {
      motionDx,
      motionDy,
      motionStartMs: 0,
      motionMs: 0,
    };
  }

  return { motionDx, motionDy, motionStartMs, motionMs };
}

function formatCueMotionLabel(cue) {
  const motion = normalizeCueMotion(cue);
  if (!motion) return '';

  if (motion.motionMs <= 0) {
    return ` · pos Δ${motion.motionDx},${motion.motionDy}`;
  }

  const endMs = motion.motionStartMs + motion.motionMs;
  return ` · move Δ${motion.motionDx},${motion.motionDy} ${motion.motionStartMs}→${endMs}ms`;
}

function normalizeCueOverrides(cue) {
  const color = String(cue?.colorOverride || cue?.primaryColor || '').trim();
  const font = String(cue?.fontOverride || '').trim();
  const fontSize = Math.round(Number(cue?.fontSizeOverride));
  const lineSpacing = normalizeLineSpacingValue(cue?.lineSpacingOverride);
  // Legacy cues kept a single symmetric stretchMarginOverride.
  const legacyMargin =
    cue?.marginLeftOverride === undefined &&
    cue?.marginRightOverride === undefined
      ? normalizeOptionalStretchMarginValue(cue?.stretchMarginOverride)
      : null;
  return {
    fontOverride: BUNDLED_FONT_FAMILIES.has(font) ? font : '',
    colorOverride: normalizeSubtitleColor(color, ''),
    fontSizeOverride:
      Number.isFinite(fontSize) && fontSize >= 12 && fontSize <= 260
        ? fontSize
        : 0,
    fontVariantOverride: normalizeCueFontVariantOverride(
      cue?.fontVariantOverride,
    ),
    lineSpacingOverride: Number.isFinite(lineSpacing) ? lineSpacing : 0,
    stretchToWidthOverride: normalizeCueStretchOverride(
      cue?.stretchToWidthOverride,
    ),
    marginLeftOverride:
      normalizeOptionalStretchMarginValue(cue?.marginLeftOverride) ??
      legacyMargin,
    marginRightOverride:
      normalizeOptionalStretchMarginValue(cue?.marginRightOverride) ??
      legacyMargin,
    secondaryColorOverride: normalizeCueColorOverride(
      cue?.secondaryColorOverride,
    ),
    outlineColorOverride: normalizeCueColorOverride(cue?.outlineColorOverride),
    backColorOverride: normalizeCueColorOverride(cue?.backColorOverride),
    badgeColorOverride: normalizeCueColorOverride(cue?.badgeColorOverride),
    badgePaddingXOverride: normalizeOptionalBadgeNumber(
      cue?.badgePaddingXOverride,
    ),
    badgePaddingYOverride: normalizeOptionalBadgeNumber(
      cue?.badgePaddingYOverride,
    ),
    badgeRadiusOverride: normalizeOptionalBadgeNumber(cue?.badgeRadiusOverride),
    boxColorOverride: normalizeCueColorOverride(cue?.boxColorOverride),
    boxPaddingOverride: normalizeOptionalBadgeNumber(cue?.boxPaddingOverride),
    positionIdOverride: String(cue?.positionIdOverride || ''),
  };
}

function readCueOverridesFromForm() {
  return normalizeCueOverrides({
    fontOverride: cueFontInput?.value,
    colorOverride: cueColorInput?.value,
    fontSizeOverride: cueFontSizeInput?.value,
    fontVariantOverride: cueFontVariantInput?.value,
    lineSpacingOverride: cueLineSpacingInput?.value,
    stretchToWidthOverride: cueStretchToWidthInput?.value,
    marginLeftOverride: cueMarginLeftInput?.value,
    marginRightOverride: cueMarginRightInput?.value,
    secondaryColorOverride: cueSecondaryColorInput?.value,
    outlineColorOverride: cueOutlineColorInput?.value,
    backColorOverride: cueBackColorInput?.value,
    badgeColorOverride: cueBadgeColorInput?.value,
    badgePaddingXOverride: cueBadgePaddingXInput?.value,
    badgePaddingYOverride: cueBadgePaddingYInput?.value,
    badgeRadiusOverride: cueBadgeRadiusInput?.value,
    boxColorOverride: cueBoxColorInput?.value,
    boxPaddingOverride: cueBoxPaddingInput?.value,
    positionIdOverride: cuePositionInput?.value,
  });
}

function cueStyleWithOverrides(style, cue) {
  const normalizedStyle = normalizeStyle(style || {});
  const overrides = normalizeCueOverrides(cue);
  const lineSpacingOverride =
    overrides.lineSpacingOverride || normalizedStyle.lineSpacingOverride;
  const marginLeft =
    overrides.marginLeftOverride ?? normalizedStyle.marginLeft;
  const marginRight =
    overrides.marginRightOverride ?? normalizedStyle.marginRight;
  const hasMargins = marginLeft !== null || marginRight !== null;
  const stretchToWidth =
    overrides.stretchToWidthOverride === 'on'
      ? hasMargins
      : overrides.stretchToWidthOverride === 'off'
        ? false
        : normalizedStyle.stretchToWidth && hasMargins;
  const position =
    getPositionById(overrides.positionIdOverride) || normalizedStyle.position;
  return {
    ...normalizedStyle,
    font: overrides.fontOverride || normalizedStyle.font,
    primaryColor: overrides.colorOverride || normalizedStyle.primaryColor,
    fontSize: overrides.fontSizeOverride || normalizedStyle.fontSize,
    fontVariant:
      overrides.fontVariantOverride || normalizedStyle.fontVariant,
    lineSpacingOverride,
    marginLeft,
    marginRight,
    stretchToWidth,
    secondaryColor:
      overrides.secondaryColorOverride || normalizedStyle.secondaryColor,
    outlineColor:
      overrides.outlineColorOverride || normalizedStyle.outlineColor,
    backColor: overrides.backColorOverride || normalizedStyle.backColor,
    badgeColor: overrides.badgeColorOverride || normalizedStyle.badgeColor,
    badgePaddingX:
      overrides.badgePaddingXOverride ?? normalizedStyle.badgePaddingX,
    badgePaddingY:
      overrides.badgePaddingYOverride ?? normalizedStyle.badgePaddingY,
    badgeRadius: overrides.badgeRadiusOverride ?? normalizedStyle.badgeRadius,
    boxColor: overrides.boxColorOverride || normalizedStyle.boxColor,
    boxPadding: overrides.boxPaddingOverride ?? normalizedStyle.boxPadding,
    positionId: position.id,
    position,
  };
}

function formatOptionalColorLabel(color) {
  return isNoneColor(color) ? TEXT.colorNone : formatSubtitleColor(color);
}

function formatCueOverrideLabel(cue) {
  const overrides = normalizeCueOverrides(cue);
  const parts = [];
  if (overrides.fontOverride) {
    parts.push(`${TEXT.cueFontOverride} ${overrides.fontOverride}`);
  }
  if (overrides.colorOverride) {
    parts.push(
      `${TEXT.cueColorOverride} ${formatSubtitleColor(overrides.colorOverride)}`,
    );
  }
  if (overrides.fontSizeOverride) {
    parts.push(`${TEXT.cueSizeOverride} ${overrides.fontSizeOverride}`);
  }
  if (overrides.fontVariantOverride) {
    parts.push(
      `${TEXT.cueVariantOverride} ${fontVariantLabel(overrides.fontVariantOverride)}`,
    );
  }
  if (overrides.lineSpacingOverride) {
    const sign = overrides.lineSpacingOverride > 0 ? '+' : '';
    parts.push(
      `${TEXT.cueLineSpacingOverride} ${sign}${overrides.lineSpacingOverride}px`,
    );
  }
  if (overrides.stretchToWidthOverride) {
    parts.push(
      `${TEXT.cueStretchOverride} ${overrides.stretchToWidthOverride === 'on' ? TEXT.cueStretchOn : TEXT.cueStretchOff}`,
    );
  }
  if (
    overrides.marginLeftOverride !== null ||
    overrides.marginRightOverride !== null
  ) {
    parts.push(
      `${TEXT.cueStretchMargin} ${overrides.marginLeftOverride ?? '—'}/${overrides.marginRightOverride ?? '—'}`,
    );
  }
  if (overrides.secondaryColorOverride) {
    parts.push(
      `${TEXT.cueSecondaryColorOverride} ${formatOptionalColorLabel(overrides.secondaryColorOverride)}`,
    );
  }
  if (overrides.outlineColorOverride) {
    parts.push(
      `${TEXT.cueOutlineColorOverride} ${formatOptionalColorLabel(overrides.outlineColorOverride)}`,
    );
  }
  if (overrides.backColorOverride) {
    parts.push(
      `${TEXT.cueBackColorOverride} ${formatOptionalColorLabel(overrides.backColorOverride)}`,
    );
  }
  if (overrides.badgeColorOverride) {
    parts.push(
      `${TEXT.cueBadgeColorOverride} ${formatOptionalColorLabel(overrides.badgeColorOverride)}`,
    );
  }
  if (
    overrides.badgePaddingXOverride !== null ||
    overrides.badgePaddingYOverride !== null
  ) {
    parts.push(
      `${TEXT.cueBadgePaddingOverride} ${overrides.badgePaddingXOverride ?? '—'}/${overrides.badgePaddingYOverride ?? '—'}`,
    );
  }
  if (overrides.badgeRadiusOverride !== null) {
    parts.push(
      `${TEXT.cueBadgeRadiusOverride} ${overrides.badgeRadiusOverride}`,
    );
  }
  if (overrides.boxColorOverride) {
    parts.push(
      `${TEXT.cueBoxColorOverride} ${formatOptionalColorLabel(overrides.boxColorOverride)}`,
    );
  }
  if (overrides.boxPaddingOverride !== null) {
    parts.push(`${TEXT.cueBoxPaddingOverride} ${overrides.boxPaddingOverride}`);
  }
  if (overrides.positionIdOverride) {
    const position = getPositionById(overrides.positionIdOverride);
    if (position) {
      parts.push(`${TEXT.cuePositionOverride} ${position.name}`);
    }
  }
  return parts.length ? ` · ${TEXT.cueOverrides}: ${parts.join(', ')}` : '';
}

function colorToAssChannelOverrideTags(color, channel) {
  if (isNoneColor(color)) return [`\\${channel}a&HFF&`];

  const parsed = parseSubtitleColor(color) || parseSubtitleColor('#ffffff');
  const red = colorToHexByte(parsed.red);
  const green = colorToHexByte(parsed.green);
  const blue = colorToHexByte(parsed.blue);
  const alpha = assAlphaFromCss(parsed.alpha).toUpperCase();
  const bgr = `${blue}${green}${red}`.toUpperCase();
  return [`\\${channel}c&H${bgr}&`, `\\${channel}a&H${alpha}&`];
}

function buildCueOverridePrefix(cue, baseStyle, resolvedStyle) {
  const tags = [];
  if (resolvedStyle.font !== baseStyle.font) tags.push(`\\fn${resolvedStyle.font}`);
  if (resolvedStyle.fontSize !== baseStyle.fontSize) {
    tags.push(`\\fs${resolvedStyle.fontSize}`);
  }
  if (resolvedStyle.fontVariant !== baseStyle.fontVariant) {
    const resolvedBold = resolvedStyle.fontVariant === 'bold';
    const resolvedItalic = resolvedStyle.fontVariant === 'italic';
    if (resolvedBold !== (baseStyle.fontVariant === 'bold')) {
      tags.push(`\\b${resolvedBold ? 1 : 0}`);
    }
    if (resolvedItalic !== (baseStyle.fontVariant === 'italic')) {
      tags.push(`\\i${resolvedItalic ? 1 : 0}`);
    }
  }
  if (resolvedStyle.primaryColor !== baseStyle.primaryColor) {
    tags.push(...colorToAssPrimaryOverrideTags(resolvedStyle.primaryColor));
  }
  if (resolvedStyle.secondaryColor !== baseStyle.secondaryColor) {
    tags.push(...colorToAssChannelOverrideTags(resolvedStyle.secondaryColor, 2));
  }
  if (!isNoneColor(baseStyle.boxColor)) {
    // BorderStyle=3 opaque box: channel 3 is the box fill and \bord its padding.
    // The mode itself cannot be toggled inline, so overrides only recolor/resize
    // the box of a style that is already a box.
    if (resolvedStyle.boxColor !== baseStyle.boxColor) {
      tags.push(...colorToAssChannelOverrideTags(resolvedStyle.boxColor, 3));
    }
    if (resolvedStyle.boxPadding !== baseStyle.boxPadding) {
      tags.push(`\\bord${resolvedStyle.boxPadding}`);
    }
  } else if (resolvedStyle.outlineColor !== baseStyle.outlineColor) {
    if (isNoneColor(resolvedStyle.outlineColor)) {
      tags.push('\\bord0');
    } else {
      tags.push(
        '\\bord4',
        ...colorToAssChannelOverrideTags(resolvedStyle.outlineColor, 3),
      );
    }
  }
  if (resolvedStyle.backColor !== baseStyle.backColor) {
    if (isNoneColor(resolvedStyle.backColor)) {
      tags.push('\\shad0');
    } else {
      tags.push(
        '\\shad2',
        ...colorToAssChannelOverrideTags(resolvedStyle.backColor, 4),
      );
    }
  }
  if (resolvedStyle.position.alignment !== baseStyle.position.alignment) {
    tags.push(`\\an${resolvedStyle.position.alignment}`);
  }
  return tags.length ? `{${tags.join('')}}` : '';
}

function buildCuePointPositionPrefix(x, y, cue) {
  const startX = Math.round(x);
  const startY = Math.round(y);
  const motion = normalizeCueMotion(cue);

  if (!motion) {
    return `{\\pos(${startX},${startY})}`;
  }

  const endX = startX + motion.motionDx;
  const endY = startY + motion.motionDy;
  if (motion.motionMs <= 0) {
    return `{\\pos(${endX},${endY})}`;
  }

  const moveStartMs = motion.motionStartMs;
  const moveEndMs = motion.motionStartMs + motion.motionMs;
  return `{\\move(${startX},${startY},${endX},${endY},${moveStartMs},${moveEndMs})}`;
}

function buildCuePositionPrefix(style, cue, yOffset = 0) {
  return buildCuePointPositionPrefix(
    style.position.x,
    style.position.y + yOffset,
    cue,
  );
}

function cueLineYOffset(style, lineIndex, lineCount, lineSpacing) {
  const step = Math.max(1, Math.round(Number(style.fontSize) + lineSpacing));
  const alignment = Number(style.position?.alignment) || 2;

  if (alignment >= 7) return lineIndex * step;
  if (alignment >= 4) return (lineIndex - (lineCount - 1) / 2) * step;
  return (lineIndex - (lineCount - 1)) * step;
}

function setSubtitleMeasureFont(style, fontSize) {
  if (!subtitleMeasureContext) return;

  const fontStyle = style.fontVariant === 'italic' ? 'italic' : 'normal';
  const fontWeight = style.fontVariant === 'bold' ? '700' : '400';
  const fontFamily = String(style.font || 'Montserrat').replace(/["\\]/g, '');
  subtitleMeasureContext.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}"`;
}

function measureSubtitleLineWidth(style, line, fontSize) {
  const text = line || ' ';
  if (!subtitleMeasureContext) {
    return Math.max(1, text.length) * fontSize * 0.58;
  }

  setSubtitleMeasureFont(style, fontSize);
  const metrics = subtitleMeasureContext.measureText(text);
  return Math.max(
    1,
    metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight ||
      metrics.width,
  );
}

function calculateStretchedFontSize(style, text) {
  if (!style.stretchToWidth) return Math.round(Number(style.fontSize) || 72);

  const baseFontSize = Math.max(1, Number(style.fontSize) || 72);
  const marginLeft = normalizeOptionalStretchMarginValue(style.marginLeft) ?? 0;
  const marginRight =
    normalizeOptionalStretchMarginValue(style.marginRight) ?? 0;
  const targetWidth = Math.max(1, ASS_PLAY_RES_X - marginLeft - marginRight);
  const lines = (stripAssMarkup(text) || ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const measuredWidth =
    Math.max(
      ...((lines.length ? lines : [' ']).map((line) =>
        measureSubtitleLineWidth(style, line, baseFontSize),
      )),
    ) * ASS_BADGE_TEXT_METRIC_SCALE;

  return Math.max(1, Math.round(baseFontSize * (targetWidth / measuredWidth)));
}

function resolveCueStretchFontSize(style, cue) {
  return calculateStretchedFontSize(style, stripAssMarkup(cue.text) || cue.text);
}

function styleWithResolvedCueFontSize(style, cue) {
  const stretched = style.stretchToWidth
    ? { ...style, fontSize: resolveCueStretchFontSize(style, cue) }
    : style;

  return applyMarginBoundsToStyle(stretched, cue);
}

// Every dialogue line is placed with an absolute `\pos`, which makes libass
// ignore the style/event MarginL/MarginR. So the left/right margins would never
// constrain the text on their own. Here we treat them as a real bounding box:
// the text is shrunk to fit the box width (when it is too wide) and its `\pos`
// anchor is shifted so it never crosses either boundary.
function applyMarginBoundsToStyle(style, cue) {
  const marginLeft = normalizeOptionalStretchMarginValue(style.marginLeft);
  const marginRight = normalizeOptionalStretchMarginValue(style.marginRight);
  if (marginLeft === null && marginRight === null) return style;

  const left = marginLeft ?? 0;
  const right = ASS_PLAY_RES_X - (marginRight ?? 0);
  const boxWidth = right - left;
  if (boxWidth <= 0) return style;

  let fontSize = Number(style.fontSize) || 72;
  let extent = measureCueTextForBadge(style, cue);
  const textWidth = Math.max(1, extent.right - extent.left);

  if (textWidth > boxWidth) {
    // Shrink to fit the box; floor keeps the re-measured text within the box.
    fontSize = Math.max(1, Math.floor(fontSize * (boxWidth / textWidth)));
    extent = measureCueTextForBadge({ ...style, fontSize }, cue);
  }

  let x = Number(style.position?.x) || 0;
  if (x + extent.right > right) x = right - extent.right;
  if (x + extent.left < left) x = left - extent.left;

  return {
    ...style,
    fontSize,
    position: { ...style.position, x: Math.round(x) },
  };
}

function measureCueTextForBadge(style, cue) {
  const text = stripAssMarkup(cue.text) || ' ';
  const lines = text.split('\n');
  const fontSize = Math.max(1, Number(style.fontSize) || 72);
  const alignment = Number(style.position?.alignment) || 2;
  const horizontalFactor = [0, 0.5, 1][(alignment - 1) % 3];
  const lineStep = Math.max(
    1,
    fontSize + Number(style.lineSpacingOverride || 0),
  );
  let left = 0;
  let right =
    Math.max(...lines.map((line) => Math.max(1, line.length))) *
    fontSize *
    0.58;

  if (subtitleMeasureContext) {
    setSubtitleMeasureFont(style, fontSize);
    const lineBounds = lines.map((line) => {
      const metrics = subtitleMeasureContext.measureText(line || ' ');
      const origin = -metrics.width * horizontalFactor;
      return {
        left: origin + (metrics.actualBoundingBoxLeft || 0),
        right: origin + (metrics.actualBoundingBoxRight || metrics.width),
      };
    });
    left = Math.min(...lineBounds.map((bounds) => bounds.left));
    right = Math.max(...lineBounds.map((bounds) => bounds.right));
  } else {
    left = -right * horizontalFactor;
    right += left;
  }

  return {
    left: left * ASS_BADGE_TEXT_METRIC_SCALE,
    right: right * ASS_BADGE_TEXT_METRIC_SCALE,
    height: fontSize + Math.max(0, lines.length - 1) * lineStep,
  };
}

function cueBadgeGeometry(style, cue) {
  if (isNoneColor(style.badgeColor)) return null;

  const textSize = measureCueTextForBadge(style, cue);
  const paddingX = style.badgePaddingX;
  const paddingY = style.badgePaddingY;
  const width = Math.max(
    1,
    Math.ceil(textSize.right - textSize.left + paddingX * 2),
  );
  const height = Math.max(1, Math.ceil(textSize.height + paddingY * 2));
  const alignment = Number(style.position?.alignment) || 2;
  const verticalFactor = [1, 0.5, 0][Math.floor((alignment - 1) / 3)];
  const x = style.position.x + textSize.left - paddingX;
  const y = style.position.y - textSize.height * verticalFactor - paddingY;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    radius: Math.min(style.badgeRadius, width / 2, height / 2),
  };
}

function roundedRectAssPath(width, height, radius) {
  const w = Math.round(width);
  const h = Math.round(height);
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return `m 0 0 l ${w} 0 ${w} ${h} 0 ${h}`;

  const k = Math.round(r * 0.55228475);
  return [
    `m ${r} 0`,
    `l ${w - r} 0`,
    `b ${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `l ${w} ${h - r}`,
    `b ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h}`,
    `l ${r} ${h}`,
    `b ${r - k} ${h} 0 ${h - r + k} 0 ${h - r}`,
    `l 0 ${r}`,
    `b 0 ${r - k} ${r - k} 0 ${r} 0`,
  ].join(' ');
}

function setCurrentVideoMetaLink(url, fallbackText = '') {
  if (!currentVideoMeta) return;

  if (!url) {
    currentVideoMeta.removeAttribute('href');
    currentVideoMeta.textContent = fallbackText;
    currentVideoMeta.hidden = !fallbackText;
    return;
  }

  currentVideoMeta.href = url;
  currentVideoMeta.textContent = url;
  currentVideoMeta.hidden = false;
}

function formatPreviewFontFamily(fontName) {
  const family = (fontName || 'Montserrat').trim();
  if (!BUNDLED_FONT_FAMILIES.has(family)) {
    return `${family}, Montserrat, sans-serif`;
  }

  return `"${family}", Montserrat, sans-serif`;
}

function normalizeFontVariant(value) {
  if (value === 'regular' || value === 'bold' || value === 'italic') {
    return value;
  }

  return 'regular';
}

function normalizeStyleBadgeNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Math.round(Number(value));
  return Number.isFinite(number)
    ? Math.min(240, Math.max(0, number))
    : fallback;
}

function normalizeLineSpacingValue(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStretchMarginValue(value, fallback = DEFAULT_STRETCH_MARGIN) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.floor((ASS_PLAY_RES_X - 1) / 2), Math.max(0, number));
}

function normalizeOptionalStretchMarginValue(value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizeStretchMarginValue(value);
}

function normalizeCueStretchOverride(value) {
  if (value === 'on' || value === 'off') return value;
  return '';
}

function normalizeCueFontVariantOverride(value) {
  if (value === 'regular' || value === 'bold' || value === 'italic') {
    return value;
  }
  return '';
}

function normalizeCueColorOverride(value) {
  const color = String(value || '').trim();
  if (!color) return '';
  if (isNoneColor(color)) return 'none';
  return normalizeSubtitleColor(color, '');
}

function normalizeOptionalBadgeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizeStyleBadgeNumber(value, null);
}

function fontVariantLabel(value) {
  return {
    regular: 'Regular',
    bold: 'Bold',
    italic: 'Italic',
  }[normalizeFontVariant(value)];
}

function formatLineSpacingLabel(value) {
  const lineSpacing = normalizeLineSpacingValue(value);
  const sign = lineSpacing > 0 ? '+' : '';
  return `${TEXT.cueLineSpacingOverride} ${sign}${lineSpacing}px`;
}

function normalizeStyle(style) {
  const primaryColor =
    style.primaryColor || style.color || 'rgba(255, 255, 255, 1)';
  const resolvedPosition =
    getPositionById(style.positionId) ||
    getPositionByLegacy(style.position) ||
    defaultPosition();
  // Legacy styles kept a single symmetric stretchMargin; carry it over as
  // left/right margins only when stretch was actually enabled.
  const legacyMargin =
    style.marginLeft === undefined &&
    style.marginRight === undefined &&
    style.stretchToWidth
      ? normalizeStretchMarginValue(style.stretchMargin)
      : null;
  const marginLeft =
    normalizeOptionalStretchMarginValue(style.marginLeft) ?? legacyMargin;
  const marginRight =
    normalizeOptionalStretchMarginValue(style.marginRight) ?? legacyMargin;
  const hasMargins = marginLeft !== null || marginRight !== null;

  return {
    ...style,
    name: style.name || 'Default',
    font: style.font || 'Montserrat',
    fontSize: Number(style.fontSize) || 72,
    fontVariant: normalizeFontVariant(style.fontVariant),
    primaryColor: isNoneColor(primaryColor)
      ? 'rgba(255, 255, 255, 1)'
      : normalizeSubtitleColor(primaryColor, 'rgba(255, 255, 255, 1)'),
    secondaryColor: normalizeOptionalSubtitleColor(
      style.secondaryColor ?? 'rgba(0, 0, 0, 1)',
      'rgba(0, 0, 0, 1)',
    ),
    outlineColor: normalizeOptionalSubtitleColor(
      style.outlineColor ?? 'none',
      'none',
    ),
    backColor: normalizeOptionalSubtitleColor(
      style.backColor ?? 'none',
      'none',
    ),
    badgeColor: normalizeOptionalSubtitleColor(
      style.badgeColor ?? 'none',
      'none',
    ),
    badgePaddingX: normalizeStyleBadgeNumber(style.badgePaddingX, 24),
    badgePaddingY: normalizeStyleBadgeNumber(style.badgePaddingY, 12),
    badgeRadius: normalizeStyleBadgeNumber(style.badgeRadius, 20),
    boxColor: normalizeOptionalSubtitleColor(style.boxColor ?? 'none', 'none'),
    boxPadding: normalizeStyleBadgeNumber(style.boxPadding, 8),
    lineSpacingOverride: normalizeLineSpacingValue(style.lineSpacingOverride),
    marginLeft,
    marginRight,
    stretchToWidth: Boolean(style.stretchToWidth) && hasMargins,
    positionId: resolvedPosition.id,
    position: resolvedPosition,
  };
}

function applySubtitlePreviewStyle(element, style, scale = 1) {
  const normalizedStyle = normalizeStyle(style || {});
  const fontSize = Math.max(14, Math.round(normalizedStyle.fontSize * scale));
  const hasBadge = !isNoneColor(normalizedStyle.badgeColor);
  const boxOn = !isNoneColor(normalizedStyle.boxColor);
  const hasBox = !hasBadge && boxOn;
  const backgroundColor = hasBadge
    ? normalizedStyle.badgeColor
    : hasBox
      ? normalizedStyle.boxColor
      : normalizedStyle.backColor;
  const shadows = [];

  element.style.color = normalizedStyle.primaryColor;
  element.style.fontFamily = formatPreviewFontFamily(normalizedStyle.font);
  element.style.fontSize = `${fontSize}px`;
  element.style.lineHeight = normalizedStyle.lineSpacingOverride
    ? `${Math.max(1, Math.round(fontSize + normalizedStyle.lineSpacingOverride * scale))}px`
    : '';
  element.style.fontStyle =
    normalizedStyle.fontVariant === 'italic' ? 'italic' : 'normal';
  element.style.fontWeight =
    normalizedStyle.fontVariant === 'bold' ? '900' : '400';
  element.style.background = isNoneColor(backgroundColor)
    ? 'transparent'
    : backgroundColor;
  element.style.padding = hasBadge
    ? `${Math.round(normalizedStyle.badgePaddingY * scale)}px ${Math.round(normalizedStyle.badgePaddingX * scale)}px`
    : hasBox
      ? `${Math.round(normalizedStyle.boxPadding * scale)}px`
      : isNoneColor(normalizedStyle.backColor)
        ? '0'
        : '0.08em 0.18em';
  element.style.borderRadius = hasBadge
    ? `${Math.round(normalizedStyle.badgeRadius * scale)}px`
    : hasBox
      ? '0'
      : isNoneColor(normalizedStyle.backColor)
        ? '0'
        : '4px';

  if (!boxOn && !isNoneColor(normalizedStyle.outlineColor)) {
    const outlineSize = Math.max(1, Math.round(fontSize / 18));
    shadows.push(
      `${outlineSize}px 0 0 ${normalizedStyle.outlineColor}`,
      `-${outlineSize}px 0 0 ${normalizedStyle.outlineColor}`,
      `0 ${outlineSize}px 0 ${normalizedStyle.outlineColor}`,
      `0 -${outlineSize}px 0 ${normalizedStyle.outlineColor}`,
      `${outlineSize}px ${outlineSize}px 0 ${normalizedStyle.outlineColor}`,
    );
  }

  if (!isNoneColor(normalizedStyle.backColor)) {
    shadows.push(
      `0 ${Math.max(1, Math.round(fontSize / 12))}px 0 rgba(0, 0, 0, 0.28)`,
    );
  }

  element.style.textShadow = shadows.join(', ');
}

function readStyleFormDraft() {
  return normalizeStyle({
    name: styleNameInput.value.trim() || 'Default',
    font: styleFontInput.value || 'Montserrat',
    fontSize: Number(styleFontSizeInput.value) || 72,
    fontVariant: styleFontVariantInput.value,
    lineSpacingOverride: styleLineSpacingInput.value,
    primaryColor: stylePrimaryColorInput.value,
    secondaryColor: styleSecondaryColorInput.value,
    outlineColor: styleOutlineColorInput.value,
    backColor: styleBackColorInput.value,
    badgeColor: styleBadgeColorInput.value,
    badgePaddingX: styleBadgePaddingXInput.value,
    badgePaddingY: styleBadgePaddingYInput.value,
    badgeRadius: styleBadgeRadiusInput.value,
    boxColor: styleBoxColorInput.value,
    boxPadding: styleBoxPaddingInput.value,
    stretchToWidth: styleStretchToWidthInput.checked,
    marginLeft: styleMarginLeftInput.value,
    marginRight: styleMarginRightInput.value,
    positionId: stylePositionInput.value || defaultPosition().id,
  });
}

function formatStyleMarginsLabel(style) {
  if (style.marginLeft === null && style.marginRight === null) return '';
  const margins = `${style.marginLeft ?? 0}/${style.marginRight ?? 0}`;
  const stretchLabel = style.stretchToWidth ? ` · ${TEXT.stretchMeta}` : '';
  return ` · ${TEXT.cueStretchMargin} ${margins}${stretchLabel}`;
}

function syncStyleStretchControls() {
  const hasMargins =
    styleMarginLeftInput.value.trim() !== '' ||
    styleMarginRightInput.value.trim() !== '';
  styleStretchToWidthInput.disabled = !hasMargins;
  if (!hasMargins) styleStretchToWidthInput.checked = false;
}

function createStylePreviewColor(label, value) {
  const item = document.createElement('span');
  item.className = 'style-live-preview__color';

  const swatch = document.createElement('span');
  swatch.className = 'style-live-preview__swatch';
  swatch.classList.toggle('is-none', isNoneColor(value));
  swatch.style.background = isNoneColor(value) ? 'transparent' : value;

  const text = document.createElement('span');
  text.textContent = `${label}: ${
    isNoneColor(value) ? 'none' : formatSubtitleColor(value)
  }`;

  item.append(swatch, text);
  return item;
}

function renderStyleLivePreview() {
  if (!styleLivePreviewText || !styleLivePreviewMeta || !styleLivePreviewColors)
    return;

  const style = readStyleFormDraft();
  styleLivePreviewText.textContent = STYLE_PREVIEW_TEXT;
  const previewStyle = style.stretchToWidth
    ? {
        ...style,
        fontSize: calculateStretchedFontSize(style, STYLE_PREVIEW_TEXT),
      }
    : style;
  applySubtitlePreviewStyle(styleLivePreviewText, previewStyle, 0.42);
  styleLivePreviewMeta.textContent = `${style.font} · ${fontVariantLabel(style.fontVariant)} · ${style.fontSize} ASS · ${formatLineSpacingLabel(style.lineSpacingOverride)}${formatStyleMarginsLabel(style)}`;
  styleLivePreviewColors.replaceChildren(
    createStylePreviewColor('Primary', style.primaryColor),
    createStylePreviewColor('Secondary', style.secondaryColor),
    createStylePreviewColor('Outline', style.outlineColor),
    createStylePreviewColor('Back', style.backColor),
    createStylePreviewColor(TEXT.previewBadge, style.badgeColor),
    createStylePreviewColor(TEXT.previewBox, style.boxColor),
  );
}

const ALIGN_CELL_ORDER = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

function createAlignPreview(alignment) {
  const preview = document.createElement('span');
  preview.className = 'align-preview';
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', `${TEXT.alignment} ${alignment}`);

  for (const cell of ALIGN_CELL_ORDER) {
    const dot = document.createElement('span');
    dot.className = 'align-preview__cell';
    if (String(alignment) === cell) {
      dot.classList.add('is-active');
    }
    preview.append(dot);
  }

  return preview;
}

function renderAlignControl() {
  const selectedAlign = positionAlignmentInput.value || '2';
  alignControlButtons.forEach((button) => {
    const isActive = button.dataset.alignCell === selectedAlign;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function generateAss() {
  const exportStyles = collectStylesForAss();
  const styles = exportStyles.length
    ? exportStyles
    : [
        {
          id: 'default',
          name: 'Default',
          font: 'Montserrat',
          fontSize: 72,
          fontVariant: 'regular',
          primaryColor: 'rgba(255, 255, 255, 1)',
          secondaryColor: 'rgba(0, 0, 0, 1)',
          outlineColor: 'none',
          backColor: 'none',
          badgeColor: 'none',
          badgePaddingX: 24,
          badgePaddingY: 12,
          badgeRadius: 20,
          boxColor: 'none',
          boxPadding: 8,
          lineSpacingOverride: 0,
          stretchToWidth: false,
          marginLeft: null,
          marginRight: null,
          positionId: defaultPosition().id,
        },
      ];

  const styleLines = styles.map((rawStyle) => {
    const style = normalizeStyle(rawStyle);
    const name = sanitizeAssName(style.name);
    // BorderStyle=3 paints an opaque box (OutlineColour) behind the text, with
    // Outline acting as its padding. It reuses the OutlineColour field, so an
    // active box replaces the regular outline for that style.
    const boxOn = !isNoneColor(style.boxColor);
    return [
      `Style: ${name}`,
      style.font,
      style.fontSize,
      colorToAss(style.primaryColor),
      colorToAss(style.secondaryColor),
      boxOn ? colorToAss(style.boxColor) : colorToAss(style.outlineColor),
      colorToAss(style.backColor),
      style.fontVariant === 'bold' ? -1 : 0,
      style.fontVariant === 'italic' ? -1 : 0,
      0,
      0,
      100,
      100,
      0,
      0,
      boxOn ? 3 : 1,
      boxOn ? style.boxPadding : isNoneColor(style.outlineColor) ? 0 : 4,
      isNoneColor(style.backColor) ? 0 : 2,
      24,
      24,
      120,
      style.position.alignment,
      1,
    ].join(',');
  });

  function buildDialogueLine(
    cue,
    baseStyle,
    resolvedStyle,
    text,
    yOffset = 0,
    layer = 0,
  ) {
    const positionPrefix = buildCuePositionPrefix(resolvedStyle, cue, yOffset);
    const overridePrefix = buildCueOverridePrefix(
      cue,
      baseStyle,
      resolvedStyle,
    );
    return [
      `Dialogue: ${layer}`,
      formatAssTime(cue.start),
      formatAssTime(cue.end),
      sanitizeAssName(baseStyle.name),
      '',
      0,
      0,
      0,
      '',
      `${positionPrefix}${overridePrefix}${text || '\\h'}`,
    ].join(',');
  }

  function buildBadgeDialogueLine(cue, style) {
    const geometry = cueBadgeGeometry(style, cue);
    if (!geometry) return null;

    const positionPrefix = buildCuePointPositionPrefix(
      geometry.x,
      geometry.y,
      cue,
    );
    const drawingPrefix = [
      '{\\an7\\p1\\bord0\\shad0',
      colorToAssDrawingOverrideTags(style.badgeColor),
      '}',
    ].join('');
    return [
      'Dialogue: 0',
      formatAssTime(cue.start),
      formatAssTime(cue.end),
      sanitizeAssName(style.name),
      '',
      0,
      0,
      0,
      '',
      `${positionPrefix}${drawingPrefix}${roundedRectAssPath(
        geometry.width,
        geometry.height,
        geometry.radius,
      )}`,
    ].join(',');
  }

  const cueLines = cachedCues.flatMap((cue) => {
    const style = normalizeStyle(getStyleById(cue.styleId) || {});
    const cueStyle = styleWithResolvedCueFontSize(
      cueStyleWithOverrides(style, cue),
      cue,
    );
    const text = escapeAssText(cue.text);
    const textLines = text.split(/\\N/g);
    const badgeLine = buildBadgeDialogueLine(cue, cueStyle);
    const textLayer = badgeLine ? 1 : 0;
    const lineSpacing = cueStyle.lineSpacingOverride;

    if (!lineSpacing || textLines.length <= 1) {
      return [
        ...(badgeLine ? [badgeLine] : []),
        buildDialogueLine(cue, style, cueStyle, text, 0, textLayer),
      ];
    }

    return [
      ...(badgeLine ? [badgeLine] : []),
      ...textLines.map((line, index) =>
        buildDialogueLine(
          cue,
          style,
          cueStyle,
          line,
          cueLineYOffset(cueStyle, index, textLines.length, lineSpacing),
          textLayer,
        ),
      ),
    ];
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, MarginL, MarginR, MarginV, Alignment, Encoding',
    ...styleLines,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cueLines,
    '',
  ].join('\n');
}

function renderStyleOptions() {
  cueStyleInput.replaceChildren();
  transcriptionCueStyleInput.replaceChildren();

  for (const style of cachedStyles) {
    const option = document.createElement('option');
    option.value = style.id;
    option.textContent = style.name;
    cueStyleInput.append(option);

    const transcriptionOption = document.createElement('option');
    transcriptionOption.value = style.id;
    transcriptionOption.textContent = style.name;
    transcriptionCueStyleInput.append(transcriptionOption);
  }

  cueStyleInput.disabled = cachedStyles.length === 0;
  transcriptionCueStyleInput.disabled = cachedStyles.length === 0;
  createCuesFromTranscriptionButton.disabled = cachedStyles.length === 0;
}

function renderPositionOptions() {
  const currentValue = stylePositionInput.value;
  stylePositionInput.replaceChildren();

  for (const position of cachedPositions) {
    const option = document.createElement('option');
    option.value = position.id;
    option.textContent = `${position.name} (${position.x}, ${position.y})`;
    stylePositionInput.append(option);
  }

  stylePositionInput.disabled = cachedPositions.length === 0;
  if (cachedPositions.some((position) => position.id === currentValue)) {
    stylePositionInput.value = currentValue;
  } else if (cachedPositions[0]) {
    stylePositionInput.value = defaultPosition().id;
  }

  if (cuePositionInput) {
    const currentCueValue = cuePositionInput.value;
    cuePositionInput.replaceChildren();

    const fromStyleOption = document.createElement('option');
    fromStyleOption.value = '';
    fromStyleOption.textContent = TEXT.fromStyle;
    cuePositionInput.append(fromStyleOption);

    for (const position of cachedPositions) {
      const option = document.createElement('option');
      option.value = position.id;
      option.textContent = `${position.name} (${position.x}, ${position.y})`;
      cuePositionInput.append(option);
    }

    cuePositionInput.value = cachedPositions.some(
      (position) => position.id === currentCueValue,
    )
      ? currentCueValue
      : '';
  }
  renderStyleLivePreview();
}

let editorLayoutFrame = 0;

function getEditorItemById(list, id) {
  if (!list || !id) return null;
  return [...list.children].find((item) => item.dataset.editorItemId === id);
}

function clearEditorFormOffset(form) {
  form?.style.removeProperty('--editor-edit-offset');
  if (form) delete form.dataset.editorLayoutId;
}

function focusEditorControl(control) {
  if (!control) return;
  try {
    control.focus({ preventScroll: true });
  } catch (error) {
    control.focus();
  }
}

function syncEditorFormLayout(form, list, editingId) {
  if (!form || !list) return;

  const activeItem = getEditorItemById(list, editingId);
  [...list.children].forEach((item) => {
    item.classList.toggle('is-editing', item === activeItem);
  });

  form.classList.toggle('is-editing', Boolean(editingId));
  if (!editingId || !activeItem) {
    clearEditorFormOffset(form);
    return;
  }

  const isStacked = window.matchMedia?.('(max-width: 820px)').matches;
  if (isStacked) {
    clearEditorFormOffset(form);
    return;
  }

  if (
    form.dataset.editorLayoutId === editingId &&
    form.style.getPropertyValue('--editor-edit-offset')
  ) {
    return;
  }

  clearEditorFormOffset(form);

  const listCard = list.closest('.editor-card');
  if (!listCard) return;

  const itemRect = activeItem.getBoundingClientRect();
  const listCardRect = listCard.getBoundingClientRect();
  const offset = Math.max(0, itemRect.top - listCardRect.top);

  form.style.setProperty('--editor-edit-offset', `${Math.round(offset)}px`);
  form.dataset.editorLayoutId = editingId;
}

function syncEditorLayouts() {
  editorLayoutFrame = 0;
  syncEditorFormLayout(positionForm, positionList, editingPositionId);
  syncEditorFormLayout(styleForm, styleList, editingStyleId);
}

function scheduleEditorLayouts() {
  if (editorLayoutFrame) window.cancelAnimationFrame(editorLayoutFrame);
  editorLayoutFrame = window.requestAnimationFrame(syncEditorLayouts);
}

function resyncEditorLayouts() {
  clearEditorFormOffset(positionForm);
  clearEditorFormOffset(styleForm);
  clearEditorFormOffset(cueForm);
  scheduleEditorLayouts();
}

function renderPositions() {
  positionList.replaceChildren();
  positionsEmptyState.hidden = cachedPositions.length > 0;

  for (const position of cachedPositions) {
    const item = document.createElement('article');
    item.className = 'position-item';
    item.dataset.editorItemId = position.id;
    item.classList.toggle('is-editing', editingPositionId === position.id);

    const body = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = position.name;

    const meta = document.createElement('div');
    meta.className = 'position-item__meta';

    const coords = document.createElement('span');
    coords.className = 'position-item__coords';
    coords.textContent = `x ${position.x} · y ${position.y}`;

    const alignWrap = document.createElement('span');
    alignWrap.className = 'position-item__align';
    const alignLabel = document.createElement('span');
    alignLabel.className = 'position-item__align-label';
    alignLabel.textContent = 'Align';
    alignWrap.append(alignLabel, createAlignPreview(position.alignment));

    meta.append(coords, alignWrap);
    body.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const editButton = document.createElement('button');
    editButton.className = 'icon-button edit-button';
    editButton.type = 'button';
    editButton.title = TEXT.editPosition;
    editButton.innerHTML = EDIT_ICON;
    editButton.addEventListener('click', () => {
      startPositionEdit(position);
    });

    const removeButton = document.createElement('button');
    removeButton.className = 'icon-button';
    removeButton.type = 'button';
    removeButton.title = TEXT.archive;
    removeButton.textContent = '×';
    removeButton.disabled = cachedPositions.length <= 1;
    removeButton.addEventListener('click', async () => {
      if (cachedPositions.length <= 1) return;
      if (editingPositionId === position.id) resetPositionForm();

      const fallback = cachedPositions.find((item) => item.id !== position.id);
      await archivePosition(position.id);
      await Promise.all(
        cachedStyles
          .filter((style) => style.positionId === position.id)
          .map((style) => saveStyle({ ...style, positionId: fallback.id })),
      );
      await destroyJassubRenderer();
      await refreshEditor();
    });

    actions.append(editButton, removeButton);
    item.append(body, actions);
    positionList.append(item);
  }

  renderPositionOptions();
  scheduleEditorLayouts();
}

function renderStyles() {
  styleList.replaceChildren();
  stylesEmptyState.hidden = cachedStyles.length > 0;

  for (const rawStyle of cachedStyles) {
    const style = normalizeStyle(rawStyle);
    const item = document.createElement('article');
    item.className = 'style-item';
    item.dataset.editorItemId = style.id;
    item.classList.toggle('is-editing', editingStyleId === style.id);

    const swatch = document.createElement('span');
    swatch.className = 'style-swatch';
    swatch.style.background = style.primaryColor;

    const body = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = style.name;
    const meta = document.createElement('p');
    meta.textContent = `${style.font} · ${fontVariantLabel(style.fontVariant)} · ${style.fontSize} ASS · ${formatLineSpacingLabel(style.lineSpacingOverride)}${formatStyleMarginsLabel(style)} · ${positionLabel(style.position)}`;

    const preview = document.createElement('p');
    preview.className = 'style-item__preview';
    preview.textContent = STYLE_PREVIEW_TEXT;
    applySubtitlePreviewStyle(
      preview,
      style.stretchToWidth
        ? {
            ...style,
            fontSize: calculateStretchedFontSize(style, STYLE_PREVIEW_TEXT),
          }
        : style,
      0.34,
    );

    body.append(title, preview, meta);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const editButton = document.createElement('button');
    editButton.className = 'icon-button edit-button';
    editButton.type = 'button';
    editButton.title = TEXT.editStyle;
    editButton.innerHTML = EDIT_ICON;
    editButton.addEventListener('click', () => {
      startStyleEdit(style);
    });

    const removeButton = document.createElement('button');
    removeButton.className = 'icon-button';
    removeButton.type = 'button';
    removeButton.title = TEXT.archive;
    removeButton.textContent = '×';
    removeButton.addEventListener('click', async () => {
      if (editingStyleId === style.id) resetStyleForm();
      await archiveStyle(style.id);
      await refreshEditor();
    });

    actions.append(editButton, removeButton);
    item.append(swatch, body, actions);
    styleList.append(item);
  }

  renderStyleOptions();
  scheduleEditorLayouts();
}

function renderCues() {
  cueList.replaceChildren();
  cuesEmptyState.hidden = cachedCues.length > 0;
  deleteAllCuesButton.disabled = cachedCues.length === 0;
  syncCueTimelineScaleControl();
  const timelineLayout = buildCueTimelineLayout(cachedCues);
  cueList.dataset.timelineDuration = String(timelineLayout.duration);
  cueList.style.setProperty('--cue-timeline-width', timelineLayout.width);
  cueList.style.setProperty(
    '--cue-timeline-height',
    `${timelineLayout.height}px`,
  );
  cueList.append(createCueTimelineScale(timelineLayout));

  for (const entry of timelineLayout.entries) {
    const cue = entry.cue;
    const style = normalizeStyle(getStyleById(cue.styleId) || {});
    const accent = cueTimelineAccent(entry);
    const plainText = stripAssMarkup(cue.text) || cue.text;
    const item = document.createElement('article');
    item.className = 'cue-item';
    item.dataset.editorItemId = cue.id;
    item.classList.toggle('is-editing', editingCueId === cue.id);
    applyCueTimelineCardGeometry(item, entry, timelineLayout, accent);
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.title = `${formatTimeInput(cue.start)} → ${formatTimeInput(cue.end)} · ${plainText}`;
    item.setAttribute('aria-label', item.title);

    const text = document.createElement('span');
    text.className = 'cue-item__text';
    text.textContent = plainText;

    const styleName = document.createElement('span');
    styleName.className = 'cue-item__style';
    styleName.textContent = style.name || TEXT.styleDeleted;

    item.addEventListener('click', (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest('#cueForm, button, a')
      ) {
        return;
      }
      openCueEditor(cue);
    });
    item.addEventListener('keydown', (event) => {
      if (event.target !== item || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openCueEditor(cue);
    });

    item.append(text, styleName);
    cueList.append(item);
  }
  const playhead = document.createElement('span');
  playhead.className = 'cue-timeline__playhead';
  playhead.setAttribute('aria-hidden', 'true');
  cueList.append(playhead);
  updateCueTimelinePlayhead();
  placeCueEditor();
  scheduleEditorLayouts();
}

function placeCueEditor() {
  if (!cueEditorDock) return;

  cueEditorOpen = true;
  const activeItem = getEditorItemById(cueList, editingCueId);
  [...cueList.children].forEach((item) => {
    item.classList.toggle('is-editing', item === activeItem);
  });
  cueEditorDock.append(cueForm);

  cueForm.hidden = false;
  cueEditorDock.hidden = false;
}

function openCueEditor(cue) {
  const start = parseTimeToSeconds(cue.start);
  if (currentVideo?.src && Number.isFinite(start)) {
    currentVideo.currentTime = start;
    updateVideoControls();
  }
  startCueEdit(cue);
}

function openNewCueEditor() {
  resetCueForm();
  cueEditorOpen = true;
  const start = Number.isFinite(currentVideo?.currentTime)
    ? currentVideo.currentTime
    : 0;
  cueStartInput.value = formatTimeInput(String(start));
  cueEndInput.value = formatTimeInput(String(start + 2));
  cueForm.hidden = false;
  placeCueEditor();
  focusEditorControl(cueTextInput);
}

function resetStyleForm() {
  editingStyleId = undefined;
  styleForm.reset();
  styleFontInput.value = 'Montserrat';
  styleFontSizeInput.value = '72';
  styleFontVariantInput.value = 'regular';
  styleLineSpacingInput.value = '0';
  setColorInputValue(stylePrimaryColorInput, 'rgba(255, 255, 255, 1)');
  setColorInputValue(styleSecondaryColorInput, 'rgba(0, 0, 0, 1)');
  setColorInputValue(styleOutlineColorInput, 'none');
  setColorInputValue(styleBackColorInput, 'none');
  setColorInputValue(styleBadgeColorInput, 'none');
  styleBadgePaddingXInput.value = '24';
  styleBadgePaddingYInput.value = '12';
  styleBadgeRadiusInput.value = '20';
  setColorInputValue(styleBoxColorInput, 'none');
  styleBoxPaddingInput.value = '8';
  styleStretchToWidthInput.checked = false;
  styleMarginLeftInput.value = '';
  styleMarginRightInput.value = '';
  syncStyleStretchControls();
  stylePositionInput.value = defaultPosition().id;
  styleSubmitButton.textContent = TEXT.addStyle;
  if (newStyleButton) newStyleButton.hidden = true;
  cancelStyleEditButton.hidden = true;
  styleForm.classList.remove('is-editing');
  clearEditorFormOffset(styleForm);
  scheduleEditorLayouts();
  renderStyleLivePreview();
}

function resetCueForm() {
  editingCueId = undefined;
  cueEditorOpen = true;
  cueForm.reset();
  if (cueColorInput) setColorInputValue(cueColorInput, '');
  if (cueFontInput) cueFontInput.value = '';
  if (cueFontSizeInput) cueFontSizeInput.value = '';
  if (cueFontVariantInput) cueFontVariantInput.value = '';
  if (cueLineSpacingInput) cueLineSpacingInput.value = '';
  if (cueStretchToWidthInput) cueStretchToWidthInput.value = '';
  if (cueMarginLeftInput) cueMarginLeftInput.value = '';
  if (cueMarginRightInput) cueMarginRightInput.value = '';
  if (cueSecondaryColorInput) setColorInputValue(cueSecondaryColorInput, '');
  if (cueOutlineColorInput) setColorInputValue(cueOutlineColorInput, '');
  if (cueBackColorInput) setColorInputValue(cueBackColorInput, '');
  if (cueBadgeColorInput) setColorInputValue(cueBadgeColorInput, '');
  if (cueBadgePaddingXInput) cueBadgePaddingXInput.value = '';
  if (cueBadgePaddingYInput) cueBadgePaddingYInput.value = '';
  if (cueBadgeRadiusInput) cueBadgeRadiusInput.value = '';
  if (cueBoxColorInput) setColorInputValue(cueBoxColorInput, '');
  if (cueBoxPaddingInput) cueBoxPaddingInput.value = '';
  if (cuePositionInput) cuePositionInput.value = '';
  if (cueMotionDxInput) cueMotionDxInput.value = '';
  if (cueMotionDyInput) cueMotionDyInput.value = '';
  if (cueMotionStartMsInput) cueMotionStartMsInput.value = '';
  if (cueMotionMsInput) cueMotionMsInput.value = '';
  cueSubmitButton.textContent = TEXT.addCue;
  if (newCueButton) newCueButton.hidden = true;
  cancelCueEditButton.hidden = true;
  deleteCueButton.hidden = true;
  cueForm.classList.remove('is-editing');
  cueForm.hidden = false;
  clearEditorFormOffset(cueForm);
  placeCueEditor();
  scheduleEditorLayouts();
}

function resetPositionForm() {
  editingPositionId = undefined;
  positionForm.reset();
  positionXInput.value = '540';
  positionYInput.value = '1700';
  positionAlignmentInput.value = '2';
  renderAlignControl();
  positionSubmitButton.textContent = TEXT.addPosition;
  if (newPositionButton) newPositionButton.hidden = true;
  cancelPositionEditButton.hidden = true;
  positionForm.classList.remove('is-editing');
  clearEditorFormOffset(positionForm);
  scheduleEditorLayouts();
}

function startStyleEdit(style, options = {}) {
  const normalizedStyle = normalizeStyle(style);
  editingStyleId = normalizedStyle.id;
  styleNameInput.value = normalizedStyle.name;
  styleFontInput.value = normalizedStyle.font;
  styleFontSizeInput.value = String(normalizedStyle.fontSize);
  styleFontVariantInput.value = normalizedStyle.fontVariant;
  styleLineSpacingInput.value = String(normalizedStyle.lineSpacingOverride);
  setColorInputValue(stylePrimaryColorInput, normalizedStyle.primaryColor);
  setColorInputValue(styleSecondaryColorInput, normalizedStyle.secondaryColor);
  setColorInputValue(styleOutlineColorInput, normalizedStyle.outlineColor);
  setColorInputValue(styleBackColorInput, normalizedStyle.backColor);
  setColorInputValue(styleBadgeColorInput, normalizedStyle.badgeColor);
  styleBadgePaddingXInput.value = String(normalizedStyle.badgePaddingX);
  styleBadgePaddingYInput.value = String(normalizedStyle.badgePaddingY);
  styleBadgeRadiusInput.value = String(normalizedStyle.badgeRadius);
  setColorInputValue(styleBoxColorInput, normalizedStyle.boxColor);
  styleBoxPaddingInput.value = String(normalizedStyle.boxPadding);
  styleMarginLeftInput.value =
    normalizedStyle.marginLeft === null ? '' : String(normalizedStyle.marginLeft);
  styleMarginRightInput.value =
    normalizedStyle.marginRight === null
      ? ''
      : String(normalizedStyle.marginRight);
  syncStyleStretchControls();
  styleStretchToWidthInput.checked = normalizedStyle.stretchToWidth;
  stylePositionInput.value = normalizedStyle.positionId;
  styleSubmitButton.textContent = TEXT.saveStyle;
  if (newStyleButton) newStyleButton.hidden = false;
  cancelStyleEditButton.hidden = false;
  styleForm.classList.add('is-editing');
  renderStyleLivePreview();
  scheduleEditorLayouts();
  if (options.focus !== false) focusEditorControl(styleNameInput);
}

function startCueEdit(cue, options = {}) {
  editingCueId = cue.id;
  cueEditorOpen = true;
  cueTextInput.value = cue.text;
  cueStartInput.value = formatTimeInput(cue.start);
  cueEndInput.value = formatTimeInput(cue.end);
  cueStyleInput.value = cue.styleId;
  const overrides = normalizeCueOverrides(cue);
  if (cueFontInput) {
    cueFontInput.value = overrides.fontOverride;
  }
  if (cueColorInput) {
    setColorInputValue(cueColorInput, overrides.colorOverride || '');
  }
  if (cueFontSizeInput) {
    cueFontSizeInput.value = overrides.fontSizeOverride
      ? String(overrides.fontSizeOverride)
      : '';
  }
  if (cueFontVariantInput) {
    cueFontVariantInput.value = overrides.fontVariantOverride;
  }
  if (cueLineSpacingInput) {
    cueLineSpacingInput.value = overrides.lineSpacingOverride
      ? String(overrides.lineSpacingOverride)
      : '';
  }
  if (cueStretchToWidthInput) {
    cueStretchToWidthInput.value = overrides.stretchToWidthOverride;
  }
  if (cueMarginLeftInput) {
    cueMarginLeftInput.value =
      overrides.marginLeftOverride === null
        ? ''
        : String(overrides.marginLeftOverride);
  }
  if (cueMarginRightInput) {
    cueMarginRightInput.value =
      overrides.marginRightOverride === null
        ? ''
        : String(overrides.marginRightOverride);
  }
  if (cueSecondaryColorInput) {
    setColorInputValue(cueSecondaryColorInput, overrides.secondaryColorOverride);
  }
  if (cueOutlineColorInput) {
    setColorInputValue(cueOutlineColorInput, overrides.outlineColorOverride);
  }
  if (cueBackColorInput) {
    setColorInputValue(cueBackColorInput, overrides.backColorOverride);
  }
  if (cueBadgeColorInput) {
    setColorInputValue(cueBadgeColorInput, overrides.badgeColorOverride);
  }
  if (cueBadgePaddingXInput) {
    cueBadgePaddingXInput.value =
      overrides.badgePaddingXOverride === null
        ? ''
        : String(overrides.badgePaddingXOverride);
  }
  if (cueBadgePaddingYInput) {
    cueBadgePaddingYInput.value =
      overrides.badgePaddingYOverride === null
        ? ''
        : String(overrides.badgePaddingYOverride);
  }
  if (cueBadgeRadiusInput) {
    cueBadgeRadiusInput.value =
      overrides.badgeRadiusOverride === null
        ? ''
        : String(overrides.badgeRadiusOverride);
  }
  if (cueBoxColorInput) {
    setColorInputValue(cueBoxColorInput, overrides.boxColorOverride);
  }
  if (cueBoxPaddingInput) {
    cueBoxPaddingInput.value =
      overrides.boxPaddingOverride === null
        ? ''
        : String(overrides.boxPaddingOverride);
  }
  if (cuePositionInput) {
    cuePositionInput.value = getPositionById(overrides.positionIdOverride)
      ? overrides.positionIdOverride
      : '';
  }
  const motion = normalizeCueMotion(cue);
  if (cueMotionDxInput)
    cueMotionDxInput.value = motion ? String(motion.motionDx) : '';
  if (cueMotionDyInput)
    cueMotionDyInput.value = motion ? String(motion.motionDy) : '';
  if (cueMotionStartMsInput) {
    cueMotionStartMsInput.value =
      motion && motion.motionMs > 0 && motion.motionStartMs > 0
        ? String(motion.motionStartMs)
        : '';
  }
  if (cueMotionMsInput) {
    cueMotionMsInput.value =
      motion && motion.motionMs > 0 ? String(motion.motionMs) : '';
  }
  cueSubmitButton.textContent = TEXT.saveCue;
  if (newCueButton) newCueButton.hidden = false;
  cancelCueEditButton.hidden = false;
  deleteCueButton.hidden = false;
  cueForm.classList.add('is-editing');
  cueForm.hidden = false;
  placeCueEditor();
  scheduleEditorLayouts();
  if (options.focus !== false) focusEditorControl(cueTextInput);
}

function startPositionEdit(position, options = {}) {
  editingPositionId = position.id;
  positionNameInput.value = position.name;
  positionXInput.value = String(position.x);
  positionYInput.value = String(position.y);
  positionAlignmentInput.value = String(position.alignment);
  renderAlignControl();
  positionSubmitButton.textContent = TEXT.savePosition;
  if (newPositionButton) newPositionButton.hidden = false;
  cancelPositionEditButton.hidden = false;
  positionForm.classList.add('is-editing');
  scheduleEditorLayouts();
  if (options.focus !== false) focusEditorControl(positionNameInput);
}

function setVideoColorPickerActive(active) {
  isVideoColorPicking = Boolean(active && currentVideo?.src);
  videoStage?.classList.toggle('is-picking-color', isVideoColorPicking);
  if (isVideoColorPicking) {
    videoColorPickerResult.hidden = false;
  }
  videoColorPickerButton?.setAttribute(
    'aria-pressed',
    isVideoColorPicking ? 'true' : 'false',
  );
  videoColorPickerButton?.setAttribute(
    'aria-label',
    isVideoColorPicking ? TEXT.pickVideoColorActive : TEXT.pickVideoColor,
  );
  if (videoColorPickerButton) {
    videoColorPickerButton.title = isVideoColorPicking
      ? TEXT.pickVideoColorActive
      : TEXT.pickVideoColor;
  }
}

function clearPickedVideoColor() {
  videoColorPickerResult.hidden = true;
  videoColorSwatch.style.background = '';
  videoColorInput.value = '';
  setVideoColorPickerActive(false);
}

function getVideoContentPoint(event) {
  if (!currentVideo?.videoWidth || !currentVideo.videoHeight) return null;

  const rect = currentVideo.getBoundingClientRect();
  const videoRatio = currentVideo.videoWidth / currentVideo.videoHeight;
  const boxRatio = rect.width / rect.height;
  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;

  if (boxRatio > videoRatio) {
    width = rect.height * videoRatio;
    left += (rect.width - width) / 2;
  } else if (boxRatio < videoRatio) {
    height = rect.width / videoRatio;
    top += (rect.height - height) / 2;
  }

  const ratioX = (event.clientX - left) / width;
  const ratioY = (event.clientY - top) / height;
  if (ratioX < 0 || ratioX > 1 || ratioY < 0 || ratioY > 1) return null;

  return {
    x: Math.min(
      currentVideo.videoWidth - 1,
      Math.max(0, Math.floor(ratioX * currentVideo.videoWidth)),
    ),
    y: Math.min(
      currentVideo.videoHeight - 1,
      Math.max(0, Math.floor(ratioY * currentVideo.videoHeight)),
    ),
  };
}

function formatPickedVideoColor([red, green, blue]) {
  return `rgba(${red}, ${green}, ${blue}, 1)`;
}

function sampleVideoColorFromEvent(event) {
  if (!isVideoColorPicking) return false;
  const point = getVideoContentPoint(event);
  if (!point) return false;

  try {
    const context = videoColorSampleCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    context.drawImage(currentVideo, point.x, point.y, 1, 1, 0, 0, 1, 1);
    const color = formatPickedVideoColor(context.getImageData(0, 0, 1, 1).data);
    videoColorSwatch.style.background = color;
    videoColorInput.value = color;
    videoColorPickerResult.hidden = false;
    return true;
  } catch (error) {
    setVideoColorPickerActive(false);
    updatePreviewMeta(TEXT.pickVideoColorFailed);
    return false;
  }
}

function handleVideoColorPointerMove(event) {
  if (!isVideoColorPicking) return;
  event.preventDefault();
  sampleVideoColorFromEvent(event);
}

function handleVideoColorPointerDown(event) {
  if (!isVideoColorPicking) return;
  event.preventDefault();
  event.stopPropagation();
  if (sampleVideoColorFromEvent(event)) {
    setVideoColorPickerActive(false);
    videoColorInput.select();
  }
}

function currentPreviewCue() {
  if (cachedCues.length === 0) return undefined;

  const videoTime = currentVideo?.currentTime || 0;
  const activeCue = cachedCues.find((cue) => {
    const start = parseTimeToSeconds(cue.start);
    const end = parseTimeToSeconds(cue.end);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      videoTime >= start &&
      videoTime <= end
    );
  });

  return currentVideo?.src ? activeCue : cachedCues[0];
}

function updatePreviewMeta(status) {
  const cue = currentPreviewCue();
  const style = cue ? getStyleById(cue.styleId) : undefined;
  renderVideoSubtitleOverlay(cue, style);

  if (status) {
    previewMeta.textContent = status;
    return;
  }
  if (!cue) {
    previewMeta.textContent = currentVideo?.src
      ? TEXT.noCueAtCurrentTime
      : TEXT.loadVideoForPreview;
    return;
  }

  previewMeta.textContent = currentVideo?.src
    ? `JASSUB · ${formatTimeInput(cue.start)} → ${formatTimeInput(cue.end)} · ${style?.name || 'Default'}`
    : TEXT.loadVideoForPreview;
}

function renderVideoSubtitleOverlay(cue, style) {
  if (!useDomSubtitleFallback || !currentVideo?.src || !cue) {
    videoSubtitleOverlay.hidden = true;
    videoSubtitleOverlay.textContent = '';
    return;
  }

  videoSubtitleOverlay.hidden = false;
  const normalizedStyle = normalizeStyle(style || {});
  const cuePreviewStyle = styleWithResolvedCueFontSize(
    cueStyleWithOverrides(normalizedStyle, cue),
    cue,
  );
  videoSubtitleOverlay.className = `video-subtitle-overlay video-subtitle-overlay--${
    cuePreviewStyle.position.legacy || 'bottom-center'
  }`;
  videoSubtitleOverlay.textContent = stripAssMarkup(cue.text) || cue.text;
  applySubtitlePreviewStyle(videoSubtitleOverlay, cuePreviewStyle, 0.5);
}

function syncSafeZoneOverlay() {
  if (!reelsSafeZoneOverlay || !safeZoneOverlayToggle) return;
  reelsSafeZoneOverlay.hidden = !safeZoneOverlayToggle.checked;
}

function loadJassubModule() {
  if (!jassubModulePromise) {
    jassubModulePromise = import(JASSUB_MODULE_URL).then(
      (module) => module.default || module.JASSUB || module,
    );
  }

  return jassubModulePromise;
}

async function destroyJassubRenderer() {
  const renderer = jassubRenderer;
  jassubRenderer = undefined;
  jassubTrack = '';

  if (renderer?.destroy) {
    await renderer.destroy();
  }
}

async function repaintJassubFrame() {
  if (
    !jassubRenderer ||
    !currentVideo.videoWidth ||
    !currentVideo.videoHeight
  ) {
    return;
  }

  await jassubRenderer.ready;
  const frame = {
    expectedDisplayTime: performance.now(),
    width: currentVideo.videoWidth,
    height: currentVideo.videoHeight,
    mediaTime: currentVideo.currentTime || 0,
  };
  await jassubRenderer.manualRender(frame);
  await jassubRenderer.resize(true, frame.width, frame.height);
}

async function renderJassubPreview() {
  const token = ++jassubRenderToken;
  const ass = assOutput.value || generateAss();

  if (!currentVideo?.src) {
    await destroyJassubRenderer();
    useDomSubtitleFallback = false;
    updatePreviewMeta(TEXT.loadVideoForPreview);
    return;
  }

  if (cachedCues.length === 0) {
    await destroyJassubRenderer();
    useDomSubtitleFallback = false;
    updatePreviewMeta(TEXT.addCuesForPreview);
    return;
  }

  try {
    if (!jassubRenderer) {
      updatePreviewMeta(TEXT.jassubLoading);
      const JASSUB = await loadJassubModule();
      if (token !== jassubRenderToken) return;

      const fontConfig = buildJassubFontConfig();
      jassubRenderer = new JASSUB({
        video: currentVideo,
        subContent: ass,
        workerUrl: JASSUB_WORKER_URL,
        wasmUrl: JASSUB_WASM_URL,
        modernWasmUrl: JASSUB_MODERN_WASM_URL,
        prescaleFactor: 4,
        prescaleHeightLimit: REQUIRED_UPLOAD_VIDEO_HEIGHT,
        maxRenderHeight: REQUIRED_UPLOAD_VIDEO_HEIGHT,
        defaultFont: 'liberation sans',
        fonts: fontConfig.fonts,
        availableFonts: fontConfig.availableFonts,
        queryFonts: false,
      });
      await jassubRenderer.ready;
      await jassubRenderer.renderer.setTrack(ass);
      jassubTrack = ass;
      if (token !== jassubRenderToken) return;
      await repaintJassubFrame();
    } else if (ass !== jassubTrack) {
      await jassubRenderer.ready;
      await jassubRenderer.renderer.setTrack(ass);
      jassubTrack = ass;
      await repaintJassubFrame();
    }

    useDomSubtitleFallback = false;
    updatePreviewMeta();
  } catch (error) {
    await destroyJassubRenderer();
    useDomSubtitleFallback = true;
    console.error(error);
    updatePreviewMeta(
      error instanceof Error ? `JASSUB: ${error.message}` : TEXT.jassubFailed,
    );
  }
}

function syncAssOutputControls() {
  const hasAssText = Boolean(assOutput.value.trim());
  downloadAssButton.disabled = !hasAssText;
  if (resetAssButton) {
    resetAssButton.disabled = !assOutputManuallyEdited;
  }
}

function renderAssOutput(options = {}) {
  const force = Boolean(options.force);
  const videoChanged = assOutputVideoHash !== currentVideoHash;

  if (videoChanged) {
    assOutputManuallyEdited = false;
    assOutputVideoHash = currentVideoHash;
  }

  if (force || videoChanged || !assOutputManuallyEdited) {
    assOutput.value = generateAss();
    assOutputManuallyEdited = false;
    assOutputVideoHash = currentVideoHash;
  }

  syncAssOutputControls();
}

function renderSubtitledVideoControls() {
  const canRender = Boolean(currentVideoHash && cachedCues.length > 0);
  renderSubtitledVideoButton.disabled = !canRender;

  if (ffmpegCommandExample) {
    ffmpegCommandExample.textContent =
      'ffmpeg -i input.mp4 -vf "subtitles=subtitles.ass:fontsdir=./web/subs/fonts" -c:v libx264 -crf 18 -preset veryfast -c:a copy output.mp4';
  }

  if (!canRender) {
    renderedVideoResult.hidden = true;
    renderSubtitledVideoStatus.textContent = currentVideoHash
      ? TEXT.addCues
      : TEXT.addVideoAndCues;
    return;
  }

  const renderedVideo = currentVideoHash
    ? cachedRenderedVideos.get(currentVideoHash)
    : null;
  if (renderedVideo?.videoUrl) {
    showRenderedVideoLinks(renderedVideo);
  } else {
    renderedVideoResult.hidden = true;
    renderSubtitledVideoStatus.textContent = TEXT.readyToRender;
  }
}

function showRenderedVideoLinks(renderedVideo) {
  if (!renderedVideo?.videoUrl) return;

  renderedVideoLink.href = renderedVideo.videoUrl;
  renderedVideoLink.textContent = TEXT.video;
  renderedVideoDownloadLink.href = `/subs-api/videos/${renderedVideo.hash || currentVideoHash}/render/download`;
  renderedVideoResult.hidden = false;
  renderSubtitledVideoStatus.textContent = `${TEXT.done} · ${formatBytes(renderedVideo.size)} · ${renderedVideo.mimeType || 'video/mp4'}`;
}

function updateVideoControls() {
  const duration = Number.isFinite(currentVideo.duration)
    ? currentVideo.duration
    : 0;
  const currentTime = Number.isFinite(currentVideo.currentTime)
    ? currentVideo.currentTime
    : 0;

  videoPlayButton.innerHTML = currentVideo.paused
    ? VIDEO_ICONS.play
    : VIDEO_ICONS.pause;
  videoPlayButton.setAttribute(
    'aria-label',
    currentVideo.paused ? TEXT.play : TEXT.pause,
  );
  videoMuteButton.innerHTML = currentVideo.muted
    ? VIDEO_ICONS.muted
    : VIDEO_ICONS.volume;
  videoMuteButton.setAttribute(
    'aria-label',
    currentVideo.muted ? TEXT.unmute : TEXT.mute,
  );
  videoSeekInput.max = String(duration);
  if (document.activeElement !== videoSeekInput) {
    videoSeekInput.value = String(currentTime);
  }
  videoTimeLabel.textContent = `${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`;
  updateCueTimelinePlayhead(currentTime);
}

function renderExport() {
  renderAssOutput();
  renderSubtitledVideoControls();
  void renderJassubPreview();
}

async function ensureDefaultStyle() {
  const styles = await readStyles();
  if (styles.length > 0) return;

  await saveStyle({
    id: createId('style'),
    name: 'Default',
    font: 'Montserrat',
    fontSize: 72,
    fontVariant: 'regular',
    primaryColor: 'rgba(255, 255, 255, 1)',
    secondaryColor: 'rgba(0, 0, 0, 1)',
    outlineColor: 'none',
    backColor: 'none',
    badgeColor: 'none',
    badgePaddingX: 24,
    badgePaddingY: 12,
    badgeRadius: 20,
    boxColor: 'none',
    boxPadding: 8,
    lineSpacingOverride: 0,
    stretchToWidth: false,
    marginLeft: null,
    marginRight: null,
    positionId: defaultPosition().id,
    createdAt: new Date().toISOString(),
  });
}

async function ensureDefaultPositions() {
  const positions = await readPositions();
  if (positions.length > 0) return;

  await Promise.all(
    DEFAULT_POSITIONS.map((position, index) =>
      savePosition({
        ...position,
        createdAt: new Date(Date.now() + index).toISOString(),
      }),
    ),
  );
}

async function refreshEditor() {
  await reloadStylePositionLookups();
  cachedPositions = await readPositions();
  cachedStyles = await readStyles();
  cachedCues = currentVideoHash ? await readCuesForVideo(currentVideoHash) : [];
  renderPositions();
  renderStyles();
  renderCues();
  renderExport();
}

function uploadVideo(file) {
  const formData = new FormData();
  formData.append('video', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/subs-api/videos');
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      progress.hidden = false;
      const percent = Math.round((event.loaded / event.total) * 100);
      progressBar.style.width = `${percent}%`;
      uploadStatus.textContent = `${TEXT.uploading}: ${percent}%`;
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }

      reject(new Error(xhr.response?.message || 'Upload failed'));
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

async function uploadAndOpenVideoFile(file, options = {}) {
  const { statusText = TEXT.preparingUpload } = options;

  uploadButton.disabled = true;
  uploadStatus.textContent = statusText;
  fileMeta.textContent = `${file.name} · ${formatBytes(file.size)} · ${file.type || 'video'}`;
  progress.hidden = true;
  progressBar.style.width = '0%';

  try {
    await validateUploadVideoFile(file);
  } catch (error) {
    uploadStatus.textContent =
      error instanceof Error ? error.message : TEXT.videoMetadataFailed;
    return null;
  }

  try {
    const uploaded = await uploadVideo(file);
    const localizedUpload = {
      ...uploaded,
      pageUrl: getSubsPagePath(uploaded.hash),
      absolutePageUrl: getAbsoluteSubsPageUrl(uploaded.hash),
    };
    await saveVideo(localizedUpload);
    await rememberSubsSourceVideo(localizedUpload);
    await refreshList();
    uploadStatus.textContent = `${TEXT.done}: ${localizedUpload.absolutePageUrl}`;
    window.history.replaceState(null, '', localizedUpload.pageUrl);
    await loadCurrentVideo();
    return localizedUpload;
  } catch (error) {
    uploadStatus.textContent =
      error instanceof Error ? error.message : TEXT.uploadFailed;
    return null;
  } finally {
    uploadButton.disabled = false;
  }
}

async function extractAudio() {
  if (!currentVideoHash) return;

  extractAudioButton.disabled = true;
  audioStatus.textContent = TEXT.extractAudio;

  try {
    const response = await fetch(`/subs-api/videos/${currentVideoHash}/audio`, {
      method: 'POST',
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || TEXT.extractAudioFailed);
    }

    const patch = {
      audioUrl: payload.audioUrl,
      audioMimeType: payload.mimeType,
      audioSize: payload.size,
      waveform: payload.waveform,
      audioCreatedAt: payload.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const updated = await SF.patchVideoByHash(currentVideoHash, patch);
    await rememberSubsAudioFile(currentVideoHash, payload);
    renderAudioPanel(updated || { ...patch, hash: currentVideoHash });
    await refreshList();
  } catch (error) {
    audioStatus.textContent =
      error instanceof Error ? error.message : TEXT.extractAudioFailed;
  } finally {
    extractAudioButton.disabled = false;
  }
}

async function transcribeAudio() {
  if (!currentVideoHash) return;

  const language = getSelectedTranscriptionLanguage();
  transcribeAudioButton.disabled = true;
  transcriptionStatus.textContent = TEXT.transcribing;

  try {
    const response = await fetch(
      `/subs-api/videos/${currentVideoHash}/audio/transcript`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
      },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || TEXT.transcribeFailed);
    }

    const existing = await SF.getVideoByHash(currentVideoHash);
    const transcripts = {
      ...(existing?.transcripts || {}),
      [payload.language || language]: payload,
    };
    const updated = await SF.patchVideoByHash(currentVideoHash, {
      transcripts,
      updatedAt: new Date().toISOString(),
    });
    renderTranscription(updated || { ...existing, transcripts });
    await refreshList();
  } catch (error) {
    transcriptionStatus.textContent =
      error instanceof Error ? error.message : TEXT.transcribeFailed;
  } finally {
    transcribeAudioButton.disabled = false;
  }
}

async function saveEditedTranscription() {
  if (!currentVideoHash || transcriptionOutput.hidden) return;

  const language = getSelectedTranscriptionLanguage();
  const existing = await SF.getVideoByHash(currentVideoHash);
  const transcript = existing?.transcripts?.[language];
  if (!transcript) return;

  const outputKey =
    activeTranscriptOutputKey || getTranscriptOutputKey(language);
  const transcripts = {
    ...(existing.transcripts || {}),
    [language]: {
      ...transcript,
      [outputKey]: transcriptionOutput.value,
      [getTranscriptSentencesKey(outputKey)]:
        transcriptionSentencesOutput.value,
      editedAt: new Date().toISOString(),
    },
  };
  const updated = await SF.patchVideoByHash(currentVideoHash, {
    transcripts,
    updatedAt: new Date().toISOString(),
  });
  renderTranscription(updated || { ...existing, transcripts });
  transcriptionStatus.textContent = `${TEXT.saved} · ${
    activeTranscriptOutputLanguage || language
  } · ${TEXT.edited}`;
}

async function translateTranscription() {
  if (!currentVideoHash || transcriptionOutput.hidden) return;

  const language = getSelectedTranscriptionLanguage();
  const targetLanguage = getSelectedTranslationLanguage();
  if (!targetLanguage) {
    transcriptionStatus.textContent = TEXT.targetLanguageRequired;
    return;
  }

  translateTranscriptionButton.disabled = true;
  transcriptionStatus.textContent = TEXT.translating;

  try {
    const response = await fetch(
      `/subs-api/videos/${currentVideoHash}/audio/transcript/translate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: transcriptionOutput.value,
          sourceLanguage: language,
          targetLanguage,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || TEXT.translateFailed);
    }

    const existing = await SF.getVideoByHash(currentVideoHash);
    const transcript = existing?.transcripts?.[language];
    if (!transcript) return;

    const outputKey = getTranscriptTranslationOutputKey(targetLanguage);
    activeTranscriptOutputKey = outputKey;
    activeTranscriptOutputLanguage = targetLanguage;
    const transcripts = {
      ...(existing.transcripts || {}),
      [language]: {
        ...transcript,
        [outputKey]: payload.text,
        translatedTo: targetLanguage,
        translatedAt: payload.createdAt || new Date().toISOString(),
        translationModel: payload.model,
      },
    };
    await SF.patchVideoByHash(currentVideoHash, {
      transcripts,
      updatedAt: new Date().toISOString(),
    });
    transcriptionOutput.value = payload.text;
    transcriptionSentencesOutput.value = buildSentencesText(payload.text);
    setTranscriptionOutputsVisible(true);
    saveTranscriptionButton.hidden = false;
    transcriptionTranslationPanel.hidden = false;
    transcriptionToCuesPanel.hidden = false;
    transcriptionStatus.textContent = `${TEXT.translated} · ${targetLanguage}`;
    await refreshList();
  } catch (error) {
    transcriptionStatus.textContent =
      error instanceof Error ? error.message : TEXT.translateFailed;
  } finally {
    translateTranscriptionButton.disabled = false;
  }
}

function parseTranscriptionWords(text) {
  return text
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+(?:\.\d{1,3})?)\s+(.+)$/);
      if (!match) return null;

      return {
        start: Number(match[1]),
        word: match[2].trim(),
      };
    })
    .filter((word) => word && Number.isFinite(word.start) && word.word);
}

function buildCuesFromWords(words) {
  return words.map((word, index) => {
    const nextWord = words[index + 1];
    return {
      text: word.word,
      start: word.start,
      end: nextWord ? nextWord.start : word.start + 0.8,
    };
  });
}

async function createCuesFromTranscription() {
  if (!currentVideoHash || transcriptionOutput.hidden) return;
  if (!transcriptionCueStyleInput.value) {
    transcriptionStatus.textContent = TEXT.chooseCueStyle;
    return;
  }

  const sentenceLines = parseTranscriptionWords(
    transcriptionSentencesOutput.value,
  );
  const wordLines = parseTranscriptionWords(transcriptionOutput.value);
  const words = sentenceLines.length > 0 ? sentenceLines : wordLines;
  if (words.length === 0) {
    transcriptionStatus.textContent = TEXT.noWordLines;
    return;
  }

  const cueDrafts = buildCuesFromWords(words);
  if (sentenceLines.length > 0 && wordLines.length > 0) {
    const lastWord = wordLines[wordLines.length - 1];
    const lastCue = cueDrafts[cueDrafts.length - 1];
    lastCue.end = Math.max(lastCue.end, lastWord.start + 0.8);
  }
  const createdAt = Date.now();
  for (const [index, cue] of cueDrafts.entries()) {
    await saveCue({
      id: createId('cue'),
      videoHash: currentVideoHash,
      text: cue.text,
      start: formatTimeInput(String(cue.start)),
      end: formatTimeInput(String(cue.end)),
      styleId: transcriptionCueStyleInput.value,
      createdAt: new Date(createdAt + index).toISOString(),
    });
  }

  await touchCurrentVideoUpdated();
  await refreshEditor();
  transcriptionStatus.textContent = `${TEXT.cuesCreated}: ${cueDrafts.length}`;
}

async function renderSubtitledVideo() {
  if (!currentVideoHash || cachedCues.length === 0) return;

  renderSubtitledVideoButton.disabled = true;
  renderSubtitledVideoSpinner.hidden = false;
  renderedVideoResult.hidden = true;

  try {
    const response = await fetch(
      `/subs-api/videos/${currentVideoHash}/render`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ass: assOutput.value || generateAss() }),
      },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || TEXT.renderFailed);
    }

    const renderedVideo = {
      hash: currentVideoHash,
      videoUrl: payload.videoUrl,
      mimeType: payload.mimeType,
      size: payload.size,
      createdAt: payload.createdAt,
    };
    cachedRenderedVideos.set(currentVideoHash, renderedVideo);
    await SF.patchVideoByHash(currentVideoHash, {
      renderedVideo,
      updatedAt: new Date().toISOString(),
    });
    await rememberSubsRenderedFile(renderedVideo);
    showRenderedVideoLinks(renderedVideo);
  } catch (error) {
    renderSubtitledVideoStatus.textContent =
      error instanceof Error ? error.message : TEXT.renderFailed;
  } finally {
    renderSubtitledVideoSpinner.hidden = true;
    renderSubtitledVideoButton.disabled = !(
      currentVideoHash && cachedCues.length > 0
    );
  }
}

async function refreshList() {
  if (!linksList || !emptyState || !clearLinksButton) return;

  renderVideos(await readVideos());
}

function getVideoHashFromPath() {
  const match = window.location.pathname.match(
    /^\/subs(?:\/en)?\/([a-f0-9]{24})\/?$/,
  );
  return match ? match[1] : null;
}

function setVideoBoundPanelVisible(visible) {
  if (videoBoundPanel) videoBoundPanel.hidden = !visible;
}

async function applyVideoContext(hash) {
  const previousHash = currentVideoHash;
  currentVideoHash = hash;

  if (!hash) {
    setVideoBoundPanelVisible(false);
    renderAudioPanel(null);
    cachedRenderedVideos.clear();
    renderSubtitledVideoControls();
    currentVideoSection.hidden = true;
    currentVideo.src = '';
    clearPickedVideoColor();
    setCurrentVideoMetaLink(null, '');
    await destroyJassubRenderer();
    if (previousHash) {
      resetCueForm();
      cachedCues = [];
      renderCues();
      renderExport();
    }
    return;
  }

  setVideoBoundPanelVisible(true);

  if (previousHash !== hash) {
    resetCueForm();
    await destroyJassubRenderer();
    cachedCues = await readCuesForVideo(hash);
    renderCues();
    renderExport();
  }
}

async function loadCurrentVideo() {
  const hash = getVideoHashFromPath();
  await applyVideoContext(hash);
  if (!hash) return;

  const response = await fetch(`/subs-api/videos/${hash}`);
  if (!response.ok) {
    setCurrentVideoMetaLink(null, TEXT.linkFetchFailed);
    currentVideo.src = '';
    clearPickedVideoColor();
    currentVideoSection.hidden = false;
    updateVideoControls();
    return;
  }

  const video = await response.json();
  const localizedVideo = {
    ...video,
    pageUrl: getSubsPagePath(hash),
    absolutePageUrl: getAbsoluteSubsPageUrl(hash),
  };
  await destroyJassubRenderer();
  currentVideo.crossOrigin = 'anonymous';
  currentVideo.src = getSubsSourceVideoUrl(hash);
  clearPickedVideoColor();
  setCurrentVideoMetaLink(localizedVideo.absolutePageUrl);
  currentVideoSection.hidden = false;
  updateVideoControls();
  void renderJassubPreview();

  const existing = await SF.getVideoByHash(hash);
  if (!existing) {
    const saved = await saveVideo({
      ...localizedVideo,
      ...getAudioPatch(localizedVideo.audio),
      originalName: `${TEXT.videoName} ${hash}`,
      mimeType: 'video',
      size: 0,
    });
    await rememberSubsSourceVideo(saved);
    renderAudioPanel(saved);
    renderSubtitledVideoControls();
    return;
  }

  if (existing.renderedVideo?.videoUrl) {
    cachedRenderedVideos.set(hash, existing.renderedVideo);
  }

  const patched = await SF.patchVideoByHash(hash, {
    videoUrl: localizedVideo.videoUrl,
    absolutePageUrl: localizedVideo.absolutePageUrl,
    pageUrl: localizedVideo.pageUrl,
    ...getAudioPatch(localizedVideo.audio),
  });
  await rememberSubsSourceVideo(patched || existing);
  if (localizedVideo.audio)
    await rememberSubsAudioFile(hash, localizedVideo.audio);
  renderAudioPanel(patched || existing);
  renderSubtitledVideoControls();
}

input.addEventListener('change', async () => {
  const validationToken = (uploadValidationToken += 1);
  const file = input.files?.[0];
  uploadButton.disabled = true;
  fileMeta.textContent = file
    ? `${file.name} · ${formatBytes(file.size)} · ${file.type || 'video'}`
    : TEXT.fileMeta;
  uploadStatus.textContent = '';
  progress.hidden = true;
  progressBar.style.width = '0%';

  if (!file) return;

  try {
    await validateUploadVideoFile(file);
    if (validationToken !== uploadValidationToken) return;
    uploadButton.disabled = false;
  } catch (error) {
    if (validationToken !== uploadValidationToken) return;
    uploadStatus.textContent =
      error instanceof Error ? error.message : TEXT.videoMetadataFailed;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = input.files?.[0];
  if (!file) return;

  await uploadAndOpenVideoFile(file);
});

if (clearLinksButton) {
  clearLinksButton.addEventListener('click', async () => {
    const active = await readVideos();
    await Promise.all(
      active.map((video) => deleteRecord(VIDEO_STORE, video.hash)),
    );
    await refreshList();
  });
}

currentVideo.addEventListener('timeupdate', () => {
  updateVideoControls();
  updatePreviewMeta();
  if (currentVideo.paused) void repaintJassubFrame();
});
currentVideo.addEventListener('seeked', () => {
  updateVideoControls();
  updatePreviewMeta();
  void repaintJassubFrame();
});
currentVideo.addEventListener('loadedmetadata', () => {
  clearPickedVideoColor();
  renderCues();
  updateVideoControls();
  updatePreviewMeta();
  void renderJassubPreview();
});
currentVideo.addEventListener('durationchange', renderCues);
currentVideo.addEventListener('loadeddata', () => {
  updateVideoControls();
  void repaintJassubFrame();
});
currentVideo.addEventListener('play', () => {
  updateVideoControls();
  void repaintJassubFrame();
});
currentVideo.addEventListener('pause', updateVideoControls);
currentVideo.addEventListener('volumechange', updateVideoControls);

safeZoneOverlayToggle?.addEventListener('change', syncSafeZoneOverlay);
syncSafeZoneOverlay();

videoColorPickerButton?.addEventListener('click', () => {
  setVideoColorPickerActive(!isVideoColorPicking);
});
videoStage?.addEventListener('pointermove', handleVideoColorPointerMove);
videoStage?.addEventListener('pointerdown', handleVideoColorPointerDown);
videoColorInput?.addEventListener('focus', () => {
  videoColorInput.select();
});
videoColorInput?.addEventListener('click', () => {
  videoColorInput.select();
});

videoPlayButton.addEventListener('click', () => {
  if (currentVideo.paused) {
    void currentVideo.play();
  } else {
    currentVideo.pause();
  }
});

videoSeekInput.addEventListener('input', () => {
  currentVideo.currentTime = Number(videoSeekInput.value) || 0;
  updateVideoControls();
  void repaintJassubFrame();
});

videoMuteButton.addEventListener('click', () => {
  currentVideo.muted = !currentVideo.muted;
});

extractAudioButton.addEventListener('click', () => {
  void extractAudio();
});

transcribeAudioButton.addEventListener('click', () => {
  void transcribeAudio();
});
setSentenceTimingsButton.addEventListener('click', setSentenceTimings);

saveTranscriptionButton.addEventListener('click', () => {
  void saveEditedTranscription();
});
translateTranscriptionButton.addEventListener('click', () => {
  void translateTranscription();
});
createCuesFromTranscriptionButton.addEventListener('click', () => {
  void createCuesFromTranscription();
});
transcriptionLanguageInput.addEventListener('change', async () => {
  if (!currentVideoHash) {
    renderTranscription(null);
    return;
  }

  renderTranscription(await SF.getVideoByHash(currentVideoHash));
});
translationLanguageInput.addEventListener('change', async () => {
  if (!currentVideoHash) {
    renderTranscription(null);
    return;
  }

  renderTranscription(await SF.getVideoByHash(currentVideoHash));
});

audioPlayer.addEventListener('loadedmetadata', redrawCurrentAudioWaveform);
audioPlayer.addEventListener('durationchange', redrawCurrentAudioWaveform);
audioPlayer.addEventListener('timeupdate', redrawCurrentAudioWaveform);
audioPlayer.addEventListener('seeking', redrawCurrentAudioWaveform);
audioPlayer.addEventListener('seeked', redrawCurrentAudioWaveform);
audioPlayer.addEventListener('play', startAudioWaveformAnimation);
audioPlayer.addEventListener('pause', () => {
  stopAudioWaveformAnimation();
  redrawCurrentAudioWaveform();
});
audioPlayer.addEventListener('ended', () => {
  stopAudioWaveformAnimation();
  redrawCurrentAudioWaveform();
});
window.addEventListener('resize', redrawCurrentAudioWaveform);
window.addEventListener('resize', resyncEditorLayouts);

[
  styleNameInput,
  styleFontInput,
  styleFontSizeInput,
  styleFontVariantInput,
  styleLineSpacingInput,
  stylePrimaryColorInput,
  styleSecondaryColorInput,
  styleOutlineColorInput,
  styleBackColorInput,
  styleBadgeColorInput,
  styleBadgePaddingXInput,
  styleBadgePaddingYInput,
  styleBadgeRadiusInput,
  styleBoxColorInput,
  styleBoxPaddingInput,
  styleStretchToWidthInput,
  styleMarginLeftInput,
  styleMarginRightInput,
  stylePositionInput,
].forEach((inputElement) => {
  inputElement.addEventListener('input', renderStyleLivePreview);
  inputElement.addEventListener('change', renderStyleLivePreview);
});

[styleMarginLeftInput, styleMarginRightInput].forEach((inputElement) => {
  inputElement.addEventListener('input', syncStyleStretchControls);
  inputElement.addEventListener('change', syncStyleStretchControls);
});

async function enableFontFamilies(families) {
  const toEnable = SF.sanitizeFamilies(families).filter(
    (family) => !enabledFontFamilies.includes(family),
  );
  if (toEnable.length === 0) return;

  await SF.writeEnabledFontFamilies([...enabledFontFamilies, ...toEnable]);
  await loadEnabledFontFamilies();
  populateStyleFontOptions();
  populateCueFontOptions();
}

async function importStylesFromAss() {
  if (!styleAssImportInput) return;

  const drafts = styleAssImportInput.value
    .split(/\r?\n/)
    .map((line) => parseAssStyleLine(line))
    .filter(Boolean);

  if (drafts.length === 0) {
    if (styleAssImportStatus) {
      styleAssImportStatus.textContent = TEXT.assImportNoStyles;
    }
    return;
  }

  await enableFontFamilies(
    drafts.filter((draft) => draft.fontMatched).map((draft) => draft.font),
  );

  const takenNames = new Set(
    cachedStyles.map((style) => String(style.name || '').toLowerCase()),
  );
  const unknownFonts = new Set();
  const now = new Date().toISOString();

  for (const draft of drafts) {
    if (!draft.fontMatched && draft.rawFont) unknownFonts.add(draft.rawFont);

    let name = String(draft.name || 'Style').trim() || 'Style';
    if (takenNames.has(name.toLowerCase())) {
      let suffix = 2;
      while (takenNames.has(`${name} ${suffix}`.toLowerCase())) suffix += 1;
      name = `${name} ${suffix}`;
    }
    takenNames.add(name.toLowerCase());

    await saveStyle({
      id: createId('style'),
      name,
      font: draft.font,
      fontSize: draft.fontSize,
      fontVariant: draft.fontVariant,
      lineSpacingOverride: 0,
      primaryColor: draft.primaryColor,
      secondaryColor: draft.secondaryColor,
      outlineColor: draft.outlineColor,
      backColor: draft.backColor,
      badgeColor: 'none',
      badgePaddingX: 24,
      badgePaddingY: 12,
      badgeRadius: 20,
      boxColor: draft.boxColor,
      boxPadding: draft.boxPadding,
      stretchToWidth: false,
      marginLeft: null,
      marginRight: null,
      positionId: positionIdForAlignment(draft.alignment),
      createdAt: now,
    });
  }

  await destroyJassubRenderer();
  await refreshEditor();

  styleAssImportInput.value = '';
  if (styleAssImportStatus) {
    const parts = [TEXT.assImportDone.replace('{count}', String(drafts.length))];
    if (unknownFonts.size > 0) {
      parts.push(
        TEXT.assImportUnknownFonts.replace(
          '{fonts}',
          [...unknownFonts].join(', '),
        ),
      );
    }
    styleAssImportStatus.textContent = parts.join(' · ');
  }
}

styleForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const wasEditing = Boolean(editingStyleId);
  const styleId = editingStyleId || createId('style');
  const existingStyle = editingStyleId
    ? getStyleById(editingStyleId)
    : undefined;
  await saveStyle({
    id: styleId,
    name: styleNameInput.value.trim(),
    font: styleFontInput.value,
    fontSize: Number(styleFontSizeInput.value) || 72,
    fontVariant: styleFontVariantInput.value,
    lineSpacingOverride: styleLineSpacingInput.value,
    primaryColor: stylePrimaryColorInput.value,
    secondaryColor: styleSecondaryColorInput.value,
    outlineColor: styleOutlineColorInput.value,
    backColor: styleBackColorInput.value,
    badgeColor: styleBadgeColorInput.value,
    badgePaddingX: styleBadgePaddingXInput.value,
    badgePaddingY: styleBadgePaddingYInput.value,
    badgeRadius: styleBadgeRadiusInput.value,
    boxColor: styleBoxColorInput.value,
    boxPadding: styleBoxPaddingInput.value,
    stretchToWidth: styleStretchToWidthInput.checked,
    marginLeft: normalizeOptionalStretchMarginValue(styleMarginLeftInput.value),
    marginRight: normalizeOptionalStretchMarginValue(
      styleMarginRightInput.value,
    ),
    positionId: stylePositionInput.value,
    createdAt: existingStyle?.createdAt || new Date().toISOString(),
  });

  await destroyJassubRenderer();
  await refreshEditor();
  if (wasEditing) {
    const savedStyle = getStyleById(styleId);
    if (savedStyle) {
      startStyleEdit(savedStyle, { focus: false });
    } else {
      resetStyleForm();
    }
  } else {
    resetStyleForm();
  }
});

cueForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentVideoHash || !cueStyleInput.value) return;

  const wasEditing = Boolean(editingCueId);
  const cueId = editingCueId || createId('cue');
  const existingCue = editingCueId
    ? cachedCues.find((cue) => cue.id === editingCueId)
    : undefined;
  const motion = readCueMotionFromForm();
  const overrides = readCueOverridesFromForm();
  await saveCue({
    id: cueId,
    videoHash: currentVideoHash,
    text: cueTextInput.value.trim(),
    start: formatTimeInput(cueStartInput.value),
    end: formatTimeInput(cueEndInput.value),
    styleId: cueStyleInput.value,
    fontOverride: overrides.fontOverride,
    colorOverride: overrides.colorOverride,
    fontSizeOverride: overrides.fontSizeOverride,
    fontVariantOverride: overrides.fontVariantOverride,
    lineSpacingOverride: overrides.lineSpacingOverride,
    stretchToWidthOverride: overrides.stretchToWidthOverride,
    marginLeftOverride: overrides.marginLeftOverride,
    marginRightOverride: overrides.marginRightOverride,
    secondaryColorOverride: overrides.secondaryColorOverride,
    outlineColorOverride: overrides.outlineColorOverride,
    backColorOverride: overrides.backColorOverride,
    badgeColorOverride: overrides.badgeColorOverride,
    badgePaddingXOverride: overrides.badgePaddingXOverride,
    badgePaddingYOverride: overrides.badgePaddingYOverride,
    badgeRadiusOverride: overrides.badgeRadiusOverride,
    boxColorOverride: overrides.boxColorOverride,
    boxPaddingOverride: overrides.boxPaddingOverride,
    positionIdOverride: overrides.positionIdOverride,
    motionDx: motion.motionDx,
    motionDy: motion.motionDy,
    motionStartMs: motion.motionStartMs,
    motionMs: motion.motionMs,
    createdAt: existingCue?.createdAt || new Date().toISOString(),
  });

  await touchCurrentVideoUpdated();
  await refreshEditor();
  if (wasEditing) {
    const savedCue = cachedCues.find((cue) => cue.id === cueId);
    if (savedCue) {
      startCueEdit(savedCue, { focus: false });
    } else {
      resetCueForm();
    }
  } else {
    resetCueForm();
  }
});

cancelStyleEditButton.addEventListener('click', resetStyleForm);
cancelCueEditButton.addEventListener('click', resetCueForm);
closeCueEditorButton.addEventListener('click', resetCueForm);
deleteCueButton.addEventListener('click', async () => {
  if (!editingCueId) return;
  const ok = await window.AppDialog.confirm(TEXT.deleteCueConfirm, {
    danger: true,
  });
  if (!ok) return;

  const cueId = editingCueId;
  resetCueForm();
  await deleteCue(cueId);
  await touchCurrentVideoUpdated();
  await refreshEditor();
});
deleteAllCuesButton.addEventListener('click', async () => {
  if (!currentVideoHash || cachedCues.length === 0) return;
  const ok = await window.AppDialog.confirm(TEXT.deleteAllCuesConfirm, {
    danger: true,
  });
  if (!ok) return;

  deleteAllCuesButton.disabled = true;
  try {
    await deleteCuesForVideo(currentVideoHash);
    resetCueForm();
    await touchCurrentVideoUpdated();
    await refreshEditor();
  } finally {
    deleteAllCuesButton.disabled = cachedCues.length === 0;
  }
});
cancelPositionEditButton.addEventListener('click', resetPositionForm);
newStyleButton?.addEventListener('click', () => {
  resetStyleForm();
  focusEditorControl(styleNameInput);
});
importStyleAssButton?.addEventListener('click', async () => {
  importStyleAssButton.disabled = true;
  try {
    await importStylesFromAss();
  } finally {
    importStyleAssButton.disabled = false;
  }
});
newCueButton?.addEventListener('click', () => {
  openNewCueEditor();
});
newPositionButton?.addEventListener('click', () => {
  resetPositionForm();
  focusEditorControl(positionNameInput);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !cueEditorOpen) return;

  event.preventDefault();
  resetCueForm();
});
alignControlButtons.forEach((button) => {
  button.addEventListener('click', () => {
    positionAlignmentInput.value = button.dataset.alignCell;
    renderAlignControl();
  });
});

positionForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const wasEditing = Boolean(editingPositionId);
  const positionId = editingPositionId || createId('position');
  const existingPosition = editingPositionId
    ? cachedPositions.find((position) => position.id === editingPositionId)
    : undefined;
  await savePosition({
    id: positionId,
    name: positionNameInput.value.trim(),
    x: Math.round(Number(positionXInput.value) || 0),
    y: Math.round(Number(positionYInput.value) || 0),
    alignment: Number(positionAlignmentInput.value) || 2,
    createdAt: existingPosition?.createdAt || new Date().toISOString(),
  });

  await destroyJassubRenderer();
  await refreshEditor();
  if (wasEditing) {
    const savedPosition = cachedPositions.find(
      (position) => position.id === positionId,
    );
    if (savedPosition) {
      startPositionEdit(savedPosition, { focus: false });
    } else {
      resetPositionForm();
    }
  } else {
    resetPositionForm();
  }
});

downloadAssButton.addEventListener('click', () => {
  const blob = new Blob([assOutput.value], {
    type: 'text/plain;charset=utf-8',
  });
  void rememberUserFile({
    id: `subs:${currentVideoHash || 'draft'}:ass`,
    sourceApp: 'subs',
    origin: 'subs-ass',
    name: 'subtitles.ass',
    blob,
    mimeType: 'text/plain;charset=utf-8',
    size: blob.size,
    createdAt: new Date().toISOString(),
    pageUrl: currentVideoHash
      ? getSubsPagePath(currentVideoHash)
      : IS_EN
        ? '/subs/en'
        : '/subs/',
    description: currentVideoHash
      ? `ASS-файл субтитров для видео ${currentVideoHash}.`
      : 'ASS-файл субтитров, созданный на странице Subs.',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'subtitles.ass';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

assOutput.addEventListener('input', () => {
  assOutputManuallyEdited = true;
  assOutputVideoHash = currentVideoHash;
  syncAssOutputControls();
});

resetAssButton?.addEventListener('click', () => {
  renderAssOutput({ force: true });
  void renderJassubPreview();
});

renderSubtitledVideoButton.addEventListener('click', () => {
  void renderSubtitledVideo();
});

refreshPreviewButton.addEventListener('click', () => {
  void renderJassubPreview();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void reloadFontPickerFromDb();
  }
});

window.addEventListener('popstate', () => {
  void loadCurrentVideo().then(() => refreshEditor());
});

let editorSectionPrefs = { ...SF.DEFAULT_SECTIONS_OPEN };
let sectionSaveTimer;

function applyEditorSectionPrefs(prefs) {
  editorSectionPrefs = { ...SF.DEFAULT_SECTIONS_OPEN, ...prefs };
  document
    .querySelectorAll('.editor-section[data-section]')
    .forEach((section) => {
      const key = section.dataset.section;
      if (key in editorSectionPrefs) {
        section.open = editorSectionPrefs[key];
      }
    });
}

function initEditorSections() {
  document
    .querySelectorAll('.editor-section[data-section]')
    .forEach((section) => {
      section.addEventListener('toggle', () => {
        const key = section.dataset.section;
        if (!key) return;
        editorSectionPrefs = {
          ...editorSectionPrefs,
          [key]: section.open,
        };
        clearTimeout(sectionSaveTimer);
        sectionSaveTimer = setTimeout(() => {
          void SF.writeEditorSectionPrefs(editorSectionPrefs);
        }, 120);
      });
    });
}

async function importSourceFileFromQuery() {
  const sourceFileId = getSourceFileIdFromQuery();
  if (!sourceFileId || getVideoHashFromPath()) return;

  if (!window.UserFilesRegistry?.get) {
    uploadStatus.textContent = TEXT.importSourceVideoFailed;
    return;
  }

  uploadStatus.textContent = TEXT.importingSourceVideo;

  try {
    const storedRecord = await window.UserFilesRegistry.get(sourceFileId);
    const record =
      storedRecord ||
      (/^subs:[a-f0-9]{24}:(source|render)$/.test(sourceFileId)
        ? { id: sourceFileId }
        : null);
    const file = await registryRecordToVideoFile(record);
    await uploadAndOpenVideoFile(file, {
      statusText: TEXT.importingSourceVideo,
    });
  } catch (error) {
    uploadStatus.textContent =
      error instanceof Error ? error.message : TEXT.importSourceVideoFailed;
  }
}

async function init() {
  initExperimentalCueWorkbench();
  await loadEnabledFontFamilies();
  populateStyleFontOptions();
  populateCueFontOptions();
  initializeColorPickers();
  renderAlignControl();
  applyEditorSectionPrefs(await SF.readEditorSectionPrefs());
  const cuesSection = document.querySelector(
    '.editor-section[data-section="cues"]',
  );
  if (cuesSection) cuesSection.open = true;
  initEditorSections();
  updateVideoControls();
  await loadCurrentVideo();
  await importSourceFileFromQuery();
  await ensureDefaultPositions();
  cachedPositions = await readPositions();
  await ensureDefaultStyle();
  await refreshList();
  await refreshEditor();
}

init().catch((error) => {
  uploadStatus.textContent =
    error instanceof Error ? error.message : TEXT.loadingError;
});
