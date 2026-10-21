/**
 * 视图 · 单词学习（默认首页）
 * ---------------------------------------------------------------
 * 卡片正面只显示日语单词与音调，点击左右翻转到背面看读音与释义。
 *
 * 「认识 / 不认识」常驻在卡片下方，不需要先揭示：
 *   认识   → 直接跳到下一个词
 *   不认识 → 翻转卡片显示答案，同时该词进入错词复习队列
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var WordCard = LG.WordCard;

  var els = {};
  var flipped = false;
  var state = null;
  var onStateChange = null;

  /** 当前词序：sequential（词库顺序）或 random（随机） */
  function currentOrder() {
    var bank = LG.WORD_BANK;
    var ids = bank.orderedIds();
    if (state.study.order === 'random') {
      ids = seededShuffle(ids, state.study.orderSeed);
    }
    return ids;
  }

  function seededShuffle(ids, seed) {
    var arr = ids.slice();
    var s = seed || 1;
    for (var i = arr.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var j = s % (i + 1);
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function currentIndex() {
    var ids = currentOrder();
    if (!ids.length) return 0;
    return ((state.study.cursor % ids.length) + ids.length) % ids.length;
  }

  function currentWord() {
    var ids = currentOrder();
    if (!ids.length) return null;
    return LG.WORD_BANK.get(ids[currentIndex()]);
  }

  function init(root, ctx) {
    state = ctx.state;
    onStateChange = ctx.onStateChange;
    els = {
      root: root,
      card: root.querySelector('[data-el="card"]'),
      actions: root.querySelector('[data-el="actions"]'),
      counter: root.querySelector('[data-el="counter"]'),
      prev: root.querySelector('[data-el="prev"]'),
      next: root.querySelector('[data-el="next"]'),
      shuffle: root.querySelector('[data-el="shuffle"]'),
      picker: root.querySelector('[data-el="picker"]'),
      pickerList: root.querySelector('[data-el="picker-list"]')
    };

    els.actions.innerHTML =
      '<button type="button" class="btn btn--ghost" data-act="unknown">不认识</button>' +
      '<button type="button" class="btn btn--primary" data-act="known">认识</button>';

    els.actions.querySelector('[data-act="known"]').addEventListener('click', function () {
      submit(true);
    });
    els.actions.querySelector('[data-act="unknown"]').addEventListener('click', function () {
      submit(false);
    });

    els.prev.addEventListener('click', function () {
      go(-1);
    });
    els.next.addEventListener('click', function () {
      go(1);
    });
    els.shuffle.addEventListener('click', toggleOrder);

    // 词表选择框：点击展开本组全部单词，点条目直接跳转
    els.picker.addEventListener('click', function (e) {
      var item = e.target.closest('[data-jump]');
      if (!item) return;
      LG.Picker.close();
      jumpTo(item.getAttribute('data-jump'));
    });

    render();
  }

  function go(delta) {
    var ids = currentOrder();
    var total = ids.length;
    state.study.cursor = (((state.study.cursor + delta) % total) + total) % total;
    flipped = false;
    if (onStateChange) onStateChange();
  }

  /** 从词表选择框跳到指定单词 */
  function jumpTo(id) {
    var ids = currentOrder();
    var idx = ids.indexOf(id);
    if (idx < 0) return;
    state.study.cursor = idx;
    flipped = false;
    if (onStateChange) onStateChange();
  }

  function toggleOrder() {
    if (state.study.order === 'random') {
      state.study.order = 'sequential';
    } else {
      state.study.order = 'random';
      state.study.orderSeed = Math.floor(Math.random() * 100000) + 1;
    }
    state.study.cursor = 0;
    flipped = false;
    if (onStateChange) onStateChange();
  }

  function flip() {
    flipped = !flipped;
    render();
  }

  function submit(known) {
    var word = currentWord();
    if (!word) return;

    // 记录作答：更新熟练度、每日统计
    LG.Srs.answer(state, word.id, known);
    var day = LG.Store.ensureDay(state);
    if (day.ids.indexOf(word.id) === -1) day.ids.push(word.id);
    if (known) day.known += 1;
    else day.unknown += 1;
    LG.Store.pruneDays(state);

    if (known) {
      // 认识：直接进入下一个词
      go(1);
    } else {
      // 不认识：进入错词队列，并把卡片翻过来展示答案
      state.review.queue = LG.Srs.reinsert(state.review.queue, state.review.cursor, word.id);
      flipped = true;
      if (onStateChange) onStateChange();
    }
  }

  /** 键盘：空格翻转，方向键切换，R 发音 */
  function onKey(e) {
    if (!rootVisible()) return false;
    var key = e.key;
    if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
      e.preventDefault();
      flip();
      return true;
    }
    if (key === 'ArrowRight') {
      go(1);
      return true;
    }
    if (key === 'ArrowLeft') {
      go(-1);
      return true;
    }
    if (key === 'r' || key === 'R') {
      var w = currentWord();
      if (w) LG.Speech.speak(w.word + '、' + w.kana);
      return true;
    }
    return false;
  }

  function rootVisible() {
    return els.root.classList.contains('is-active');
  }

  /** 渲染词表选择框内容 */
  function renderPicker(ids, activeId) {
    if (!els.pickerList) return;
    var bank = LG.WORD_BANK;
    var recs = state.words;
    var html = '';
    ids.forEach(function (id) {
      var w = bank.get(id);
      if (!w) return;
      var rec = recs[id];
      var mark = '';
      if (rec && rec.seen > 0) {
        mark = rec.box === 0
          ? '<span class="picker__tag picker__tag--weak">弱</span>'
          : '<span class="picker__tag">已记</span>';
      }
      html +=
        '<li class="picker__item' + (id === activeId ? ' is-active' : '') + '" data-jump="' +
        WordCard.escapeHtml(id) + '">' +
        '<span class="picker__word" lang="ja">' + WordCard.escapeHtml(w.word) + '</span>' +
        '<span class="picker__meaning">' + WordCard.escapeHtml(w.meaning) + '</span>' +
        mark +
        '</li>';
    });
    els.pickerList.innerHTML = html;
  }

  function render() {
    var word = currentWord();
    if (!word) {
      els.card.hidden = true;
      els.actions.hidden = true;
      return;
    }

    els.card.hidden = false;
    WordCard.render(els.card, word, {
      flipped: flipped,
      onFlip: flip,
      onSpeak: function () {}
    });

    // 认识 / 不认识 常驻显示
    els.actions.hidden = false;

    var ids = currentOrder();
    var idx = currentIndex();
    els.counter.innerHTML = '<strong>' + (idx + 1) + '</strong> / ' + ids.length;

    renderPicker(ids, word.id);

    els.shuffle.classList.toggle('is-on', state.study.order === 'random');
    els.shuffle.setAttribute('aria-pressed', state.study.order === 'random' ? 'true' : 'false');
    els.shuffle.title = state.study.order === 'random' ? '当前：随机顺序' : '当前：词库顺序';
  }

  global.LexiGo.StudyView = {
    init: init,
    render: render,
    onKey: onKey,
    setState: function (next) {
      state = next;
      flipped = false;
    },
    /** 供手势调用：正数下一词，负数上一词 */
    step: function (delta) {
      go(delta);
    },
    /** 供手势调用：翻转卡片 */
    flip: flip,
    isFlipped: function () {
      return flipped;
    },
    reset: function () {
      flipped = false;
    }
  };
})(window);