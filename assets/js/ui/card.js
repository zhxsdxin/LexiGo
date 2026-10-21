/**
 * 单词卡组件
 * ---------------------------------------------------------------
 * 学习页与复习页共用。卡片为 3D 翻转结构：
 *   正面 → 日语单词 + 音调
 *   背面 → 读音假名 + 词性 + 中文释义（+ 词库中存在的例句）
 *
 * 翻转用 CSS 3D Transform 实现：Y 轴旋转 180°，350ms ease-in-out，
 * 透视距离 1000px，正反两面 backface-visibility: hidden 互斥显示。
 *
 * 关键约束：DOM 骨架只创建一次。
 * 若每次 render 都重建 innerHTML，.card__inner 就是全新元素，
 * 没有可供过渡的旧值，transform 变化会瞬间跳到终点，动画不会发生。
 * 因此这里把「建骨架」与「填内容」拆开，后续只改文本节点。
 */
(function (global) {
  'use strict';

  var ICON_SPEAK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 5 6 9H3v6h3l5 4V5z"/>' +
    '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
    '<path d="M18.5 5.5a9 9 0 0 1 0 13"/>' +
    '</svg>';

  var ICON_PREV =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

  var ICON_NEXT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  var ICON_SHUFFLE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>';

  /**
   * 发音按钮。
   * 正反两面各有一个：按钮属于卡面，卡面翻转时按钮要跟着翻。
   * 只在翻转层里放一个的话，翻到背面它既不跟转又会露出镜像文字。
   * @param {string} side front / back
   */
  function speakButton(side) {
    return (
      '<button type="button" class="card__speak" data-act="speak" data-side="' + side + '"' +
      ' aria-label="播放日语发音">' +
      ICON_SPEAK +
      '<span data-f="speak-label-' + side + '">发音</span>' +
      '</button>'
    );
  }

  /**
   * 建立卡片骨架，只执行一次。
   * @param {HTMLElement} root
   * @returns {object} 骨架内各节点的引用
   */
  function buildSkeleton(root) {
    root.innerHTML =
      '<div class="card__inner">' +
      // 正面：单词 + 音调
      '<div class="card__face card__face--front">' +
      '<div class="card__body">' +
      '<h2 class="card__word" lang="ja" data-f="word"></h2>' +
      '<span class="card__pitch" data-f="pitch-front" aria-hidden="true"></span>' +
      '</div>' +
      speakButton('front') +
      '</div>' +
      // 背面：假名 + 词性 + 释义
      '<div class="card__face card__face--back">' +
      '<div class="card__body">' +
      '<div class="card__kana-row">' +
      '<p class="card__kana" lang="ja" data-f="kana"></p>' +
      '<span class="card__pitch card__pitch--back" data-f="pitch-back" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="card__divider"></div>' +
      '<p class="card__meaning" data-f="meaning"></p>' +
      '<span class="card__pos" data-f="pos" hidden></span>' +
      '<div class="card__example" data-f="example" hidden>' +
      '<p class="card__example-jp" lang="ja" data-f="example-jp" hidden></p>' +
      '<p class="card__example-cn" data-f="example-cn" hidden></p>' +
      '</div>' +
      '</div>' +
      speakButton('back') +
      '</div>' +
      '</div>';

    var speech = global.LexiGo.Speech;

    var refs = {
      root: root,
      inner: root.querySelector('.card__inner'),
      word: root.querySelector('[data-f="word"]'),
      pitchFront: root.querySelector('[data-f="pitch-front"]'),
      kana: root.querySelector('[data-f="kana"]'),
      pitchBack: root.querySelector('[data-f="pitch-back"]'),
      meaning: root.querySelector('[data-f="meaning"]'),
      pos: root.querySelector('[data-f="pos"]'),
      example: root.querySelector('[data-f="example"]'),
      exampleJp: root.querySelector('[data-f="example-jp"]'),
      exampleCn: root.querySelector('[data-f="example-cn"]'),
      // 正反两面各一个发音按钮
      speakFront: root.querySelector('[data-side="front"]'),
      speakBack: root.querySelector('[data-side="back"]'),
      speakLabelFront: root.querySelector('[data-f="speak-label-front"]'),
      speakLabelBack: root.querySelector('[data-f="speak-label-back"]'),
      // 上一次渲染的词条 id，用来区分「换词」与「仅翻转」
      lastWordId: null
    };

    if (!speech.supported) {
      refs.speakFront.disabled = true;
      refs.speakBack.disabled = true;
      refs.speakLabelFront.textContent = '发音不可用';
      refs.speakLabelBack.textContent = '发音不可用';
    }

    root.__lexigoCard = refs;
    return refs;
  }

  /**
   * 把词条内容写进已建好的骨架
   */
  function fillContent(refs, word, bank) {
    refs.word.textContent = word.word;
    refs.kana.textContent = word.kana;
    refs.meaning.textContent = word.meaning;

    // 音调：词库中没有音调时不渲染
    var pitch = bank.hasPitch(word.pitch) ? bank.pitchMark(word.pitch) : '';
    refs.pitchFront.textContent = pitch;
    refs.pitchFront.hidden = !pitch;
    refs.pitchBack.textContent = pitch;
    refs.pitchBack.hidden = !pitch;

    // 词性：为空时整块隐藏
    var posLabel = word.pos || '';
    refs.pos.textContent = posLabel;
    refs.pos.hidden = !posLabel;

    // 例句只在词库中存在时输出，不补齐、不编造
    var ex = word.example;
    if (ex && (ex.jp || ex.cn)) {
      refs.example.hidden = false;
      refs.exampleJp.textContent = ex.jp || '';
      refs.exampleJp.hidden = !ex.jp;
      refs.exampleCn.textContent = ex.cn || '';
      refs.exampleCn.hidden = !ex.cn;
    } else {
      refs.example.hidden = true;
    }
  }

  /**
   * 换词时的回正与入场动画。
   *
   * 回正必须瞬时完成，不能走 350ms 过渡：
   * 卡片从背面转回正面的途中，背面会短暂正对用户，
   * 此时若已换成新词的内容，就会提前露出新词的释义。
   * 因此先关掉过渡把卡片摆回正面，再换内容。
   */
  function resetToFront(refs) {
    var root = refs.root;
    root.classList.add('is-resetting');
    root.classList.remove('is-flipped');
    // 强制回流，让「无过渡」的状态先落地
    void root.offsetWidth;
    root.classList.remove('is-resetting');
  }

  /**
   * 重放正反两面的淡入动画。
   * 手动移除再加回 class 来触发，不依赖 DOM 重建。
   */
  function replayEnter(refs) {
    var bodies = refs.root.querySelectorAll('.card__body');
    for (var i = 0; i < bodies.length; i++) {
      var el = bodies[i];
      el.classList.remove('is-entering');
      // 强制回流，让浏览器认为样式已重置，动画才能重新播放
      void el.offsetWidth;
      el.classList.add('is-entering');
    }
  }

  /**
   * 渲染一张单词卡
   * @param {HTMLElement} root  容器
   * @param {object} word       词库条目
   * @param {object} opts       { flipped, onFlip, onSpeak }
   */
  function render(root, word, opts) {
    opts = opts || {};
    var bank = global.LexiGo.Banks;
    var speech = global.LexiGo.Speech;
    var flipped = !!opts.flipped;

    var refs = root.__lexigoCard || buildSkeleton(root);

    // 换词：先瞬时回正，再换内容，避免露出新词释义
    var wordChanged = refs.lastWordId !== word.id;
    if (wordChanged) {
      resetToFront(refs);
    }

    fillContent(refs, word, bank);
    refs.lastWordId = word.id;

    /*
     * 翻转状态同步。
     * is-flipped 加在 root 上，CSS 用它驱动 .card__inner 的 rotateY(180deg)。
     * 元素始终是同一个，transform 从旧值过渡到新值，动画才会真正发生。
     */
    if (root.classList.contains('is-flipped') !== flipped) {
      root.classList.toggle('is-flipped', flipped);
    }

    // 换词时重放入场动画；仅翻面时不重放，免得翻到一半文字还在位移
    if (wordChanged) {
      replayEnter(refs);
    }

    // 卡片根节点只绑定一次点击，避免每次 render 叠加监听器
    if (!root.__lexigoBound) {
      root.__lexigoBound = true;
      root.addEventListener('click', function (e) {
        if (e.target.closest('.card__speak')) return;
        // 从 root 上读取当前回调，始终拿到最新闭包
        var cb = root.__lexigoOnFlip;
        if (cb) cb();
      });
    }
    root.__lexigoOnFlip = opts.onFlip || null;

    // 发音按钮：读当前展示的词，而不是绑定时的那一个
    var speakBtns = [refs.speakFront, refs.speakBack];
    for (var i = 0; i < speakBtns.length; i++) {
      (function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          if (!speech.supported) return;
          var ok = speech.speak(word.word + '、' + word.kana);
          if (ok) {
            btn.classList.add('is-speaking');
            global.setTimeout(function () {
              btn.classList.remove('is-speaking');
            }, 1600);
          }
          if (opts.onSpeak) opts.onSpeak();
        };
      })(speakBtns[i]);
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.WordCard = {
    render: render,
    escapeHtml: escapeHtml,
    ICON_PREV: ICON_PREV,
    ICON_NEXT: ICON_NEXT,
    ICON_SHUFFLE: ICON_SHUFFLE
  };
})(window);
