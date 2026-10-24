/**
 * 词库与子集选择
 * ---------------------------------------------------------------
 * 顶栏按钮打开。支持：
 *   - 切换词库（N3 全量 / N2 全量 / 示例库）
 *   - 勾选子集，可多选；只勾一个即单选
 *   - 每个词库各自记住自己的勾选，切换词库不会清掉上一个库的选择，
 *     两个库都有勾选时合并成一个学习范围（跨库一起学）
 *   - 选择结果写入 localStorage，学习与复习按选中范围过滤
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var KEY = 'lexigo.selection.v2';
  // 老版本只有一个当前库的选择，读到就迁移到 v2 结构
  var KEY_LEGACY = 'lexigo.selection.v1';

  // 首次进入（localStorage 没有记录）时的默认范围：N3 词汇王炸 · 基础词。
  // 显式写出来，而不是依赖词库注册顺序，便于以后统一调整。
  var DEFAULT_BANK_ID = 'n3';
  var DEFAULT_SUBSETS = ['basic'];

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
  //
  // 选择状态的结构（v2）：
  //   {
  //     version: 2,
  //     currentBankId: 'n3',        // 面板里正在查看/编辑的那个库
  //     banks: { n3: ['basic'], n2: ['kanji'] }   // 每个库各自勾选的子集
  //   }
  // banks 里没有某个库的键 = 这个库还没选过，不参与学习；
  // 键存在但数组为空 = 用户主动清空了这个库，同样贡献 0 词。

  function readKey(k) {
    try {
      var raw = localStorage.getItem(k);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && typeof v === 'object') ? v : null;
    } catch (e) { return null; }
  }

  /** 把任意历史格式收敛成 v2 结构 */
  function normalizeSel(v) {
    var out = { version: 2, currentBankId: '', banks: {} };
    if (!v || typeof v !== 'object') return out;

    // v1：{ bankId, subsets } —— 只有一个库的选择
    if (v.subsets && !v.banks) {
      out.currentBankId = v.bankId || '';
      if (out.currentBankId) out.banks[out.currentBankId] = v.subsets.slice();
      return out;
    }

    out.currentBankId = v.currentBankId || v.bankId || '';
    var src = v.banks || {};
    Object.keys(src).forEach(function (k) {
      if (Object.prototype.toString.call(src[k]) === '[object Array]') {
        out.banks[k] = src[k].slice();
      }
    });
    return out;
  }

  function defaultSelection() {
    var d = { version: 2, currentBankId: DEFAULT_BANK_ID, banks: {} };
    d.banks[DEFAULT_BANK_ID] = DEFAULT_SUBSETS.slice();
    return d;
  }

  function loadSelection() {
    var v2 = readKey(KEY);
    if (v2) return normalizeSel(v2);
    var v1 = readKey(KEY_LEGACY);
    if (v1) return normalizeSel(v1);
    return defaultSelection();
  }

  function saveSelection(v) {
    var out = normalizeSel(v);
    if (!out.currentBankId) out.currentBankId = DEFAULT_BANK_ID;
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (e) { /* 忽略 */ }
    return out;
  }

  /** 某个库当前勾选的子集（只读，不存在时返回 null 而不是建空数组） */
  function subsOf(sel, bankId) {
    if (!sel || !sel.banks) return null;
    return sel.banks[bankId] || null;
  }

  function availableBanks() {
    return LG.Banks.all();
  }

  function currentBank() {
    var sel = loadSelection();
    var banks = availableBanks();
    var found = null;
    banks.forEach(function (b) { if (b.id === sel.currentBankId) found = b; });
    return found || banks[0] || null;
  }

  /**
   * 某个库当前生效的单词 id 列表。
   *
   * 返回 null = 这个库还没选过，不参与学习（不是「全选」）。
   * 返回数组 = 具体 id；空数组表示用户把这个库清空了，贡献 0 词。
   */
  function activeIds(bankId) {
    var sel = loadSelection();
    var subs = subsOf(sel, bankId);
    if (!subs) return null;
    return LG.Banks.mergeSubsetIds(bankId, subs) || [];
  }

  /** 已纳入学习范围的词库 id（有勾选、且确实选到词的） */
  function activeBankIds() {
    var sel = loadSelection();
    var out = [];
    LG.Banks.all().forEach(function (b) {
      var subs = subsOf(sel, b.id);
      if (!subs || !subs.length) return;
      out.push(b.id);
    });
    return out;
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
    var has = banks.some(function (b) { return b.id === draft.currentBankId; });
    if (!has) draft.currentBankId = banks.length ? banks[0].id : '';

    var bank = null;
    banks.forEach(function (b) { if (b.id === draft.currentBankId) bank = b; });
    // 当前库已勾选的子集；没选过时是空数组（界面上表现为一个都没勾）
    var curSubs = subsOf(draft, draft.currentBankId) || [];

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
        var on = b.id === draft.currentBankId;
        // 这个库被选了多少词 —— 切换走之后仍然显示，方便看出哪些库在生效
        var n = countBank(draft, b.id);
        html +=
          '<button type="button" class="deckbank' + (on ? ' is-on' : '') +
          (n > 0 && !on ? ' is-picked' : '') + '" data-bank="' + esc(b.id) + '">' +
          '<span class="deckbank__name">' + esc(b.name) + '</span>' +
          '<span class="deckbank__count' + (n > 0 ? ' is-on' : '') + '">' +
          (n > 0 ? '已选 ' + n + ' / ' + b.total : b.total + ' 词') +
          '</span>' +
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
        var ids = LG.Banks.subsetIds(draft.currentBankId, d.id);
        var on = curSubs.indexOf(d.id) >= 0;
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
    var nbanks = activeBankIdsIn(draft).length;
    // 全选了就没得再全选，一个没勾就没得再清空，这两种情况把按钮置灰
    var allSubs = nonEmptySubsets(draft.currentBankId);
    // 一个可选子集都没有的库（如示例库），全选同样没意义，一并置灰
    var noSubs = allSubs.length === 0;
    var pickedAll = noSubs || isAllPicked(draft, draft.currentBankId);
    var pickedNone = curSubs.length === 0;
    html +=
      '<div class="deckmenu__foot">' +
      '<button type="button" class="deckmenu__all" data-act="all"' +
      (pickedAll ? ' disabled' : '') +
      ' title="' + (noSubs ? '当前词库没有可选子集' : pickedAll ? '当前词库已全部勾选' : '勾选当前词库的全部子集') + '">全选</button>' +
      '<button type="button" class="deckmenu__all" data-act="none"' +
      (pickedNone ? ' disabled' : '') +
      ' title="' + (pickedNone ? '当前词库没有勾选' : '取消当前词库的勾选') + '">清空</button>' +
      '<span class="deckmenu__summary">已选 <strong>' + active + '</strong> 词' +
      // 跨库时换行单独一行，不用「·」接在同一行末尾
      (nbanks > 1 ? '<span class="deckmenu__summary-note">' + nbanks + ' 个词库</span>' : '') +
      '</span>' +
      '<button type="button" class="btn btn--primary deckmenu__apply" data-act="apply">开始学习</button>' +
      '</div>';

    panel.innerHTML = html;
  }

  /** 某个词库里真正有词的子集 id（空子集不参与「全选」判定） */
  function nonEmptySubsets(bankId) {
    return LG.Banks.subsets()
      .filter(function (d) { return LG.Banks.subsetIds(bankId, d.id).length > 0; })
      .map(function (d) { return d.id; });
  }

  /** 某个词库是不是已经把非空子集全勾上了 */
  function isAllPicked(d, bankId) {
    var all = nonEmptySubsets(bankId);
    if (!all.length) return false;
    var cur = subsOf(d, bankId) || [];
    for (var i = 0; i < all.length; i++) {
      if (cur.indexOf(all[i]) < 0) return false;
    }
    return true;
  }

  /** 单个词库被选中的词数（跨子集去重） */
  function countBank(d, bankId) {
    var subs = subsOf(d, bankId);
    if (!subs || !subs.length) return 0;
    var ids = LG.Banks.mergeSubsetIds(bankId, subs);
    return ids ? ids.length : 0;
  }

  /** 草稿里已经纳入学习范围的词库 id */
  function activeBankIdsIn(d) {
    var out = [];
    LG.Banks.all().forEach(function (b) {
      if (countBank(d, b.id) > 0) out.push(b.id);
    });
    return out;
  }

  /** 全部词库合计的选中词数（id 全局唯一，去重后相加） */
  function countActive(d) {
    var seen = {};
    var n = 0;
    LG.Banks.all().forEach(function (b) {
      var subs = subsOf(d, b.id);
      if (!subs || !subs.length) return;
      var ids = LG.Banks.mergeSubsetIds(b.id, subs) || [];
      ids.forEach(function (id) {
        if (!seen[id]) { seen[id] = 1; n++; }
      });
    });
    return n;
  }

  function refreshSummary() {
    var box = panel.querySelector('.deckmenu__summary');
    if (!box) return;
    var strong = box.querySelector('strong');
    if (strong) strong.textContent = countActive(draft);
    var nbanks = activeBankIdsIn(draft).length;
    var note = box.querySelector('.deckmenu__summary-note');
    if (nbanks > 1) {
      if (!note) {
        note = document.createElement('span');
        note.className = 'deckmenu__summary-note';
        box.appendChild(note);
      }
      note.textContent = nbanks + ' 个词库';
    } else if (note) {
      note.remove();
    }
  }

  // ---- 交互 ----
  function onPanelClick(e) {
    var closeBtn = e.target.closest('[data-act="close"]');
    if (closeBtn) { close(); return; }

    var bankBtn = e.target.closest('[data-bank]');
    if (bankBtn) {
      // 只切换「正在编辑哪个库」，各库自己的勾选原样保留
      draft.currentBankId = bankBtn.getAttribute('data-bank');
      render();
      return;
    }

    var chip = e.target.closest('[data-subset]');
    if (chip && !chip.disabled) {
      var id = chip.getAttribute('data-subset');
      var subs = subsOf(draft, draft.currentBankId);
      if (!subs) { subs = []; draft.banks[draft.currentBankId] = subs; }
      var i = subs.indexOf(id);
      if (i >= 0) subs.splice(i, 1);
      else subs.push(id);
      chip.classList.toggle('is-on');
      chip.setAttribute('aria-pressed', chip.classList.contains('is-on') ? 'true' : 'false');
      // 词库按钮上的「已选 N」、底部全选/清空的置灰状态都要跟着变
      updateBankCounts();
      updateFootButtons();
      refreshSummary();
      return;
    }

    var act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    var what = act.getAttribute('data-act');
    if (what === 'all') {
      draft.banks[draft.currentBankId] = LG.Banks.subsets()
        .filter(function (d) {
          return LG.Banks.subsetIds(draft.currentBankId, d.id).length > 0;
        })
        .map(function (d) { return d.id; });
      render();
    } else if (what === 'none') {
      draft.banks[draft.currentBankId] = [];
      render();
    } else if (what === 'apply') {
      saveSelection(draft);
      close();
      if (ctx && ctx.onApply) ctx.onApply();
    }
  }

  /** 同步底部「全选 / 清空」的可用状态：全选了禁用全选，一个没勾禁用清空 */
  function updateFootButtons() {
    var allBtn = panel.querySelector('[data-act="all"]');
    var noneBtn = panel.querySelector('[data-act="none"]');
    var noSubs = nonEmptySubsets(draft.currentBankId).length === 0;
    var pickedAll = noSubs || isAllPicked(draft, draft.currentBankId);
    var pickedNone = (subsOf(draft, draft.currentBankId) || []).length === 0;
    if (allBtn) {
      allBtn.disabled = pickedAll;
      allBtn.title = noSubs ? '当前词库没有可选子集'
        : pickedAll ? '当前词库已全部勾选' : '勾选当前词库的全部子集';
    }
    if (noneBtn) {
      noneBtn.disabled = pickedNone;
      noneBtn.title = pickedNone ? '当前词库没有勾选' : '取消当前词库的勾选';
    }
  }

  /** 只改词库按钮右侧的计数，不整块重绘 */
  function updateBankCounts() {
    var btns = panel.querySelectorAll('[data-bank]');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var bid = btn.getAttribute('data-bank');
      var bank = LG.Banks.get(bid);
      if (!bank) continue;
      var n = countBank(draft, bid);
      var el = btn.querySelector('.deckbank__count');
      if (el) {
        el.textContent = n > 0 ? ('已选 ' + n + ' / ' + bank.total) : (bank.total + ' 词');
        el.classList.toggle('is-on', n > 0);
      }
      btn.classList.toggle('is-picked', n > 0 && bid !== draft.currentBankId);
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
    activeBankIds: activeBankIds,
    loadSelection: loadSelection,
    saveSelection: saveSelection,
    normalizeSelection: normalizeSel
  };
})(window);