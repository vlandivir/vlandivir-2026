(() => {
  'use strict';

  const DEFAULT_TEXT = {
    en: {
      doNotDraw: 'Do not draw',
      chooseColor: 'Choose color',
      shade: 'Shade',
      customColor: 'Custom RGBA',
      customColorPlaceholder: 'rgba(255, 255, 255, 0.65)',
      applyCustomColor: 'Apply color',
      invalidColor: 'Use rgba(255, 255, 255, 0.6)',
      whiteAndBlack: 'white and black',
      inherit: 'Inherit',
    },
    ru: {
      doNotDraw: 'Не рисовать',
      chooseColor: 'Выбрать цвет',
      shade: 'Оттенок',
      customColor: 'Свой RGBA',
      customColorPlaceholder: 'rgba(255, 255, 255, 0.65)',
      applyCustomColor: 'Применить цвет',
      invalidColor: 'Введите rgba(255, 255, 255, 0.6)',
      whiteAndBlack: 'белый и черный',
      inherit: 'Наследовать',
    },
  };

  function getDefaultBaseColors(isEn) {
    return [
      {
        name: isEn ? 'White and black' : 'Белый и черный',
        value: '#ffffff',
        split: true,
      },
      { name: isEn ? 'Yellow' : 'Желтый', value: '#eab308' },
      { name: isEn ? 'Warm' : 'Теплый', value: '#e07a5f' },
      { name: isEn ? 'Red' : 'Красный', value: '#ef4444' },
      { name: isEn ? 'Orange' : 'Оранжевый', value: '#f97316' },
      { name: isEn ? 'Green' : 'Зеленый', value: '#22c55e' },
      { name: isEn ? 'Blue' : 'Синий', value: '#3b82f6' },
      { name: isEn ? 'Purple' : 'Фиолетовый', value: '#8b5cf6' },
      { name: isEn ? 'Pink' : 'Розовый', value: '#ec4899' },
    ];
  }

  function isNoneColor(color) {
    return color === 'none';
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rgbToHex([red, green, blue]) {
    return `#${[red, green, blue]
      .map((channel) =>
        Math.round(clampNumber(channel, 0, 255))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  }

  function parseColorChannel(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const isPercent = text.endsWith('%');
    const number = Number.parseFloat(isPercent ? text.slice(0, -1) : text);
    if (!Number.isFinite(number)) return null;
    return Math.round(clampNumber(isPercent ? (number / 100) * 255 : number, 0, 255));
  }

  function parseAlphaChannel(value) {
    const text = String(value ?? '').trim();
    if (!text) return 1;
    const isPercent = text.endsWith('%');
    const number = Number.parseFloat(isPercent ? text.slice(0, -1) : text);
    if (!Number.isFinite(number)) return null;
    return clampNumber(isPercent ? number / 100 : number, 0, 1);
  }

  function formatAlpha(alpha) {
    return String(Math.round(alpha * 1000) / 1000)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
  }

  function parseHexColor(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
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

  function parseRgbColor(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^rgba?\((.+)\)$/i);
    if (!match) return null;

    const [colorPart, alphaPart = ''] = match[1].split('/').map((part) => part.trim());
    const components = colorPart.includes(',')
      ? colorPart.split(',').map((part) => part.trim())
      : colorPart.split(/\s+/).filter(Boolean);
    const inlineAlpha = components.length === 4 ? components.pop() : '';
    if (components.length !== 3) return null;

    const red = parseColorChannel(components[0]);
    const green = parseColorChannel(components[1]);
    const blue = parseColorChannel(components[2]);
    const alpha = parseAlphaChannel(alphaPart || inlineAlpha);
    if ([red, green, blue, alpha].some((channel) => channel === null)) return null;

    return { red, green, blue, alpha };
  }

  function parseCssColor(value) {
    if (typeof value !== 'string') return null;
    const color = value.trim().toLowerCase();
    if (!color) return null;
    if (color === 'transparent') {
      return { red: 0, green: 0, blue: 0, alpha: 0 };
    }
    return parseHexColor(color) || parseRgbColor(color);
  }

  function normalizeParsedColor(color) {
    if (!color) return '';
    const red = Math.round(clampNumber(color.red, 0, 255));
    const green = Math.round(clampNumber(color.green, 0, 255));
    const blue = Math.round(clampNumber(color.blue, 0, 255));
    const alpha = clampNumber(color.alpha ?? 1, 0, 1);
    return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(alpha)})`;
  }

  function normalizeHex(value) {
    const color = parseHexColor(value);
    return color && color.alpha >= 1
      ? rgbToHex([color.red, color.green, color.blue])
      : '#ffffff';
  }

  function normalizeColor(value, fallback = 'rgba(255, 255, 255, 1)') {
    return (
      normalizeParsedColor(parseCssColor(value)) ||
      normalizeParsedColor(parseCssColor(fallback)) ||
      fallback
    );
  }

  function hexToRgb(hex) {
    const color = parseCssColor(hex) || parseCssColor('#ffffff');
    return [color.red, color.green, color.blue];
  }

  function hasColorAlpha(color) {
    const parsed = parseCssColor(color);
    return parsed ? parsed.alpha < 1 : false;
  }

  function paintSwatch(element, color) {
    const normalized = normalizeColor(color);
    element.style.setProperty('--color-picker-swatch-color', normalized);
    element.classList.toggle('has-alpha', hasColorAlpha(normalized));
    element.style.background = hasColorAlpha(normalized) ? '' : normalized;
  }

  function mixColor(color, target, amount) {
    const sourceRgb = hexToRgb(color);
    const targetRgb = hexToRgb(target);
    return rgbToHex(
      sourceRgb.map(
        (channel, index) => channel + (targetRgb[index] - channel) * amount,
      ),
    );
  }

  function isAchromaticColor(color) {
    const [red, green, blue] = hexToRgb(color);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return max - min < 24;
  }

  function getShades(baseColor) {
    const normalizedBase = normalizeHex(baseColor);

    if (normalizedBase === '#ffffff' || normalizedBase === '#000000') {
      return [
        '#ffffff',
        '#e0e0e0',
        '#c2c2c2',
        '#a3a3a3',
        '#858585',
        '#666666',
        '#474747',
        '#292929',
        '#000000',
      ];
    }

    if (normalizedBase === '#eab308') {
      return [
        '#fefce8',
        '#fef9c3',
        '#fef08a',
        '#fde047',
        '#facc15',
        '#eab308',
        '#ca8a04',
        '#a16207',
        '#713f12',
      ];
    }

    if (normalizedBase === '#e07a5f') {
      return [
        '#fff1eb',
        '#ffe0d4',
        '#ffcbb8',
        '#f5a88a',
        '#ec9274',
        '#e07a5f',
        '#c4614a',
        '#a34d3b',
        '#7d3a2d',
      ];
    }

    return [
      mixColor(normalizedBase, '#ffffff', 0.72),
      mixColor(normalizedBase, '#ffffff', 0.55),
      mixColor(normalizedBase, '#ffffff', 0.38),
      mixColor(normalizedBase, '#ffffff', 0.2),
      normalizedBase,
      mixColor(normalizedBase, '#000000', 0.16),
      mixColor(normalizedBase, '#000000', 0.32),
      mixColor(normalizedBase, '#000000', 0.48),
      mixColor(normalizedBase, '#000000', 0.64),
    ];
  }

  function findClosestBaseColor(color, baseColors) {
    if (!color || isNoneColor(color)) return baseColors[0];
    if (isAchromaticColor(color)) return baseColors[0];

    const rgb = hexToRgb(color);
    return baseColors.reduce(
      (closest, baseColor) => {
        const baseRgb = hexToRgb(baseColor.value);
        const distance = baseRgb.reduce((sum, channel, index) => {
          const delta = channel - rgb[index];
          return sum + delta * delta;
        }, 0);
        return distance < closest.distance ? { baseColor, distance } : closest;
      },
      { baseColor: baseColors[0], distance: Number.POSITIVE_INFINITY },
    ).baseColor;
  }

  function formatColorLabel(value) {
    return normalizeColor(value, value);
  }

  function setColorInputValue(input, value) {
    input.value =
      value === 'none' || value === '' ? value : normalizeColor(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closeColorPicker(pickerElement) {
    if (!pickerElement) return;
    pickerElement.classList.remove('is-open');
    pickerElement
      .querySelector('.color-picker__trigger')
      ?.setAttribute('aria-expanded', 'false');
  }

  function closeOtherColorPickers(activePicker) {
    document.querySelectorAll('.color-picker.is-open').forEach((picker) => {
      if (picker !== activePicker) {
        closeColorPicker(picker);
      }
    });
  }

  function closeAllColorPickers() {
    document.querySelectorAll('.color-picker.is-open').forEach(closeColorPicker);
  }

  function initialize(options = {}) {
    const isEn = document.documentElement.lang?.startsWith('en');
    const text = {
      ...DEFAULT_TEXT[isEn ? 'en' : 'ru'],
      ...(options.text || {}),
    };
    const baseColors = (options.baseColors || getDefaultBaseColors(isEn)).map(
      (color) => ({
        ...color,
        value: normalizeHex(color.value),
      }),
    );
    const root = options.root || document;
    const pickerElements = root.querySelectorAll('[data-color-picker]');

    for (const pickerElement of pickerElements) {
      const input = document.getElementById(pickerElement.dataset.colorPicker);
      if (!input) continue;

      pickerElement.textContent = '';
      pickerElement.classList.add('color-picker');
      pickerElement.dataset.colorPickerInitialized = 'true';

      const allowNone = pickerElement.dataset.allowNone === 'true';
      const allowInherit = pickerElement.dataset.inherit === 'true';
      const inheritLabel = pickerElement.dataset.inheritLabel || text.inherit;
      let selectedBase = findClosestBaseColor(input.value, baseColors);
      let keepSelectedBaseOnNextChange = false;

      const triggerButton = document.createElement('button');
      triggerButton.className = 'color-picker__trigger';
      triggerButton.type = 'button';
      triggerButton.setAttribute('aria-expanded', 'false');

      const selectedSwatch = document.createElement('span');
      selectedSwatch.className = 'color-picker__selected-swatch';

      const selectedLabel = document.createElement('span');
      selectedLabel.className = 'color-picker__selected-label';

      triggerButton.append(selectedSwatch, selectedLabel);

      const panel = document.createElement('div');
      panel.className = 'color-picker__panel';

      const baseGrid = document.createElement('div');
      baseGrid.className = 'color-picker__grid';

      const shadeGrid = document.createElement('div');
      shadeGrid.className = 'color-picker__grid color-picker__grid--shades';

      const customForm = document.createElement('form');
      customForm.className = 'color-picker__custom';

      const customInput = document.createElement('input');
      customInput.className = 'color-picker__custom-input';
      customInput.type = 'text';
      customInput.placeholder = text.customColorPlaceholder;
      customInput.setAttribute('aria-label', text.customColor);
      customInput.spellcheck = false;

      const customButton = document.createElement('button');
      customButton.className = 'color-picker__custom-apply';
      customButton.type = 'submit';
      customButton.textContent = 'OK';
      customButton.title = text.applyCustomColor;
      customButton.setAttribute('aria-label', text.applyCustomColor);

      customForm.append(customInput, customButton);

      const resetButton = document.createElement('button');
      resetButton.className = 'color-picker__reset';
      resetButton.type = 'button';
      resetButton.title = text.doNotDraw;
      resetButton.setAttribute('aria-label', text.doNotDraw);
      resetButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      `;
      resetButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setColorInputValue(input, 'none');
        renderPicker();
      });

      const inheritButton = document.createElement('button');
      inheritButton.className = 'color-picker__reset color-picker__inherit';
      inheritButton.type = 'button';
      inheritButton.title = inheritLabel;
      inheritButton.setAttribute('aria-label', inheritLabel);
      inheritButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
      `;
      inheritButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setColorInputValue(input, '');
        renderPicker();
      });

      panel.append(baseGrid, shadeGrid, customForm);
      if (allowNone || allowInherit) {
        const pickerRow = document.createElement('div');
        pickerRow.className = 'color-picker__row';
        pickerRow.append(triggerButton);
        if (allowInherit) pickerRow.append(inheritButton);
        if (allowNone) pickerRow.append(resetButton);
        pickerElement.append(pickerRow, panel);
      } else {
        pickerElement.append(triggerButton, panel);
      }

      triggerButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeOtherColorPickers(pickerElement);
        pickerElement.classList.add('is-open');
        triggerButton.setAttribute('aria-expanded', 'true');
      });

      pickerElement.addEventListener('click', (event) => {
        event.stopPropagation();
      });

      function renderButton(color, label, onClick, isActive, buttonOptions = {}) {
        const button = document.createElement('button');
        button.className = 'color-picker__swatch';
        button.type = 'button';
        button.title = buttonOptions.split
          ? `${label} — ${text.whiteAndBlack}`
          : label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (buttonOptions.split) {
          button.classList.add('color-picker__swatch--split');
        } else {
          paintSwatch(button, color);
        }
        if (isActive) button.classList.add('is-active');
        if (buttonOptions.familyActive) button.classList.add('is-family-active');
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          onClick();
        });
        button.addEventListener('dblclick', (event) => {
          event.stopPropagation();
          event.preventDefault();
          onClick();
          closeColorPicker(pickerElement);
        });
        return button;
      }

      function applyCustomColor() {
        const rawValue = customInput.value.trim();
        if (allowInherit && rawValue === '') {
          setColorInputValue(input, '');
          customInput.setCustomValidity('');
          customInput.classList.remove('is-invalid');
          renderPicker();
          return;
        }
        if (allowNone && rawValue.toLowerCase() === 'none') {
          setColorInputValue(input, 'none');
          customInput.setCustomValidity('');
          customInput.classList.remove('is-invalid');
          renderPicker();
          return;
        }

        const normalized = normalizeColor(rawValue, '');
        if (!normalized) {
          customInput.setCustomValidity(text.invalidColor);
          customInput.classList.add('is-invalid');
          customInput.reportValidity();
          return;
        }

        customInput.setCustomValidity('');
        customInput.classList.remove('is-invalid');
        setColorInputValue(input, normalized);
        renderPicker();
      }

      customForm.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyCustomColor();
      });

      customInput.addEventListener('input', () => {
        customInput.setCustomValidity('');
        customInput.classList.remove('is-invalid');
      });

      function renderPicker() {
        const isInherit = allowInherit && input.value === '';
        const value =
          input.value === 'none' || isInherit
            ? input.value
            : normalizeColor(input.value);
        const isNone = isNoneColor(value);
        const shades = getShades(selectedBase.value);

        selectedSwatch.classList.toggle('is-none', isNone);
        selectedSwatch.classList.toggle('is-inherit', isInherit);
        if (!isNone && !isInherit) {
          paintSwatch(selectedSwatch, value);
        } else {
          selectedSwatch.style.background = '';
          selectedSwatch.style.removeProperty('--color-picker-swatch-color');
          selectedSwatch.classList.remove('has-alpha');
        }
        selectedLabel.textContent = isInherit
          ? inheritLabel
          : isNone
            ? text.doNotDraw.toLowerCase()
            : formatColorLabel(value);
        customInput.value = isNone || isInherit ? '' : value;
        triggerButton.setAttribute(
          'aria-label',
          `${text.chooseColor}: ${selectedLabel.textContent}`,
        );
        resetButton.classList.toggle('is-active', isNone);
        inheritButton.classList.toggle('is-active', isInherit);

        baseGrid.replaceChildren(
          ...baseColors.map((baseColor) =>
            renderButton(
              baseColor.value,
              baseColor.name,
              () => {
                selectedBase = baseColor;
                keepSelectedBaseOnNextChange = true;
                setColorInputValue(input, baseColor.value);
                renderPicker();
              },
              !isNone && value === normalizeColor(baseColor.value),
              {
                split: baseColor.split,
                familyActive: !isNone && selectedBase.value === baseColor.value,
              },
            ),
          ),
        );

        shadeGrid.replaceChildren(
          ...shades.map((shade, index) =>
            renderButton(
              shade,
              `${text.shade} ${index + 1}`,
              () => {
                keepSelectedBaseOnNextChange = true;
                setColorInputValue(input, shade);
                renderPicker();
              },
              !isNone && value === normalizeColor(shade),
            ),
          ),
        );
      }

      input.addEventListener('change', () => {
        if (keepSelectedBaseOnNextChange) {
          keepSelectedBaseOnNextChange = false;
        } else {
          selectedBase = findClosestBaseColor(input.value, baseColors);
        }
        renderPicker();
      });
      renderPicker();
    }

    if (!document.documentElement.dataset.colorPickerCloseListener) {
      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.color-picker')) return;
        closeAllColorPickers();
      });
      document.documentElement.dataset.colorPickerCloseListener = 'true';
    }
  }

  window.VlandivirColorPicker = {
    closeAll: closeAllColorPickers,
    initialize,
    isNoneColor,
    normalizeColor,
    setColorInputValue,
  };
})();
