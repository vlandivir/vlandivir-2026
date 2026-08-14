(function initVideoUploadBlock(global) {
  function read(root, name, fallback = '') {
    const value = root.dataset[name];
    return typeof value === 'string' ? value : fallback;
  }

  function setOptionalId(element, id) {
    if (id) element.id = id;
  }

  function render(root) {
    if (!root || root.dataset.videoUploadBlockReady === 'true') return;
    root.dataset.videoUploadBlockReady = 'true';
    root.classList.add('upload-panel');
    root.setAttribute('aria-label', read(root, 'label', 'Video upload'));

    const form = document.createElement('form');
    form.className = 'upload-form';
    setOptionalId(form, read(root, 'formId'));

    const inputId = read(root, 'inputId', 'videoInput');
    const picker = document.createElement('label');
    picker.className = 'file-picker';
    picker.setAttribute('for', inputId);

    const pickerTitle = document.createElement('span');
    pickerTitle.className = 'file-picker__title';
    pickerTitle.textContent = read(root, 'pickerTitle', 'Choose video');

    picker.append(pickerTitle);

    const pickerMetaId = read(root, 'metaId');
    const pickerMetaText = read(root, 'pickerMeta');
    if (pickerMetaId || pickerMetaText) {
      const pickerMeta = document.createElement('span');
      pickerMeta.className = 'file-picker__meta';
      setOptionalId(pickerMeta, pickerMetaId);
      pickerMeta.textContent = pickerMetaText;
      picker.append(pickerMeta);
    }

    const input = document.createElement('input');
    input.id = inputId;
    input.name = read(root, 'inputName', 'video');
    input.type = 'file';
    input.accept = read(root, 'accept', 'video/*');

    const button = document.createElement('button');
    button.className = 'primary-link upload-button';
    setOptionalId(button, read(root, 'buttonId'));
    button.type = read(root, 'buttonType', 'submit');
    button.textContent = read(root, 'buttonLabel', 'Upload');
    if (read(root, 'buttonDisabled') === 'true') button.disabled = true;

    form.append(picker, input, button);

    const progress = document.createElement('div');
    progress.className = 'progress';
    setOptionalId(progress, read(root, 'progressId'));
    progress.hidden = true;

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    setOptionalId(progressBar, read(root, 'progressBarId'));
    progress.append(progressBar);

    const status = document.createElement('p');
    status.className = 'upload-status';
    setOptionalId(status, read(root, 'statusId'));
    status.setAttribute('role', 'status');

    root.replaceChildren(form, progress, status);
  }

  function renderAll() {
    document.querySelectorAll('[data-video-upload-block]').forEach(render);
  }

  global.VlandivirVideoUploadBlock = { render, renderAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll, { once: true });
  } else {
    renderAll();
  }
})(window);
