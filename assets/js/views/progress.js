/**
 * 视图 · 学习进度
 * ---------------------------------------------------------------
 * 只展示对学习有帮助的数据：今日学习量、认识/不认识分布、
 * 词库掌握进度、待复习错词。
 * 用数字、细进度条和轻量柱状图形呈现，不做数据大屏与打卡机制。
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var WordCard = LG.WordCard;

  var els = {};
  var state = null;
  var onStateChange = null;

  function init(root, ctx) {
    state = ctx.state;
    onStateChange = ctx.onStateChange;
    els = { root: root, panel: root.querySelector('[data-el="panel"]') };
    render();
  }

  function render() {
    var S = LG.Stats;
    var deck = S.deckProgress(state);
    var acc = S.accuracy(state);
    var due = S.dueCount(state);
    var learning = S.learningCount(state);
    var mastered = S.masteredCount(state);

    // ---------- 今日 ----------
    var learnedToday = S.todayLearned(state);
    var splitHtml =
      acc.known + acc.unknown > 0
        ? '<div class="split">' +
          '<div class="split__known" style="width:' + acc.percent + '%"></div>' +
          '<div class="split__unknown" style="width:' + (100 - acc.percent) + '%"></div>' +
          '</div>' +
          '<div class="legend">' +
          '<span class="legend__item"><span class="legend__dot legend__dot--known"></span>认识 <span class="legend__num">' + acc.known + '</span></span>' +
          '<span class="legend__item"><span class="legend__dot legend__dot--unknown"></span>不认识 <span class="legend__num">' + acc.unknown + '</span></span>' +
          '</div>'
        : '';

    var html = '';

    var todaySub =
      acc.known + acc.unknown > 0
        ? '今日作答 ' + (acc.known + acc.unknown) + ' 次，命中 ' + acc.percent + '%'
        : '今天还没有作答记录，去学习页过几个词。';

    html +=
      '<div class="stat">' +
      '<p class="stat__label">今日已学习</p>' +
      '<div class="stat__value">' + learnedToday + '<small>词</small></div>' +
      '<p class="stat__sub" style="margin:8px 0 0">' + todaySub + '</p>' +
      splitHtml +
      '</div>';

    // ---------- 词库进度 ----------
    html +=
      '<div class="stat">' +
      '<p class="stat__label">词库学习进度</p>' +
      '<div class="stat__value">' + deck.percent + '<small>%</small></div>' +
      '<div class="bar" style="margin-top:12px"><div class="bar__fill" style="width:' + deck.percent + '%"></div></div>' +
      '<p class="stat__sub">已学 ' + deck.done + ' / ' + deck.total + ' 词 · 巩固中 ' + learning + ' · 已掌握 ' + mastered + '</p>' +
      '</div>';

    // ---------- 掌握分布（轻量柱状） ----------
    html += '<div class="stat"><p class="stat__label">掌握程度分布</p>' + levelsHtml(state) + '</div>';

    // ---------- 待复习 ----------
    html +=
      '<div class="stat">' +
      '<p class="stat__label">待复习错词</p>' +
      '<div class="stat__value">' + due + '<small>词</small></div>' +
      '<p class="stat__sub">' +
      (due > 0 ? '这些词已到复习时间，答对后间隔会自动拉长。' : '当前没有到期的错词。') +
      '</p>' +
      '</div>';

    // ---------- 错词清单 ----------
    var wrongList = buildWrongList(state);
    if (wrongList.length) {
      html += '<div class="stat"><p class="stat__label">需要多看几眼的词</p><div class="wordlist">';
      wrongList.forEach(function (item) {
        var w = item.word;
        html +=
          '<div class="wordlist__item">' +
          '<span class="wordlist__jp" lang="ja">' + WordCard.escapeHtml(w.word) +
          '<span class="wordlist__kana">' + WordCard.escapeHtml(w.kana) + '</span></span>' +
          '<span class="wordlist__cn">' + WordCard.escapeHtml(w.meaning) + '</span>' +
          '<span class="tag' + (item.due ? ' tag--due' : '') + '">' +
          WordCard.escapeHtml(item.label) +
          '</span>' +
          '</div>';
      });
      html += '</div></div>';
    }

    // ---------- 数据管理 ----------
    html +=
      '<div class="stat">' +
      '<p class="stat__label">本地数据</p>' +
      '<p class="stat__sub" style="margin:0 0 14px">' +
      (LG.Store.isPersistent()
        ? '学习记录保存在此浏览器本地，刷新或重开都不会丢失。'
        : '当前浏览器无法持久化存储（可能处于隐私模式），本次记录在关闭页面后不会保留。') +
      '</p>' +
      '<button type="button" class="btn btn--ghost btn--block" data-act="reset">清空学习记录</button>' +
      '</div>';

    els.panel.innerHTML = html;

    var resetBtn = els.panel.querySelector('[data-act="reset"]');
    resetBtn.addEventListener('click', function () {
      if (resetBtn.dataset.confirm === '1') {
        LG.Store.clear();
        if (onStateChange) onStateChange('reset');
        return;
      }
      resetBtn.dataset.confirm = '1';
      resetBtn.textContent = '再次点击确认清空';
      resetBtn.classList.add('btn--primary');
      global.setTimeout(function () {
        if (!resetBtn.isConnected) return;
        resetBtn.dataset.confirm = '0';
        resetBtn.textContent = '清空学习记录';
        resetBtn.classList.remove('btn--primary');
      }, 4000);
    });
  }

  /** 错词清单：按熟练度从低到高，最多 8 个 */
  function buildWrongList(st) {
    var srs = LG.Srs;
    var now = Date.now();
    var list = [];

    LG.Banks.activeWords().forEach(function (w) {
      var rec = st.words[w.id];
      if (!rec || rec.seen === 0) return;
      if (rec.box >= srs.MAX_BOX) return;

      var due = (rec.dueAt || 0) <= now;
      var label;
      if (rec.unknown === 0) label = '巩固中';
      else if (due) label = '待复习';
      else label = '巩固中';

      list.push({ word: w, rec: rec, due: due, label: label, box: rec.box });
    });

    list.sort(function (a, b) {
      if (a.due !== b.due) return a.due ? -1 : 1;
      if (a.box !== b.box) return a.box - b.box;
      return b.rec.unknown - a.rec.unknown;
    });

    return list.slice(0, 8);
  }

  /** 掌握程度分布：5 个等级的轻量柱状图 */
  function levelsHtml(st) {
    var counts = [0, 0, 0, 0, 0];
    var total = LG.Banks.activeWords().length;

    LG.Banks.activeWords().forEach(function (w) {
      var rec = st.words[w.id];
      if (!rec || rec.seen === 0) return;
      counts[Math.min(rec.box, 4)] += 1;
    });

    var max = Math.max.apply(null, counts.concat([1]));
    var names = ['未掌握', '眼熟', '认识', '熟悉', '牢固'];
    var html = '<div class="levels">';

    for (var i = 0; i < counts.length; i++) {
      var h = Math.round((counts[i] / max) * 100);
      if (counts[i] === 0) h = 4;
      html +=
        '<div class="level">' +
        '<span class="level__num">' + counts[i] + '</span>' +
        '<span class="level__bar"><span class="level__fill' + (counts[i] > 0 ? ' is-active' : '') +
        '" style="height:' + h + '%"></span></span>' +
        '<span class="level__name">' + names[i] + '</span>' +
        '</div>';
    }
    html += '</div>';

    var learned = LG.Stats.touchedCount(st);
    html +=
      '<p class="stat__sub">共 ' + total + ' 词，已接触 ' + learned + ' 词。柱高按最高等级归一化。</p>';

    return html;
  }

  LG.ProgressView = {
    init: init,
    render: render,
    setState: function (next) {
      state = next;
    }
  };
})(window);