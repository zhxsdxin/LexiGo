/**
 * 词库与子集选择
 * ---------------------------------------------------------------
 * 顶栏按钮打开。支持：
 *   - 切换词库（N3 全量 / 示例库）
 *   - 勾选子集，可多选；只勾一个即单选
 *   - 选择结果写入 localStorage，学习与复习按选中范围过滤
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var KEY = 'lexigo.selection.v1';

  var ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 0 0-2 2 2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 18.5z"/>' +
    '<path d="M12 6v16"/>' +
    '</svg>';

  var root = null;
  var panel = null;
  var button = null;
  var ctx = null;
  var draft = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- 持久化 ----
  function loadSelection() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object') return v;
      }
    } catch (e) { /* 忽略 */ }
    return { bankId: '', subsets: [] };
  }

  function saveSelection(v) {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch (e) { /* 忽略 */ }
  }

  function availableBanks() {
    return LG.Banks.all();
  }

  function currentBank() {
    var sel = loadSelection();
    var banks = availableBanks();
    var found = null;
    banks.forEach(function (b) { if (b.id === sel.bankId) found = b; });
    return found || banks[0] || null;
  }

  /**
   * 当前生效的单词 id 列表。
   * 返回 null 表示「不限制」，即整个词库。
   *
   * 注意：用户主动清空子集后，语义是「暂时不学任何词」而不是「全选」，
   * 所以只要该库已经保存过选择（含空数组），就返回实际结果（空数组）。
   * 只有从未选过的库才返回 null，即首次进入时的全选。
   */
  function activeIds(bankId) {
    var sel = loadSelection();
    if (sel.bankId !== bankId) return null;   // 该库还没选过 → 全选
    return LG.Banks.mergeSubsetIds(bankId, sel.subsets) || [];
  }

  // ---- 渲染 ----
  function build() {
    root = document.createElement('div');
    root.className = 'deckmenu';
    root.hidden = true;

    panel = document.createElement('div');
    panel.className = 'deckmenu__panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '选择词库与子集');
    root.appendChild(panel);

    // 事件委托绑在 root 上：render() 只替换 panel.innerHTML，
    // root 本身不重建，所以监听始终有效，且不需要重复绑定。
    root.addEventListener('click', onRootClick);
    document.body.appendChild(root);
  }

  function onRootClick(e) {
    if (e.target === root) { close(); return; }
    onPanelClick(e);
  }

  function render() {
    var banks = availableBanks();

    // 首次打开才从存储初始化草稿；之后 render 必须沿用内存里的草稿，
    // 否则刚改的 bankId / 子集会被已保存的旧值覆盖。
    if (!draft) draft = loadSelection();

    // 没选过库时默认第一个
    var has = banks.some(function (b) { return b.id === draft.bankId; });
    if (!has) draft.bankId = banks.length ? banks[0].id : '';

    var bank = null;
    banks.forEach(function (b) { if (b.id === draft.bankId) bank = b; });

    var html =
      '<div class="deckmenu__head">' +
      '<h2 class="deckmenu__heading">选择学习范围</h2>' +
      '<button type="button" class="deckmenu__close" data-act="close" aria-label="关闭">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
      '</button>' +
      '</div>';

    // 词库切换
    if (banks.length > 1) {
      html += '<p class="deckmenu__label">词库</p><div class="deckmenu__banks">';
      banks.forEach(function (b) {
        var on = b.id === draft.bankId;
        html +=
          '<button type="button" class="deckbank' + (on ? ' is-on' : '') + '" data-bank="' +
          esc(b.id) + '">' +
          '<span class="deckbank__name">' + esc(b.name) + '</span>' +
          '<span class="deckbank__count">' + b.total + ' 词</span>' +
          '</button>';
      });
      html += '</div>';
    }

    // 子集勾选
    html += '<p class="deckmenu__label">子集（可多选）</p><div class="deckmenu__subsets">';
    var defs = LG.Banks.subsets();
    // 按分组归拢
    var groups = [];
    defs.forEach(function (d) {
      var g = d.groups[0] || '其他';
      var found = null;
      groups.forEach(function (x) { if (x.name === g) found = x; });
      if (!found) { found = { name: g, items: [] }; groups.push(found); }
      found.items.push(d);
    });

    groups.forEach(function (g) {
      html += '<p class="deckmenu__group">' + esc(g.name) + '</p>';
      g.items.forEach(function (d) {
        var ids = LG.Banks.subsetIds(draft.bankId, d.id);
        var on = draft.subsets.indexOf(d.id) >= 0;
        var disabled = ids.length === 0;
        html +=
          '<button type="button" class="deckchip' + (on ? ' is-on' : '') +
          (disabled ? ' is-empty' : '') + '" data-subset="' + esc(d.id) + '"' +
          (disabled ? ' disabled' : '') +
          ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<span class="deckchip__box" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
          '</span>' +
          '<span class="deckchip__text">' +
          '<span class="deckchip__name">' + esc(d.name) + '</span>' +
          '<span class="deckchip__desc">' + esc(d.desc) + '</span>' +
          '</span>' +
          '<span class="deckchip__count">' + ids.length + '</span>' +
          '</button>';
      });
    });
    html += '</div>';

    // 底部操作
    var active = countActive(draft);
    html +=
      '<div class="deckmenu__foot">' +
      '<button type="button" class="deckmenu__all" data-act="all">全选</button>' +
      '<button type="button" class="deckmenu__all" data-act="none">清空</button>' +
      '<span class="deckmenu__summary">已选 <strong>' + active + '</strong> 词</span>' +
      '<button type="button" class="btn btn--primary deckmenu__apply" data-act="apply">开始学习</button>' +
      '</div>';

    panel.innerHTML = html;
  }

  function countActive(d) {
    var merged = LG.Banks.mergeSubsetIds(d.bankId, d.subsets);
    if (!merged) {
      var b = LG.Banks.get(d.bankId);
      return b ? b.total : 0;
    }
    return merged.length;
  }

  function refreshSummary() {
    var el = panel.querySelector('.deckmenu__summary strong');
    if (el) el.textContent = countActive(draft);
  }

  // ---- 交互 ----
  function onPanelClick(e) {
    var closeBtn = e.target.closest('[data-act="close"]');
    if (closeBtn) { close(); return; }

    var bankBtn = e.target.closest('[data-bank]');
    if (bankBtn) {
      draft.bankId = bankBtn.getAttribute('data-bank');
      draft.subsets = [];          // 换库后重置子集选择
      render();
      return;
    }

    var chip = e.target.closest('[data-subset]');
    if (chip && !chip.disabled) {
      var id = chip.getAttribute('data-subset');
      var i = draft.subsets.indexOf(id);
      if (i >= 0) draft.subsets.splice(i, 1);
      else draft.subsets.push(id);
      chip.classList.toggle('is-on');
      chip.setAttribute('aria-pressed', chip.classList.contains('is-on') ? 'true' : 'false');
      refreshSummary();
      return;
    }

    var act = e.target.closest('[data-act]');
    if (!act) return;
    var what = act.getAttribute('data-act');
    if (what === 'all') {
      draft.subsets = LG.Banks.subsets()
        .filter(function (d) {
          return LG.Banks.subsetIds(draft.bankId, d.id).length > 0;
        })
        .map(function (d) { return d.id; });
      render();
    } else if (what === 'none') {
      draft.subsets = [];
      render();
    } else if (what === 'apply') {
      saveSelection(draft);
      close();
      if (ctx && ctx.onApply) ctx.onApply();
    }
  }

  function open() {
    if (!root) build();
    draft = loadSelection();   // 每次打开都重新读，放弃上次的临时改动
    render();
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('is-open');
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open');
    if (button) button.setAttribute('aria-expanded', 'false');
    var el = root;
    setTimeout(function () { el.hidden = true; }, 150);
  }

  function toggle() {
    if (root && !root.hidden) close();
    else open();
  }

  /** 在顶栏插入入口按钮 */
  function mount(container, context) {
    ctx = context || null;
    if (!container) return;
    if (document.querySelector('.deckmenu-btn')) return;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'deckmenu-btn';
    button.setAttribute('aria-label', '选择词库与子集');
    button.setAttribute('aria-expanded', 'false');
    button.title = '选择词库与子集';
    button.innerHTML = ICON;
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    container.appendChild(button);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.DeckMenu = {
    mount: mount,
    open: open,
    close: close,
    toggle: toggle,
    currentBank: currentBank,
    activeIds: activeIds,
    loadSelection: loadSelection,
    saveSelection: saveSelection
  };
})(window);