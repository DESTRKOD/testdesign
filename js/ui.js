(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      if (tg.themeParams) {
        const root = document.documentElement;
        const map = {
          bg_color: '--tg-theme-bg-color',
          secondary_bg_color: '--tg-theme-secondary-bg-color',
          text_color: '--tg-theme-text-color',
          hint_color: '--tg-theme-hint-color',
          button_color: '--tg-theme-button-color',
          button_text_color: '--tg-theme-button-text-color',
          link_color: '--tg-theme-link-color',
          destructive_text_color: '--tg-theme-destructive-text-color'
        };
        for (const [k, v] of Object.entries(map)) {
          if (tg.themeParams[k]) root.style.setProperty(v, tg.themeParams[k]);
        }
      }
    } catch (_) {}
  }

  function haptic(type, style) {
    try {
      const hf = tg?.HapticFeedback;
      if (!hf) return;
      if (type === 'impact') hf.impactOccurred(style || 'light');
      else if (type === 'notification') hf.notificationOccurred(style || 'success');
      else if (type === 'selection') hf.selectionChanged();
    } catch (_) {}
  }

  const $ = (id) => document.getElementById(id);

  /* ---------- Theme (cabinet) ---------- */
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
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeSet);
      haptic('selection');
    });
  });

  /* ---------- Screen helpers ---------- */
  function hideAllAppScreens() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  }
  function hideAllLoginScreens() {
    document.querySelectorAll('.login-screen').forEach((s) => {
      s.classList.remove('active', 'leaving-left', 'leaving-right');
    });
  }
  function showApp(id) {
    hideAllLoginScreens();
    hideAllAppScreens();
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }
  function switchLogin(fromId, toId, direction) {
    const fromEl = $(fromId);
    const toEl = $(toId);
    if (!fromEl || !toEl) return;
    fromEl.classList.remove('active');
    fromEl.classList.add(direction === 'back' ? 'leaving-right' : 'leaving-left');
    toEl.classList.remove('leaving-left', 'leaving-right');
    void toEl.offsetWidth;
    toEl.classList.add('active');
    setTimeout(() => fromEl.classList.remove('leaving-left', 'leaving-right'), 350);
  }

  /* ---------- Countries (minimal without numbers.json) ---------- */
  const COUNTRIES = [
    { страна: 'Россия', индекс: '+7', длина: 10, маска: '999 999-99-99', флаг: 'RU' },
    { страна: 'Казахстан', индекс: '+7', длина: 10, маска: '999 999-99-99', флаг: 'KZ' },
    { страна: 'Беларусь', индекс: '+375', длина: 9, маска: '99 999-99-99', флаг: 'BY' },
    { страна: 'Украина', индекс: '+380', длина: 9, маска: '99 999-99-99', флаг: 'UA' },
    { страна: 'США', индекс: '+1', длина: 10, маска: '(999) 999-9999', флаг: 'US' }
  ];
  let currentCountry = COUNTRIES[0];
  let phoneDigits = '';
  let requiredLength = 10;
  let currentMask = currentCountry.маска;

  function setCountry(c) {
    currentCountry = c;
    $('current-flag').textContent = c.флаг;
    $('current-name').textContent = c.страна;
    $('phone-code').textContent = c.индекс;
    requiredLength = c.длина;
    currentMask = c.маска || '';
    $('phone-input').placeholder = currentMask.replace(/9/g, '0');
    phoneDigits = '';
    $('phone-input').value = '';
    updateContinue();
  }
  setCountry(currentCountry);

  function formatPhone(digits, mask) {
    if (!digits) return '';
    let result = '';
    let di = 0;
    for (let i = 0; i < mask.length && di < digits.length; i++) {
      if (mask[i] === '9') result += digits[di++];
      else result += mask[i];
    }
    return result;
  }
  function updateContinue() {
    $('btn-continue').disabled = phoneDigits.length < requiredLength;
  }

  const phoneInput = $('phone-input');
  phoneInput?.addEventListener('input', (e) => {
    let raw = e.target.value.replace(/\D/g, '').slice(0, requiredLength);
    phoneDigits = raw;
    e.target.value = formatPhone(raw, currentMask);
    updateContinue();
    $('phone-error')?.classList.remove('visible');
  });

  /* Country modal */
  function renderCountries(filter) {
    const q = (filter || '').toLowerCase().trim();
    const list = COUNTRIES.filter(
      (c) => c.страна.toLowerCase().includes(q) || c.индекс.includes(q)
    );
    const box = $('country-list');
    if (!box) return;
    box.innerHTML = list
      .map(
        (c) =>
          `<div class="country-item" data-name="${c.страна}"><div class="flag">${c.флаг}</div><div class="name">${c.страна}</div><div class="code">${c.индекс}</div></div>`
      )
      .join('');
    box.querySelectorAll('.country-item').forEach((el) => {
      el.addEventListener('click', () => {
        const c = COUNTRIES.find((x) => x.страна === el.dataset.name);
        if (c) {
          haptic('selection');
          setCountry(c);
          $('modal')?.classList.remove('open');
        }
      });
    });
  }
  $('country-selector')?.addEventListener('click', () => {
    haptic('selection');
    renderCountries();
    $('modal')?.classList.add('open');
  });
  $('modal-close')?.addEventListener('click', () => $('modal')?.classList.remove('open'));
  $('modal')?.addEventListener('click', (e) => {
    if (e.target === $('modal')) $('modal').classList.remove('open');
  });
  $('search')?.addEventListener('input', (e) => renderCountries(e.target.value));

  /* Phone continue */
  $('btn-continue')?.addEventListener('click', async () => {
    const btn = $('btn-continue');
    if (btn.disabled || btn.classList.contains('loading')) return;
    haptic('impact', 'medium');
    btn.classList.add('loading');
    try {
      await new Promise((r) => setTimeout(r, 800));
      $('sent-phone').textContent = currentCountry.индекс + phoneDigits;
      switchLogin('screen-phone', 'screen-code', 'forward');
      startTimer();
      setTimeout(() => document.querySelectorAll('.code-digit')[0]?.focus(), 320);
    } finally {
      btn.classList.remove('loading');
    }
  });

  /* TG login (UI only → home) */
  $('btn-tg-login')?.addEventListener('click', () => {
    haptic('impact', 'medium');
    showApp('screen-home');
  });

  /* Code */
  const codeDigits = document.querySelectorAll('.code-digit');
  function checkCode() {
    const code = Array.from(codeDigits).map((i) => i.value).join('');
    $('btn-verify').disabled = code.length < 6;
  }
  codeDigits.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
      if (e.target.value && idx < codeDigits.length - 1) codeDigits[idx + 1].focus();
      checkCode();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) codeDigits[idx - 1].focus();
    });
  });

  let timerInterval = null;
  function startTimer() {
    let sec = 60;
    $('resend-block').innerHTML = `Отправить код повторно через <span id="timer">${sec}</span> сек`;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      sec--;
      const t = $('timer');
      if (t) t.textContent = sec;
      if (sec <= 0) {
        clearInterval(timerInterval);
        $('resend-block').innerHTML = `<a href="#" id="resend-link">Отправить код повторно</a>`;
        $('resend-link')?.addEventListener('click', (e) => {
          e.preventDefault();
          haptic('impact', 'light');
          startTimer();
        });
      }
    }, 1000);
  }

  $('btn-verify')?.addEventListener('click', async () => {
    const btn = $('btn-verify');
    if (btn.disabled || btn.classList.contains('loading')) return;
    haptic('impact', 'medium');
    btn.classList.add('loading');
    try {
      await new Promise((r) => setTimeout(r, 800));
      haptic('notification', 'success');
      switchLogin('screen-code', 'screen-2fa', 'forward');
    } finally {
      btn.classList.remove('loading');
    }
  });

  $('btn-back-phone')?.addEventListener('click', () => {
    haptic('impact', 'light');
    codeDigits.forEach((d) => (d.value = ''));
    checkCode();
    clearInterval(timerInterval);
    switchLogin('screen-code', 'screen-phone', 'back');
  });

  /* 2FA */
  const p1 = $('password-1');
  const p2 = $('password-2');
  function update2fa() {
    const ok = p1.value.length >= 6 && p1.value === p2.value;
    $('btn-2fa-continue').disabled = !ok;
  }
  p1?.addEventListener('input', update2fa);
  p2?.addEventListener('input', update2fa);

  $('btn-2fa-continue')?.addEventListener('click', async () => {
    const btn = $('btn-2fa-continue');
    if (btn.disabled) return;
    haptic('impact', 'medium');
    btn.classList.add('loading');
    try {
      await new Promise((r) => setTimeout(r, 600));
      haptic('notification', 'success');
      showApp('screen-home');
    } finally {
      btn.classList.remove('loading');
    }
  });
  $('btn-2fa-skip')?.addEventListener('click', () => {
    haptic('impact', 'medium');
    showApp('screen-home');
  });

  /* Cabinet nav */
  $('btn-open-settings')?.addEventListener('click', () => showApp('screen-settings'));
  $('btn-back-home')?.addEventListener('click', () => showApp('screen-home'));
  $('btn-logout')?.addEventListener('click', () => {
    hideAllAppScreens();
    hideAllLoginScreens();
    $('screen-phone')?.classList.add('active');
  });

  const sheetDevice = $('sheet-device');
  $('btn-add-device')?.addEventListener('click', () => {
    haptic('impact', 'medium');
    sheetDevice?.classList.add('open');
  });
  $('btn-close-sheet')?.addEventListener('click', () => sheetDevice?.classList.remove('open'));
  $('btn-open-happ')?.addEventListener('click', () => sheetDevice?.classList.remove('open'));
  sheetDevice?.addEventListener('click', (e) => {
    if (e.target === sheetDevice) sheetDevice.classList.remove('open');
  });

  /* PIN pad */
  const PIN_LEN = 4;
  let pinBuffer = '';
  let pinStep = 'create';
  let pinFirst = '';
  const pinCells = () => document.querySelectorAll('#pin-cells .pin-cell');

  function renderPin() {
    pinCells().forEach((c, i) => {
      c.classList.toggle('filled', i < pinBuffer.length);
      c.classList.remove('error');
    });
  }
  function resetPin(step) {
    pinStep = step;
    pinBuffer = '';
    renderPin();
    if (step === 'create') {
      if ($('pin-title')) $('pin-title').textContent = 'Придумайте код';
      if ($('pin-hint')) $('pin-hint').textContent = '4 цифры для входа в приложение';
    } else {
      if ($('pin-title')) $('pin-title').textContent = 'Повторите код';
      if ($('pin-hint')) $('pin-hint').textContent = 'Введите код ещё раз';
    }
  }

  $('btn-set-pin')?.addEventListener('click', () => {
    resetPin('create');
    showApp('screen-pin');
  });

  $('pin-pad')?.addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (!key) return;
    if (key === 'cancel') {
      haptic('impact', 'light');
      showApp('screen-settings');
      return;
    }
    if (key === 'del') {
      if (pinBuffer.length) {
        pinBuffer = pinBuffer.slice(0, -1);
        renderPin();
        haptic('impact', 'light');
      }
      return;
    }
    if (pinBuffer.length >= PIN_LEN) return;
    pinBuffer += key;
    renderPin();
    haptic('impact', 'light');
    if (pinBuffer.length === PIN_LEN) {
      if (pinStep === 'create') {
        pinFirst = pinBuffer;
        resetPin('confirm');
      } else if (pinBuffer !== pinFirst) {
        pinCells().forEach((c) => c.classList.add('error'));
        haptic('notification', 'error');
        setTimeout(() => resetPin('create'), 400);
      } else {
        if ($('pin-status')) $('pin-status').textContent = 'Вкл';
        haptic('notification', 'success');
        showApp('screen-settings');
        resetPin('create');
      }
    }
  });

  $('toggle-faceid')?.addEventListener('change', () => haptic('selection'));
})();
