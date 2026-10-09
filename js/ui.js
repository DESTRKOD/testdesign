(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('secondary_bg_color');
      tg.setBackgroundColor('bg_color');
    } catch (_) {}
  }

  const THEME_KEY = 'destr_theme';

  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    if (tg?.colorScheme) return tg.colorScheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(pref) {
    document.documentElement.setAttribute('data-theme', resolveTheme(pref));
    localStorage.setItem(THEME_KEY, pref);
    document.querySelectorAll('.theme-check').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.check !== pref);
    });
  }

  applyTheme(localStorage.getItem(THEME_KEY) || 'system');

  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeSet));
  });

  if (tg) {
    tg.onEvent('themeChanged', () => {
      if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') applyTheme('system');
    });
  }

  function haptic(type) {
    if (!tg?.HapticFeedback) return;
    try {
      if (type === 'selection') tg.HapticFeedback.selectionChanged();
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else tg.HapticFeedback.impactOccurred(type || 'light');
    } catch (_) {}
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-haptic]');
    if (el) haptic(el.dataset.haptic);
  });

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === id);
    });
    window.scrollTo(0, 0);
  }

  const params = new URLSearchParams(location.search);
  if (params.has('admin')) showScreen('screen-admin');

  document.getElementById('btn-open-settings')?.addEventListener('click', () => showScreen('screen-settings'));
  document.getElementById('btn-back-home')?.addEventListener('click', () => showScreen('screen-home'));
  document.getElementById('btn-logout')?.addEventListener('click', () => showScreen('screen-home'));
  document.getElementById('btn-admin-close')?.addEventListener('click', () => showScreen('screen-home'));

  const sheetDevice = document.getElementById('sheet-device');
  document.getElementById('btn-add-device')?.addEventListener('click', () => sheetDevice?.classList.add('open'));
  document.getElementById('btn-close-sheet')?.addEventListener('click', () => sheetDevice?.classList.remove('open'));
  document.getElementById('btn-open-happ')?.addEventListener('click', () => sheetDevice?.classList.remove('open'));
  sheetDevice?.addEventListener('click', (e) => {
    if (e.target === sheetDevice) sheetDevice.classList.remove('open');
  });

  /* ---------- PIN pad (UI only) ---------- */
  const PIN_LEN = 4;
  let pinBuffer = '';
  let pinStep = 'create'; // create | confirm
  let pinFirst = '';

  const pinCells = () => document.querySelectorAll('#pin-cells .pin-cell');
  const pinTitle = document.getElementById('pin-title');
  const pinHint = document.getElementById('pin-hint');
  const pinStatus = document.getElementById('pin-status');

  function renderPinCells() {
    pinCells().forEach((cell, i) => {
      cell.classList.toggle('filled', i < pinBuffer.length);
      cell.classList.remove('error');
    });
  }

  function resetPin(step) {
    pinStep = step;
    pinBuffer = '';
    renderPinCells();
    if (step === 'create') {
      if (pinTitle) pinTitle.textContent = 'Придумайте код';
      if (pinHint) pinHint.textContent = '4 цифры для входа в приложение';
    } else {
      if (pinTitle) pinTitle.textContent = 'Повторите код';
      if (pinHint) pinHint.textContent = 'Введите код ещё раз';
    }
  }

  function shakePin() {
    pinCells().forEach((c) => c.classList.add('error'));
    haptic('error');
    setTimeout(() => {
      pinBuffer = '';
      renderPinCells();
    }, 350);
  }

  function onPinComplete(code) {
    if (pinStep === 'create') {
      pinFirst = code;
      resetPin('confirm');
      haptic('light');
      return;
    }
    if (code !== pinFirst) {
      shakePin();
      setTimeout(() => resetPin('create'), 400);
      return;
    }
    if (pinStatus) pinStatus.textContent = 'Вкл';
    haptic('success');
    showScreen('screen-settings');
    resetPin('create');
  }

  document.getElementById('btn-set-pin')?.addEventListener('click', () => {
    resetPin('create');
    showScreen('screen-pin');
  });

  document.getElementById('pin-pad')?.addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (!key) return;

    if (key === 'cancel') {
      haptic('light');
      showScreen('screen-settings');
      return;
    }
    if (key === 'del') {
      if (pinBuffer.length) {
        pinBuffer = pinBuffer.slice(0, -1);
        renderPinCells();
        haptic('light');
      }
      return;
    }
    if (pinBuffer.length >= PIN_LEN) return;
    pinBuffer += key;
    renderPinCells();
    haptic('light');
    if (pinBuffer.length === PIN_LEN) {
      onPinComplete(pinBuffer);
    }
  });

  document.getElementById('toggle-faceid')?.addEventListener('change', () => haptic('selection'));
})();
