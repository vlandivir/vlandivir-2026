# Шрифты для редактора субтитров `/subs`

Документ для людей и ИИ-агентов: как добавлять шрифты, что уже подключено, лицензии и проверка кириллицы.

## Зачем эта папка

- TTF-файлы отдаются JASSUB (`buildJassubFontConfig()` в `web/subs/app.js`) и браузеру (`fonts.css`).
- Список семейств — единый источник правды: массив `SUBTITLE_FONTS` в `web/subs/fonts-shared.js`.
- Основной каталог — **бесплатные (OFL)** шрифты, проверенные на кириллицу; явное исключение: **Bebas Neue** — латинский display-шрифт без кириллицы. Отдельная партия display-шрифтов 2026-07-12 (см. ниже) — freeware не под OFL, лицензии описаны по каждому.

## Рекомендации для Reels / Shorts (кириллица)

| Роль | Семейства в бандле | Заметка |
|------|-------------------|---------|
| Крупные заголовки, хук | Bebas Neue Cyrillic, Oswald, Alumni Sans, Yanone Kaffeesatz, Russo One, Unbounded, Oi, Lack | Узкие/дисплейные, хорошо в 72–120 px |
| Нейтральные субтитры | Montserrat, Inter, Roboto, Noto Sans, Golos Text, Onest, Finlandica | Читаемость на 9:16 |
| Засечки / editorial | Spectral, Bitter, PT Serif, Playfair Display, Merriweather, Literata, Cormorant Garamond, EB Garamond, IBM Plex Serif | Длинный текст, спокойный тон |
| Конструктив / tech | Advent Pro, Tektur, Arsenal | Рилс с «техно»-вайбом |
| «Трендовый» геометрический | Manrope, Rubik, Jost, Commissioner | Округлые формы |
| Техно / спорт | Exo 2, Geologica | Наклон и ширина |
| Мягкий lifestyle | Comfortaa, Nunito Sans | Для лайфстайл-рилс |
| Каллиграфия / formal script | Great Vibes | Короткие фразы, не для длинных субтитров |
| Плотный текст в две строки | Roboto Condensed, PT Sans Narrow, Fira Sans Extra Condensed, Sofia Sans Extra Condensed, Ubuntu Condensed, PT Sans, Fira Sans, Source Sans 3 | Узкая ширина |
| Акцент одной фразой | Russo One (только regular) | Не для длинных абзацев |

Не добавлять в список без кириллицы: **Anton**, **Archivo Black**, **Poppins**, **DM Sans**, **League Spartan** (файлы могут лежать в папке исторически — в `SUBTITLE_FONTS` не включать). **Bebas Neue** добавлен как явное латинское исключение по запросу.

## Правила добавления нового шрифта

1. **Лицензия** — только SIL Open Font License (OFL) или эквивалент, разрешающий встраивание в веб-приложение. Сохранить `OFL.txt` из репозитория Google Fonts рядом с TTF при первом импорте семейства (опционально, но желательно).
2. **Кириллица** — обязательна. Проверить **конкретные** `.ttf`, которые кладёте в папку (не страницу Google Fonts):
   ```bash
   python3 -c "
   from fontTools.ttLib import TTFont
   import sys
   path = sys.argv[1]
   cmap = TTFont(path)['cmap'].getBestCmap()
   cyr = [cp for cp in cmap if 0x0400 <= cp <= 0x04FF]
   print(path, 'Cyrillic glyphs:', len(cyr))
   assert len(cyr) >= 60, 'No Cyrillic in this file'
   " web/subs/fonts/NEW-FONT-400.ttf
   ```
3. **Имена файлов** — kebab-case, вес в суффиксе: `family-name-400.ttf` / `.otf`, `family-name-700.ttf` / `.otf`. Для display-only (один начертание): один файл на оба веса в `SUBTITLE_FONTS`.
4. **Положить файлы** в `web/subs/fonts/` (предпочтительно TTF; OTF допустим — `generate-fonts-css.py` подставит `format('opentype')`).
5. **Добавить запись** в `SUBTITLE_FONTS` в `web/subs/fonts-shared.js` (поле `family` = имя для ASS/UI, как в Google Fonts).
6. **Перегенерировать CSS**:
   ```bash
   python3 web/subs/fonts/generate-fonts-css.py
   ```
