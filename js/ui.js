/* Destr App — UI only (no backend logic yet) */

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

  /* ---------- Theme ---------- */

  const THEME_KEY = 'destr_theme';

  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    // system
    if (tg?.colorScheme) return tg.colorScheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(pref) {
    const resolved = resolveTheme(pref);
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem(THEME_KEY, pref);

    document.querySelectorAll('.theme-check').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.check !== pref);
    });
  }

  applyTheme(localStorage.getItem(THEME_KEY) || 'system');

  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeSet);
    });
  });

  if (tg) {
    tg.onEvent('themeChanged', () => {
      const pref = localStorage.getItem(THEME_KEY) || 'system';
      if (pref === 'system') applyTheme('system');
    });
  }

  /* ---------- Haptic ---------- */

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

  /* ---------- Navigation ---------- */

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === id);
    });
    window.scrollTo(0, 0);
  }

  // Demo: admin link
  const params = new URLSearchParams(location.search);
  if (params.has('admin')) {
    showScreen('screen-admin');
  }

  // Login steps (UI only)
  const stepPhone = document.getElementById('login-step-phone');
  const stepCode = document.getElementById('login-step-code');

  document.getElementById('btn-send-code')?.addEventListener('click', () => {
    stepPhone?.classList.add('hidden');
    stepCode?.classList.remove('hidden');
  });

  document.getElementById('btn-back-phone')?.addEventListener('click', () => {
    stepCode?.classList.add('hidden');
    stepPhone?.classList.remove('hidden');
  });

  document.getElementById('btn-verify-code')?.addEventListener('click', () => {
    haptic('success');
    showScreen('screen-home');
  });

  document.getElementById('btn-tg-login')?.addEventListener('click', () => {
    // Later: redirect to bot / use initData
    haptic('success');
    showScreen('screen-home');
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    showScreen('screen-settings');
  });

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    showScreen('screen-home');
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    showScreen('screen-login');
  });

  // Admin
  document.getElementById('btn-admin-create')?.addEventListener('click', () => {
    showScreen('screen-admin-create');
  });

  document.getElementById('btn-admin-close')?.addEventListener('click', () => {
    showScreen('screen-login');
  });

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
  });

  document.getElementById('btn-admin-submit-create')?.addEventListener('click', () => {
    haptic('success');
    showScreen('screen-admin');
  });

  // Sheets
  const sheetDevice = document.getElementById('sheet-device');
  const sheetPin = document.getElementById('sheet-pin');

  document.getElementById('btn-add-device')?.addEventListener('click', () => {
    sheetDevice?.classList.add('open');
  });

  document.getElementById('btn-close-sheet')?.addEventListener('click', () => {
    sheetDevice?.classList.remove('open');
  });

  document.getElementById('btn-open-happ')?.addEventListener('click', () => {
    sheetDevice?.classList.remove('open');
  });

  document.getElementById('btn-set-pin')?.addEventListener('click', () => {
    sheetPin?.classList.add('open');
  });

  document.getElementById('btn-close-pin')?.addEventListener('click', () => {
    sheetPin?.classList.remove('open');
  });

  document.getElementById('btn-save-pin')?.addEventListener('click', () => {
    const status = document.getElementById('pin-status');
    if (status) status.textContent = 'Вкл';
    sheetPin?.classList.remove('open');
    haptic('success');
  });

  // Close sheets on overlay click
  [sheetDevice, sheetPin].forEach((overlay) => {
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Face ID toggle haptic
  document.getElementById('toggle-faceid')?.addEventListener('change', () => {
    haptic('selection');
  });
})();
