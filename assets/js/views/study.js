/**
 * 视图 · 单词学习（默认首页）
 * ---------------------------------------------------------------
 * 大字展示单词 → 主动回忆 → 点击/空格揭示 → 认识 / 不认识
 * 「不认识」的单词自动进入错词复习队列，无需手动整理。
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var WordCard = LG.WordCard;

  var els = {};
  var revealed = false;
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

  function currentWord() {
    var ids = currentOrder();
    if (!ids.length) return null;
    var idx = ((state.study.cursor % ids.length) + ids.length) % ids.length;
    return LG.WORD_BANK.get(ids[idx]);
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
      shuffle: root.querySelector('[data-el="shuffle"]')
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

    render();
  }

  function go(delta) {
    var ids = currentOrder();
    var total = ids.length;
    state.study.cursor = (((state.study.cursor + delta) % total) + total) % total;
    revealed = false;
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
    revealed = false;
    if (onStateChange) onStateChange();
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    render();
  }

  function submit(known) {
    var word = currentWord();
    if (!word || !revealed) return;

    // 记录作答：更新熟练度、每日统计
    LG.Srs.answer(state, word.id, known);
    var day = LG.Store.ensureDay(state);
    if (day.ids.indexOf(word.id) === -1) day.ids.push(word.id);
    if (known) day.known += 1;
    else day.unknown += 1;
    LG.Store.pruneDays(state);

    // 答错后立即进入本轮复习队列的靠前位置
    if (!known) {
      state.review.queue = LG.Srs.reinsert(state.review.queue, state.review.cursor, word.id);
    }

    revealed = false;
    go(1);
  }

  /** 键盘：空格揭示，方向键切换，R 发音 */
  function onKey(e) {
    if (!rootVisible()) return false;
    var key = e.key;
    if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
      if (!revealed) {
        e.preventDefault();
        reveal();
        return true;
      }
      return false;
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

  function render() {
    var word = currentWord();
    if (!word) {
      els.card.hidden = true;
      els.actions.hidden = true;
      return;
    }

    els.card.hidden = false;
    WordCard.render(els.card, word, {
      revealed: revealed,
      onReveal: reveal,
      onSpeak: function () {}
    });

    els.actions.hidden = !revealed;

    var ids = currentOrder();
    var idx = ids.indexOf(word.id);
    els.counter.innerHTML = '<strong>' + (idx + 1) + '</strong> / ' + ids.length;

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
      revealed = false;
    },
    isRevealed: function () {
      return revealed;
    },
    reset: function () {
      revealed = false;
    }
  };
})(window);