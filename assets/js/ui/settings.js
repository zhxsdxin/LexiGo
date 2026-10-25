/**
 * 显示设置
 * ---------------------------------------------------------------
 * 一个小型设置面板，入口是顶栏的齿轮按钮（紧挨操作说明按钮）。
 *
 * 可配置项：
 *   kanaMode       假名模式：正面显示假名+读音，背面显示汉字（+释义，条件见 card.js）
 *   showBackground 是否给卡片铺 hachiware / chiikawa 随机背景图
 *   bgOpacity      背景透明度（showBackground 开启时生效）
 *
 * 三个值都存进 localStorage，刷新后保留。其它模块通过
 * Settings.get / Settings.set / Settings.subscribe 读写并响应变化。
 */
(function (global) {
  'use strict';

  var KEY = 'lexigo.settings.v1';
  var DEFAULTS = {
    kanaMode: false,
    showBackground: true,
    bgOpacity: 0.05
  };

  var settings = load();
  var listeners = [];

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object') {
          return Object.assign({}, DEFAULTS, v);
        }
      }
    } catch (e) {
      /* 忽略，落到默认值 */
    }
    return Object.assign({}, DEFAULTS);
  }

  function persist() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (e) {
      /* 隐私模式等场景：内存态即可，不强求 */
    }
  }

  function get(key) {
    return settings[key];
  }

  function all() {
    return Object.assign({}, settings);
  }

  function set(key, val) {
    if (settings[key] === val) return;
    settings[key] = val;
    persist();
    var snap = all();
    listeners.slice().forEach(function (fn) {
      try {
        fn(key, val, snap);
      } catch (e) {
        /* 单个监听出错不影响其它 */
      }
    });
  }

  /** 订阅变化，返回取消订阅的函数 */
  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  /* ---------- 面板 UI ---------- */
  var ICON_GEAR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
    '</svg>';

  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  var root = null;
  var button = null;
  var onClose = null;

  function row(key, label, desc) {
    return (
      '<label class="settings__row">' +
      '<div class="settings__text">' +
      '<span class="settings__label">' + label + '</span>' +
      '<span class="settings__desc">' + desc + '</span>' +
      '</div>' +
      '<span class="switch">' +
      '<input type="checkbox" data-key="' + key + '"' + (get(key) ? ' checked' : '') + '>' +
      '<span class="switch__track"><span class="switch__thumb"></span></span>' +
      '</span>' +
      '</label>'
    );
  }

  function build() {
    root = document.createElement('div');
    root.className = 'helpmenu settings';
    root.hidden = true;

    root.innerHTML =
      '<div class="helpmenu__panel" role="dialog" aria-label="显示设置">' +
      '<div class="helpmenu__head">' +
      '<h2 class="helpmenu__heading">显示设置</h2>' +
      '<button type="button" class="helpmenu__close" aria-label="关闭">' + ICON_CLOSE + '</button>' +
      '</div>' +
      '<div class="settings__body">' +
      row('kanaMode', '假名模式', '正面显示假名与读音，背面显示汉字') +
      row('showBackground', '显示卡片背景', '用 hachiware / chiikawa 图池里的图做卡片底纹') +
      '<div class="settings__row settings__row--range" data-row="bgOpacity">' +
      '<div class="settings__text">' +
      '<span class="settings__label">背景透明度</span>' +
      '<span class="settings__desc">仅「显示卡片背景」开启时生效</span>' +
      '</div>' +
      '<div class="settings__range">' +
      '<input type="range" min="0" max="100" step="1" data-key="bgOpacity" aria-label="背景透明度">' +
      '<span class="range__val" data-val="bgOpacity">5%</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<p class="helpmenu__foot">设置自动保存在此浏览器本地</p>' +
      '</div>';

    document.body.appendChild(root);

    root.querySelector('.helpmenu__close').addEventListener('click', close);
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });

    each(root.querySelectorAll('.switch input'), function (inp) {
      inp.addEventListener('change', function () {
        set(inp.getAttribute('data-key'), inp.checked);
        syncDisabled();
      });
    });

    var range = root.querySelector('input[data-key="bgOpacity"]');
    range.addEventListener('input', function () {
      var pct = parseInt(range.value, 10) || 0;
      root.querySelector('[data-val="bgOpacity"]').textContent = pct + '%';
      set('bgOpacity', pct / 100);
    });

    syncFromState();
  }

  function syncFromState() {
    each(root.querySelectorAll('.switch input'), function (inp) {
      inp.checked = !!get(inp.getAttribute('data-key'));
    });
    var range = root.querySelector('input[data-key="bgOpacity"]');
    var pct = Math.round((get('bgOpacity') || 0) * 100);
    range.value = pct;
    root.querySelector('[data-val="bgOpacity"]').textContent = pct + '%';
    syncDisabled();
  }

  function syncDisabled() {
    var off = !get('showBackground');
    var rowEl = root.querySelector('[data-row="bgOpacity"]');
    rowEl.classList.toggle('is-disabled', off);
    root.querySelector('input[data-key="bgOpacity"]').disabled = off;
  }

  function open(cb) {
    if (!root) build();
    onClose = cb || null;
    root.hidden = false;
    void root.offsetWidth; // 触发过渡
    root.classList.add('is-open');
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open');
    if (button) button.setAttribute('aria-expanded', 'false');
    var el = root;
    global.setTimeout(function () {
      el.hidden = true;
    }, 150);
    if (onClose) {
      var cb = onClose;
      onClose = null;
      cb();
    }
  }

  function toggle() {
    if (root && !root.hidden) close();
    else open();
  }

  /** 在顶栏右侧（操作说明按钮旁边）插入齿轮入口 */
  function mount(container) {
    if (!container) return;
    if (document.querySelector('.topbar__tools .settings-btn')) return;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'helpmenu-btn settings-btn';
    button.setAttribute('aria-label', '显示设置');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('title', '显示设置');
    button.innerHTML = ICON_GEAR;
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    container.appendChild(button);
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Settings = {
    get: get,
    all: all,
    set: set,
    subscribe: subscribe,
    mount: mount,
    open: open,
    close: close,
    toggle: toggle
  };
})(window);
