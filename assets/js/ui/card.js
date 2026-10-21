/**
 * 单词卡组件
 * ---------------------------------------------------------------
 * 学习页与复习页共用。核心流程固定为：
 *   单词 → 主动回忆 → 点击/空格揭示 → 认识 / 不认识
 * 默认只显示单词，不立即给出中文答案。
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
   * 渲染一张单词卡
   * @param {HTMLElement} root  容器
   * @param {object} word       词库条目
   * @param {object} opts       { revealed, onReveal, onKnown, onUnknown, onSpeak }
   */
  function render(root, word, opts) {
    opts = opts || {};
    var bank = global.LexiGo.WORD_BANK;
    var speech = global.LexiGo.Speech;
    var revealed = !!opts.revealed;

    root.classList.toggle('is-revealed', revealed);

    // 例句只在词库中存在时输出，不补齐、不编造
    var exampleHtml = '';
    if (word.example) {
      var exJp = word.example.jp || '';
      var exCn = word.example.cn || '';
      exampleHtml =
        '<div class="card__example">' +
        (exJp ? '<p class="card__example-jp">' + escapeHtml(exJp) + '</p>' : '') +
        (exCn ? '<p class="card__example-cn">' + escapeHtml(exCn) + '</p>' : '') +
        '</div>';
    }

    var posLabel = bank.posLabel(word.pos);

    var html =
      '<div class="card__stage">' +
      '<h2 class="card__word" lang="ja">' + escapeHtml(word.word) + '</h2>' +
      (revealed
        ? '<div class="card__answer">' +
          '<p class="card__kana" lang="ja">' + escapeHtml(word.kana) + '</p>' +
          '<div class="card__divider"></div>' +
          '<p class="card__meaning">' + escapeHtml(word.meaning) + '</p>' +
          (posLabel ? '<span class="card__pos">' + escapeHtml(posLabel) + '</span>' : '') +
          exampleHtml +
          '</div>'
        : '<p class="card__hint">点击卡片或按空格查看释义</p>') +
      '</div>' +
      '<button type="button" class="card__speak" data-act="speak"' +
      (speech.supported ? '' : ' disabled') +
      ' aria-label="播放日语发音">' +
      ICON_SPEAK +
      '<span>' + (speech.supported ? '发音' : '发音不可用') + '</span>' +
      '</button>';

    root.innerHTML = html;

    // 点击卡片空白处揭示；点按钮不触发
    root.addEventListener('click', function (e) {
      if (e.target.closest('.card__speak')) return;
      if (revealed) return;
      if (opts.onReveal) opts.onReveal();
    });

    var speakBtn = root.querySelector('[data-act="speak"]');
    if (speakBtn) {
      speakBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!speech.supported) return;
        var ok = speech.speak(word.word + '、' + word.kana);
        if (ok) {
          speakBtn.classList.add('is-speaking');
          global.setTimeout(function () {
            speakBtn.classList.remove('is-speaking');
          }, 1600);
        }
        if (opts.onSpeak) opts.onSpeak();
      });
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