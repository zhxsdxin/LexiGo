/**
 * 视图 · 速成复习
 * ---------------------------------------------------------------
 * 自动收集学习中标记为「不认识」的单词，优先攻克错词。
 * 沿用「单词 → 回忆 → 揭示 → 反馈」流程；
 * 连续答对的词逐级升级、复习间隔拉长，答错的词在本轮内重新出现。
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var WordCard = LG.WordCard;

  var els = {};
  var flipped = false;
  var state = null;
  var onStateChange = null;

  function ensureRound(force) {
    // 只有「从未开始过」或「用户主动重开」时才重建队列。
    // 否则一轮答完后队列为空会被再次填充，完成状态永远显示不出来。
    var needBuild = force || !state.review.roundStartedAt;

    if (needBuild) {
      var queue = LG.Srs.buildQueue(state, !!force);
      state.review.queue = queue;
      state.review.cursor = 0;
      state.review.roundStartedAt = Date.now();
      state.review.answeredInRound = 0;
    }
    state.review.cursor = Math.max(
      0,
      Math.min(state.review.cursor, Math.max(0, state.review.queue.length - 1))
    );
  }

  /**
   * 渲染前的兜底：队列为空但确实存在到期错词时补齐。
   * 场景：用户先进入过复习页（此时无错词，队列为空），
   * 随后在学习页标记了新的错词——此时必须把新错词纳入本轮。
   *
   * 只有在本轮尚未作答过时才补齐（answeredInRound === 0）：
   * 一旦本轮已经答过，队列为空就代表「本轮已完成」，应当显示完成状态。
   */
  function syncQueue() {
    if (state.review.queue.length > 0) return;
    if (state.review.answeredInRound > 0) return;

    var pending = LG.Srs.buildQueue(state, false);
    if (pending.length > 0) {
      state.review.queue = pending;
      state.review.cursor = 0;
    }
  }

  function currentWord() {
    var q = state.review.queue;
    if (!q.length) return null;
    var idx = Math.min(state.review.cursor, q.length - 1);
    return LG.Banks.getWord(q[idx]);
  }

  function init(root, ctx) {
    state = ctx.state;
    onStateChange = ctx.onStateChange;
    els = {
      root: root,
      card: root.querySelector('[data-el="card"]'),
      actions: root.querySelector('[data-el="actions"]'),
      status: root.querySelector('[data-el="status"]'),
      restart: root.querySelector('[data-el="restart"]'),
      state: root.querySelector('[data-el="state"]'),
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

    els.restart.addEventListener('click', function () {
      ensureRound(true);
      flipped = false;
      if (onStateChange) onStateChange();
    });

    // 词表选择框：点击条目跳到队列中的该词
    els.picker.addEventListener('click', function (e) {
      var item = e.target.closest('[data-jump]');
      if (!item) return;
      LG.Picker.close();
      var id = item.getAttribute('data-jump');
      var idx = state.review.queue.indexOf(id);
      if (idx < 0) return;
      state.review.cursor = idx;
      flipped = false;
      if (onStateChange) onStateChange();
    });

    ensureRound(false);

    // 设置变化时：仅调透明度时直接更新 CSS 变量（不重建卡片），其余重渲染当前卡
    if (LG.Settings) {
      LG.Settings.subscribe(function (key) {
        if (key === 'bgOpacity') {
          els.card.style.setProperty('--bg-opacity', String(LG.Settings.get('bgOpacity')));
        } else {
          render();
        }
      });
    }

    render();
  }

  /** 双向翻转：背面已显示时再点会翻回正面 */
  function flip() {
    flipped = !flipped;
    render();
  }

  /** 在本轮队列内前后移动 */
  function step(delta) {
    var total = state.review.queue.length;
    if (!total) return;
    state.review.cursor =
      (((state.review.cursor + delta) % total) + total) % total;
    flipped = false;
    if (onStateChange) onStateChange();
  }

  function submit(known) {
    var word = currentWord();
    if (!word) return;

    var before = state.review.queue.slice();
    LG.Srs.answer(state, word.id, known);

    var day = LG.Store.ensureDay(state);
    if (day.ids.indexOf(word.id) === -1) day.ids.push(word.id);
    if (known) day.known += 1;
    else day.unknown += 1;
    LG.Store.pruneDays(state);

    state.review.answeredInRound += 1;

    var pos = before.indexOf(word.id);
    var rest = before.filter(function (id) {
      return id !== word.id;
    });

    if (known) {
      // 答对：从本轮队列移除，进度指针停在原位接下一个
      state.review.queue = rest;
      state.review.cursor = Math.min(pos, Math.max(0, rest.length - 1));
      flipped = false;
    } else {
      // 答错：回插到稍后位置，稍后本轮再考一次；同时翻面展示答案
      var gap = Math.min(pos + LG.Srs.REINSERT_GAP, rest.length);
      rest.splice(gap, 0, word.id);
      state.review.queue = rest;
      state.review.cursor = gap;
      flipped = true;
    }
    if (onStateChange) onStateChange();
  }

  function onKey(e) {
    if (!els.root.classList.contains('is-active')) return false;
    var key = e.key;
    if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
      e.preventDefault();
      flipped = !flipped;
      render();
      return true;
    }
    if (key === 'r' || key === 'R') {
      var w = currentWord();
      if (w) LG.Speech.speak(w.word + '、' + w.kana);
      return true;
    }
    return false;
  }

  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  var ICON_BOOK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

  function renderEmpty() {
    var hasLearning = LG.Stats.learningCount(state) > 0;
    els.card.hidden = true;
    els.actions.hidden = true;
    els.state.hidden = false;

    var title, desc, actionLabel;
    if (hasLearning) {
      title = '还没有到复习时间';
      desc =
        '当前 ' + LG.Stats.learningCount(state) + ' 个词正在巩固中，' +
        '下次复习时间到了会自动出现在这里。';
      actionLabel = '重新开始一轮';
    } else if (LG.Stats.touchedCount(state) === 0) {
      title = '暂无需要复习的单词';
      desc = '先去学习页过几个单词，标记为「不认识」的会自动收集到这里。';
      actionLabel = '去学习';
    } else {
      title = '全部掌握，休息一下';
      desc = '词库中的单词都已达到牢固程度，没有待复习的错词。';
      actionLabel = '重新检查一遍';
    }

    els.state.innerHTML =
      '<div class="state">' +
      '<div class="state__mark">' + (hasLearning ? ICON_BOOK : ICON_CHECK) + '</div>' +
      '<h2 class="state__title">' + WordCard.escapeHtml(title) + '</h2>' +
      '<p class="state__desc">' + WordCard.escapeHtml(desc) + '</p>' +
      '<button type="button" class="btn btn--primary btn--block" data-act="empty">' +
      WordCard.escapeHtml(actionLabel) +
      '</button>' +
      '</div>';

    els.state.querySelector('[data-act="empty"]').addEventListener('click', function () {
      if (hasLearning) {
        ensureRound(true);
        flipped = false;
        if (onStateChange) onStateChange();
      } else if (LG.Stats.touchedCount(state) === 0) {
        if (onStateChange) onStateChange('goto:study');
      } else {
        ensureRound(true);
        flipped = false;
        if (onStateChange) onStateChange();
      }
    });
  }

  function render() {
    syncQueue();
    var word = currentWord();

    if (!word) {
      renderEmpty();
      return;
    }

    els.state.hidden = true;
    els.card.hidden = false;

    WordCard.render(els.card, word, {
      flipped: flipped,
      onFlip: flip,
      onSpeak: function () {}
    });

    // 认识 / 不认识 常驻显示
    els.actions.hidden = false;

    var total = state.review.queue.length;
    var idx = Math.min(state.review.cursor, Math.max(0, total - 1));

    els.status.innerHTML =
      '<span class="navbar__counter"><strong>' + (idx + 1) + '</strong> / ' + total + ' 待复习</span>';

    renderPicker(state.review.queue, word.id);
  }

  /** 渲染复习队列选择框 */
  function renderPicker(queue, activeId) {
    if (!els.pickerList) return;
    var bank = LG.Banks;
    var html = '';
    queue.forEach(function (id) {
      var w = LG.Banks.getWord(id);
      if (!w) return;
      var rec = state.words[id];
      var box = rec ? rec.box : 0;
      var tag =
        box === 0
          ? '<span class="picker__tag picker__tag--weak">弱</span>'
          : '<span class="picker__tag">' + WordCard.escapeHtml(LG.Srs.boxName(box)) + '</span>';
      var search = (w.word + ' ' + w.kana + ' ' + (w.src || '') + ' ' + (w.romaji || '') + ' ' + w.meaning).toLowerCase();
      html +=
        '<li class="picker__item' + (id === activeId ? ' is-active' : '') + '" data-jump="' +
        WordCard.escapeHtml(id) + '" data-search="' + WordCard.escapeHtml(search) + '">' +
        '<span class="picker__word" lang="ja">' + WordCard.escapeHtml(w.word) + '</span>' +
        '<span class="picker__meaning">' + WordCard.escapeHtml(w.meaning) + '</span>' +
        tag +
        '</li>';
    });
    html += '<li class="picker__empty" style="display:none">没有匹配的单词</li>';
    els.pickerList.innerHTML = html;
    if (LG.Picker && LG.Picker.applyFilter) LG.Picker.applyFilter(els.picker);
  }

  LG.ReviewView = {
    init: init,
    render: render,
    onKey: onKey,
    setState: function (next) {
      state = next;
      flipped = false;
    },
    isFlipped: function () {
      return flipped;
    },
    /** 供手势调用 */
    flip: flip,
    next: function () {
      step(1);
    },
    prev: function () {
      step(-1);
    },
    reset: function () {
      flipped = false;
    },
    rebuild: function () {
      ensureRound(true);
      flipped = false;
    }
  };
})(window);