7. **Селект в UI** — только шрифты, отмеченные на странице [`/font`](/font) (IndexedDB `fontPrefs`). Список по умолчанию: Montserrat, Bebas Neue Cyrillic, Inter, Roboto, Oswald, Golos Text — см. `DEFAULT_ENABLED_FAMILIES` в `fonts-shared.js`.
8. **Обновить этот файл** — строку в таблице «Текущий каталог».
9. **Cache-bust** в `web/subs/index.html`: параметр `?v=` у `fonts/fonts.css` и `app.js`.

### Variable fonts (Google Fonts)

Если в репозитории только `.ttf` variable:

```bash
python3 -c "
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
vf = TTFont('path/to/VariableFont.ttf')
for w in (400, 700):
    inst = instantiateVariableFont(vf, {'wght': w})
    inst.save(f'web/subs/fonts/slug-{w}.ttf')
"
```

Источник файлов: [google/fonts](https://github.com/google/fonts) → `ofl/<slug>/`.

## Display-подборка для Reels (2026-07-12)

Партия трендовых display-шрифтов с кириллицей (не OFL — freeware с разных каталогов). Внутренние name-таблицы нормализованы fontTools (family приведён к имени в `SUBTITLE_FONTS`, иначе libass не сматчит шрифт после загрузки).

| Семейство | Файлы | Источник | Лицензия |
|-----------|-------|----------|----------|
| Adventure Indiana Jones | `adventure-indiana-jones-400.ttf` | [ofont.ru](https://ofont.ru/view/5898), кириллизация Amir Islamov | Free (оригинал Pixel Sagas — free personal+commercial). ⚠️ Стиль — производная от лого Indiana Jones (Lucasfilm): ок для субтитров, не для брендинга |
| Headliner No. 45 | `headliner-no-45-400.ttf` | [ffont.ru](https://ffont.ru/en/font/headliner-no-45rus-by-lyajka_1), кириллизация «RUS BY LYAJKA» | ⚠️ **Только personal use** (© Kevin Christopher / KC Fonts; коммерция — лицензия у kcfonts@gmail.com) |
| KULAG | `kulag-400.otf` | [Fontesk](https://fontesk.com/kulag-font/), Pavels Lavrinovics | Free personal + commercial. Только заглавные |
| KULAG Outline | `kulag-outline-400.otf` | там же | там же |
| Rimma Sans | `rimma-sans-400.ttf` | [Fontesk](https://fontesk.com/rimma-sans-font/), Lesha Pushkarev & Vlad Boyko | Free personal + commercial. Одно начертание (bold) |
| Tablon | `tablon-400.ttf`, `tablon-700.ttf` | [uprock](https://www.fonts.uprock.ru/fonts/tablon), Cristian Tournier + кириллизация | Free personal + commercial. 700 = начертание Black; в архиве есть ещё Medium и Round Black |
| Ustroke | `ustroke-400.ttf` | [Fontstorage](https://fontstorage.com/font/tikhon-reztcov/ustroke), Тихон Резцов | Freeware, коммерция разрешена. Только заглавные, гранж |

Не добавлены из той же подборки: **Surfbars** (в бесплатной demo с dafont кириллицы нет — 0 глифов, кириллица только в платной версии [LeoSupply](https://leosupply.co/shop/product/surfbars-font)), **Resident Evil 7 RUS** (non-commercial + права Capcom на начертание), **FE Hero** (коммерческая лицензия 299 ₽ у автора — можно добавить после покупки).

## Подборка videoinfographica.com (vol.1)

Статья: [57+ трендовых шрифтов](https://videoinfographica.com/best-free-fonts-vol1/) (в основном латиница). В бандл добавляем только если: **OFL (или эквивалент для встраивания)**, **кириллица в конкретном файле**, источник с явной лицензией.

### Добавлено из статьи (2026-05-17)

| № в статье | Название | В редакторе | Источник |
|------------|----------|-------------|----------|
| 15 | Finland | **Finlandica** | [Google Fonts Finlandica](https://fonts.google.com/specimen/Finlandica) · [ofl/finlandica](https://github.com/google/fonts/tree/main/ofl/finlandica) |
| 33 | Spectral | **Spectral** | [Google Fonts Spectral](https://fonts.google.com/specimen/Spectral) · [ofl/spectral](https://github.com/google/fonts/tree/main/ofl/spectral) |
| 40 | Lack | **Lack** | [FontsArena](https://fontsarena.com/lack-by-adrien-midzic/) (OFL, zip) · лицензия: `lack-OFL.txt` |
| 56 | Oi! | **Oi** | [Google Fonts Oi](https://fonts.google.com/specimen/Oi) · [ofl/oi](https://github.com/google/fonts/tree/main/ofl/oi) |

Уже были в бандле и тоже фигурируют в статье: **IBM Plex Sans** (№37), **Jost** (№38).

### Не добавлено (типичные причины)

| Причина | Примеры из статьи |
|---------|-------------------|
| Нет кириллицы в файле | Space Grotesk (10), Syne (41), Space Mono (51), Bagnard (35) |
| Нет OFL / только personal / CC с ограничениями | Colus (5), Faune (42), Anodina (20), Big John & Slim Joe (28) |
| SVG / только Photoshop | Buckwheat (12), Acrylic Hand (16), Colortube (6) |
| Нет стабильного OFL-зеркала | Pressuru (54), Wremena (31), Soyuz Grotesk (53) — кириллица есть, лицензия на зеркалах неясна |

Для чисто кириллической подборки авторы ссылаются на [free-cyrillic-fonts-vol1](https://videoinfographica.com/free-cyrillic-fonts-vol1/).

## Подборка free-cyrillic-fonts-vol1

Статья: [42+ кириллических шрифта](https://videoinfographica.com/free-cyrillic-fonts-vol1/). Те же правила: OFL, кириллица в файле, источник [google/fonts](https://github.com/google/fonts) (или явная OFL-лицензия).

### Добавлено из статьи (2026-05-17)

| № | Название в статье | В редакторе | Источник |
|---|-------------------|-------------|----------|
| 04 | Bitter | **Bitter** | [ofl/bitter](https://github.com/google/fonts/tree/main/ofl/bitter) |
| 08 | IBM Plex (Serif) | **IBM Plex Serif** | [ofl/ibmplexserif](https://github.com/google/fonts/tree/main/ofl/ibmplexserif) |
| 09 | PT Serif | **PT Serif** | [ofl/ptserif](https://github.com/google/fonts/tree/main/ofl/ptserif) |
| 10 | Roboto Slab | **Roboto Slab** | [apache/robotoslab](https://github.com/google/fonts/tree/main/apache/robotoslab) |
| 11 | Playfair Display | **Playfair Display** | [ofl/playfairdisplay](https://github.com/google/fonts/tree/main/ofl/playfairdisplay) |
| 12 | Cormorant Garamond | **Cormorant Garamond** | [ofl/cormorantgaramond](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) |
| 27 | Tektur | **Tektur** | [ofl/tektur](https://github.com/google/fonts/tree/main/ofl/tektur) |
| — | Ubuntu (в списке «было ранее») | **Ubuntu** | [ufl/ubuntu](https://github.com/google/fonts/tree/main/ufl/ubuntu) |
| — | Merriweather | **Merriweather** | [ofl/merriweather](https://github.com/google/fonts/tree/main/ofl/merriweather) |
| — | Open Sans | **Open Sans** | [ofl/opensans](https://github.com/google/fonts/tree/main/ofl/opensans) |
| — | Alegreya Sans | **Alegreya Sans** | [ofl/alegreyasans](https://github.com/google/fonts/tree/main/ofl/alegreyasans) |
| — | Arsenal | **Arsenal** | [ofl/arsenal](https://github.com/google/fonts/tree/main/ofl/arsenal) |
| — | EB Garamond | **EB Garamond** | [ofl/ebgaramond](https://github.com/google/fonts/tree/main/ofl/ebgaramond) |
| — | Literata | **Literata** | [ofl/literata](https://github.com/google/fonts/tree/main/ofl/literata) |

Уже были: Golos Text (01), Lack (02), Bebas Neue Cyrillic (03), Inter (06), Spectral (07), IBM Plex Sans (08), PT Sans (09), Roboto (10), Montserrat, Fira Sans, Oswald, Rubik и др.

### Не добавлено из статьи

| Причина | Примеры |
|---------|---------|
| Нет кириллицы в скачанном файле | Ropa Sans (23) — только латиница в OFL-версии |
| Нет OFL / demo / Behance-only | Moniqa (05), Accia (15), Garet (28), Mont (40), NAMU (19) |
| Нет стабильного OFL-зеркала | Wremena (13), Soyuz Grotesk (20), Bluu Next (14) |
| Латиница / ограничения лицензии | Coolvetica (26) |

## Текущий каталог (57 семейств)

Полный список — массив `SUBTITLE_FONTS` в `web/subs/fonts-shared.js`. Ниже — справочник с ссылками.

| Семейство | Файлы в папке | Скачать / источник | Для Reels |
|-----------|---------------|-------------------|-----------|
| Advent Pro | `advent-pro-400.ttf`, `advent-pro-700.ttf` | [Advent Pro](https://fonts.google.com/specimen/Advent+Pro) · [ofl/adventpro](https://github.com/google/fonts/tree/main/ofl/adventpro) | Узкий техно-гротеск; variable инстанцирован в 400/700 |
| Adventure Indiana Jones | `adventure-indiana-jones-400.ttf` (400=700) | [ofont.ru](https://ofont.ru/view/5898) · кириллизация Amir Islamov | «Приключенческий» лого-стиль, только субтитры/заголовки |
| Alegreya Sans | `alegreya-sans-400.ttf`, `alegreya-sans-700.ttf` | [Alegreya Sans](https://fonts.google.com/specimen/Alegreya+Sans) · [ofl/alegreyasans](https://github.com/google/fonts/tree/main/ofl/alegreyasans) | Кирилл. vol.1 |
| Alumni Sans | `alumni-sans-400.ttf`, `alumni-sans-700.ttf` | [Alumni Sans](https://fonts.google.com/specimen/Alumni+Sans) · [ofl/alumnisans](https://github.com/google/fonts/tree/main/ofl/alumnisans) | Высокий афишный/спортивный гротеск |
| Arsenal | `arsenal-400.ttf`, `arsenal-700.ttf` | [Arsenal](https://fonts.google.com/specimen/Arsenal) · [ofl/arsenal](https://github.com/google/fonts/tree/main/ofl/arsenal) | Кирилл. vol.1 |
| Bebas Neue Cyrillic | `bebas-neue-cyrillic-400.ttf` | [Google Fonts](https://fonts.google.com/specimen/Bebas+Neue) (кириллическая сборка) · [ofl/bebasneue](https://github.com/google/fonts/tree/main/ofl/bebasneue) | Заголовки, ALL CAPS |
| Bebas Neue | `bebas-neue-400.ttf` | [Google Fonts Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) · [ofl/bebasneue](https://github.com/google/fonts/tree/main/ofl/bebasneue) | Latin-only, заголовки |
| Bitter | `bitter-400.ttf`, `bitter-700.ttf` | [Bitter](https://fonts.google.com/specimen/Bitter) · [ofl/bitter](https://github.com/google/fonts/tree/main/ofl/bitter) | Кирилл. vol.1 №04, текст с засечками |
| Comfortaa | `comfortaa-400.ttf`, `comfortaa-700.ttf` | [Comfortaa](https://fonts.google.com/specimen/Comfortaa) · [ofl/comfortaa](https://github.com/google/fonts/tree/main/ofl/comfortaa) | Мягкий, дружелюбный |
| Commissioner | `commissioner-400.ttf`, `commissioner-700.ttf` | [Commissioner](https://fonts.google.com/specimen/Commissioner) · [ofl/commissioner](https://github.com/google/fonts/tree/main/ofl/commissioner) | Универсальный |
| Cormorant Garamond | `cormorant-garamond-400.ttf`, `cormorant-garamond-700.ttf` | [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) · [ofl/cormorantgaramond](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) | Кирилл. vol.1 №12 |
| EB Garamond | `eb-garamond-400.ttf`, `eb-garamond-700.ttf` | [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) · [ofl/ebgaramond](https://github.com/google/fonts/tree/main/ofl/ebgaramond) | Кирилл. vol.1, классика |
| Exo 2 | `exo-2-400.ttf`, `exo-2-700.ttf` | [Exo 2](https://fonts.google.com/specimen/Exo+2) · [ofl/exo2](https://github.com/google/fonts/tree/main/ofl/exo2) | Динамика, tech |
| Finlandica | `finlandica-400.ttf`, `finlandica-700.ttf` | [Finlandica](https://fonts.google.com/specimen/Finlandica) · [ofl/finlandica](https://github.com/google/fonts/tree/main/ofl/finlandica) | Статья VI №15 (Finland) |
| Fira Sans | `fira-sans-400.ttf`, `fira-sans-700.ttf` | [Fira Sans](https://fonts.google.com/specimen/Fira+Sans) · [ofl/firasans](https://github.com/google/fonts/tree/main/ofl/firasans) | Длинные субтитры |
| Fira Sans Extra Condensed | `fira-sans-extra-condensed-400.ttf`, `fira-sans-extra-condensed-700.ttf` | [Fira Sans Extra Condensed](https://fonts.google.com/specimen/Fira+Sans+Extra+Condensed) · [ofl/firasansextracondensed](https://github.com/google/fonts/tree/main/ofl/firasansextracondensed) | Мягкий узкий гротеск |
| Geologica | `geologica-400.ttf`, `geologica-700.ttf` | [Geologica](https://fonts.google.com/specimen/Geologica) · [ofl/geologica](https://github.com/google/fonts/tree/main/ofl/geologica) | Современный гротеск |
| Golos Text | `golos-text-400.ttf`, `golos-text-700.ttf` | [Golos Text](https://fonts.google.com/specimen/Golos+Text) · [ofl/golostext](https://github.com/google/fonts/tree/main/ofl/golostext) | Русский UI-текст |
| Great Vibes | `great-vibes-400.ttf` (400=700) | [Great Vibes](https://fonts.google.com/specimen/Great+Vibes) · [ofl/greatvibes](https://github.com/google/fonts/tree/main/ofl/greatvibes) · `great-vibes-OFL.txt` | Каллиграфия / script, кириллица с v1.100 |
| Headliner No. 45 | `headliner-no-45-400.ttf` (400=700) | [ffont.ru](https://ffont.ru/en/font/headliner-no-45rus-by-lyajka_1) · RUS BY LYAJKA | ⚠️ personal use only; плакатный брусковый капс |
| IBM Plex Sans | `ibm-plex-sans-400.ttf`, `ibm-plex-sans-700.ttf` | [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) · [ofl/ibmplexsans](https://github.com/google/fonts/tree/main/ofl/ibmplexsans) | Кирилл. vol.1 №08 |
| IBM Plex Serif | `ibm-plex-serif-400.ttf`, `ibm-plex-serif-700.ttf` | [IBM Plex Serif](https://fonts.google.com/specimen/IBM+Plex+Serif) · [ofl/ibmplexserif](https://github.com/google/fonts/tree/main/ofl/ibmplexserif) | Кирилл. vol.1 №08 |
| Inter | `inter-400.ttf`, `inter-700.ttf` | [Inter](https://fonts.google.com/specimen/Inter) · [ofl/inter](https://github.com/google/fonts/tree/main/ofl/inter) | Кирилл. vol.1 №06 |
| Jost | `jost-400.ttf`, `jost-700.ttf` | [Jost](https://fonts.google.com/specimen/Jost) · [ofl/jost](https://github.com/google/fonts/tree/main/ofl/jost) | Статья VI №38 |
| KULAG | `kulag-400.otf` (400=700) | [Fontesk](https://fontesk.com/kulag-font/) | Советский плакатный капс |
| KULAG Outline | `kulag-outline-400.otf` (400=700) | [Fontesk](https://fontesk.com/kulag-font/) | Контурная версия KULAG |
| Lack | `lack-400.otf`, `lack-700.otf` | [FontsArena Lack](https://fontsarena.com/lack-by-adrien-midzic/) · `lack-OFL.txt` | Кирилл. vol.1 №02 |
| Literata | `literata-400.ttf`, `literata-700.ttf` | [Literata](https://fonts.google.com/specimen/Literata) · [ofl/literata](https://github.com/google/fonts/tree/main/ofl/literata) | Кирилл. vol.1, книжный текст |
| Manrope | `manrope-400.ttf`, `manrope-700.ttf` | [Manrope](https://fonts.google.com/specimen/Manrope) · [ofl/manrope](https://github.com/google/fonts/tree/main/ofl/manrope) | Популярен в рилс |
| Merriweather | `merriweather-400.ttf`, `merriweather-700.ttf` | [Merriweather](https://fonts.google.com/specimen/Merriweather) · [ofl/merriweather](https://github.com/google/fonts/tree/main/ofl/merriweather) | Кирилл. vol.1 |
| Montserrat | `montserrat-400.ttf`, `montserrat-700.ttf` | [Montserrat](https://fonts.google.com/specimen/Montserrat) · [ofl/montserrat](https://github.com/google/fonts/tree/main/ofl/montserrat) | Дефолт стиля |
| Noto Sans | `noto-sans-400.ttf`, `noto-sans-700.ttf` | [Noto Sans](https://fonts.google.com/specimen/Noto+Sans) · [ofl/notosans](https://github.com/google/fonts/tree/main/ofl/notosans) | Максимальная совместимость |
| Nunito Sans | `nunito-sans-400.ttf`, `nunito-sans-700.ttf` | [Nunito Sans](https://fonts.google.com/specimen/Nunito+Sans) · [ofl/nunitosans](https://github.com/google/fonts/tree/main/ofl/nunitosans) | Лайфстайл |
| Oi | `oi-400.ttf` (400=700) | [Oi](https://fonts.google.com/specimen/Oi) · [ofl/oi](https://github.com/google/fonts/tree/main/ofl/oi) | Статья VI №56, гротеск-акцент |
| Onest | `onest-400.ttf`, `onest-700.ttf` | [Onest](https://fonts.google.com/specimen/Onest) · [ofl/onest](https://github.com/google/fonts/tree/main/ofl/onest) | Русский, современный |
| Open Sans | `open-sans-400.ttf`, `open-sans-700.ttf` | [Open Sans](https://fonts.google.com/specimen/Open+Sans) · [ofl/opensans](https://github.com/google/fonts/tree/main/ofl/opensans) | Кирилл. vol.1 |
| Oswald | `oswald-400.ttf`, `oswald-700.ttf` | [Oswald](https://fonts.google.com/specimen/Oswald) · [ofl/oswald](https://github.com/google/fonts/tree/main/ofl/oswald) | Узкий заголовок |
| Playfair Display | `playfair-display-400.ttf`, `playfair-display-700.ttf` | [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) · [ofl/playfairdisplay](https://github.com/google/fonts/tree/main/ofl/playfairdisplay) | Кирилл. vol.1 №11 |
| PT Sans | `pt-sans-400.ttf`, `pt-sans-700.ttf` | [PT Sans](https://fonts.google.com/specimen/PT+Sans) · [ofl/ptsans](https://github.com/google/fonts/tree/main/ofl/ptsans) | Кирилл. vol.1 №09 |
| PT Sans Narrow | `pt-sans-narrow-400.ttf`, `pt-sans-narrow-700.ttf` | [PT Sans Narrow](https://fonts.google.com/specimen/PT+Sans+Narrow) · [ofl/ptsansnarrow](https://github.com/google/fonts/tree/main/ofl/ptsansnarrow) | Узкая кириллическая рабочая лошадка |
| PT Serif | `pt-serif-400.ttf`, `pt-serif-700.ttf` | [PT Serif](https://fonts.google.com/specimen/PT+Serif) · [ofl/ptserif](https://github.com/google/fonts/tree/main/ofl/ptserif) | Кирилл. vol.1 №09 |
| Rimma Sans | `rimma-sans-400.ttf` (400=700) | [Fontesk](https://fontesk.com/rimma-sans-font/) | Жирный дисплейный гротеск, сов. архитектура |
| Roboto | `roboto-400.ttf`, `roboto-700.ttf` | [Roboto](https://fonts.google.com/specimen/Roboto) · [ofl/roboto](https://github.com/google/fonts/tree/main/ofl/roboto) | YouTube-стиль |
| Roboto Condensed | `roboto-condensed-400.ttf`, `roboto-condensed-700.ttf` | [Roboto Condensed](https://fonts.google.com/specimen/Roboto+Condensed) · [ofl/robotocondensed](https://github.com/google/fonts/tree/main/ofl/robotocondensed) | Две строки |
| Roboto Slab | `roboto-slab-400.ttf`, `roboto-slab-700.ttf` | [Roboto Slab](https://fonts.google.com/specimen/Roboto+Slab) · [apache/robotoslab](https://github.com/google/fonts/tree/main/apache/robotoslab) | Кирилл. vol.1 №10 |
| Rubik | `rubik-400.ttf`, `rubik-700.ttf` | [Rubik](https://fonts.google.com/specimen/Rubik) · [ofl/rubik](https://github.com/google/fonts/tree/main/ofl/rubik) | Округлый акцент |
| Russo One | `russo-one-400.ttf` (400=700) | [Russo One](https://fonts.google.com/specimen/Russo+One) · [ofl/russoone](https://github.com/google/fonts/tree/main/ofl/russoone) | Жирный акцент |
| Sofia Sans Extra Condensed | `sofia-sans-extra-condensed-400.ttf`, `sofia-sans-extra-condensed-700.ttf` | [Sofia Sans Extra Condensed](https://fonts.google.com/specimen/Sofia+Sans+Extra+Condensed) · [ofl/sofiasansextracondensed](https://github.com/google/fonts/tree/main/ofl/sofiasansextracondensed) | Очень узкий системный гротеск |
| Spectral | `spectral-400.ttf`, `spectral-700.ttf` | [Spectral](https://fonts.google.com/specimen/Spectral) · [ofl/spectral](https://github.com/google/fonts/tree/main/ofl/spectral) | Статья VI №33, serif |
| Source Sans 3 | `source-sans-3-400.ttf`, `source-sans-3-700.ttf` | [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) · [ofl/sourcesans3](https://github.com/google/fonts/tree/main/ofl/sourcesans3) | Редакторский текст |
| Tablon | `tablon-400.ttf`, `tablon-700.ttf` (700=Black) | [uprock](https://www.fonts.uprock.ru/fonts/tablon) | Плакатный display, кириллизация |
| Tektur | `tektur-400.ttf`, `tektur-700.ttf` | [Tektur](https://fonts.google.com/specimen/Tektur) · [ofl/tektur](https://github.com/google/fonts/tree/main/ofl/tektur) | Кирилл. vol.1 №27, конструктив |
| Ubuntu | `ubuntu-400.ttf`, `ubuntu-700.ttf` | [Ubuntu](https://fonts.google.com/specimen/Ubuntu) · [ufl/ubuntu](https://github.com/google/fonts/tree/main/ufl/ubuntu) | Кирилл. vol.1 |
| Ubuntu Condensed | `ubuntu-condensed-400.ttf` (400=700) | [Ubuntu Condensed](https://fonts.google.com/specimen/Ubuntu+Condensed) · [ufl/ubuntucondensed](https://github.com/google/fonts/tree/main/ufl/ubuntucondensed) | Округлый узкий гротеск |
| Unbounded | `unbounded-400.ttf`, `unbounded-700.ttf` | [Unbounded](https://fonts.google.com/specimen/Unbounded) · [ofl/unbounded](https://github.com/google/fonts/tree/main/ofl/unbounded) | Яркий display |
| Ustroke | `ustroke-400.ttf` (400=700) | [Fontstorage](https://fontstorage.com/font/tikhon-reztcov/ustroke) | Рукописный гранж-капс |
| Yanone Kaffeesatz | `yanone-kaffeesatz-400.ttf`, `yanone-kaffeesatz-700.ttf` | [Yanone Kaffeesatz](https://fonts.google.com/specimen/Yanone+Kaffeesatz) · [ofl/yanonekaffeesatz](https://github.com/google/fonts/tree/main/ofl/yanonekaffeesatz) | Дисплейный вывесочный гротеск |

## Файлы в папке, не входящие в `SUBTITLE_FONTS`

Оставлены для истории или других страниц; **не регистрировать** в JASSUB без проверки кириллицы:

| Файл | Причина исключения |
|------|-------------------|
| `anton-400.ttf`, `archivo-black-400.ttf` | Нет кириллицы в TTF |
| `poppins-*.ttf`, `dm-sans-*.ttf`, `dmsans-*.ttf`, `league-spartan-*.ttf`, `leaguespartan-*.ttf` | Latin-only в скачанных файлах |
| `inter-*.woff2`, `montserrat-*.woff2`, `jetbrains-mono-*.woff2` | Старый формат; редактор использует TTF из таблицы выше |

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `web/subs/fonts-shared.js` → `SUBTITLE_FONTS` | Список для ASS, JASSUB, `<select>` |
| `web/subs/fonts/fonts.css` | `@font-face` для превью в браузере (генерируется) |
| `web/subs/fonts/generate-fonts-css.py` | Парсит `SUBTITLE_FONTS` из `fonts-shared.js` |
| `web/subs/index.html` | Подключает `fonts.css` |

## Чеклист для агента после изменений

- [ ] TTF/OTF лежат в `web/subs/fonts/`
- [ ] Кириллица проверена скриптом выше
- [ ] `SUBTITLE_FONTS` обновлён
- [ ] Запущен `generate-fonts-css.py`
- [ ] `AGENTS.md` — таблица каталога
- [ ] `?v=` в `index.html` увеличен
