/**
 * 进度统计
 * ---------------------------------------------------------------
 * 只计算对学习有帮助的数据：今日学习量、认识/不认识分布、
 * 词库整体进度、待复习错词数。全部基于真实作答事件。
 */
(function (global) {
  'use strict';

  function today(state) {
    var key = global.LexiGo.Store.todayKey();
    return state.days[key] || { ids: [], known: 0, unknown: 0 };
  }

  function todayLearned(state) {
    return today(state).ids.length;
  }

  function todayKnown(state) {
    return today(state).known;
  }

  function todayUnknown(state) {
    return today(state).unknown;
  }

  /** 词库中已被学习过的单词数 */
  function touchedCount(state) {
    var words = global.LexiGo.Banks.activeWords();
    var n = 0;
    words.forEach(function (w) {
      var rec = state.words[w.id];
      if (rec && rec.seen > 0) n += 1;
    });
    return n;
  }

  function deckProgress(state) {
    var words = global.LexiGo.Banks.activeWords();
    var total = words.length;
    var done = touchedCount(state);
    return {
      done: done,
      total: total,
      percent: total ? Math.round((done / total) * 100) : 0
    };
  }

  /** 当前到期待复习的错词数量 */
  function dueCount(state) {
    return global.LexiGo.Srs.buildQueue(state, false).length;
  }

  /** 全部未掌握（含未到期）数量，用于进度页概览 */
  function learningCount(state) {
    var srs = global.LexiGo.Srs;
    var n = 0;
    global.LexiGo.Banks.activeWords().forEach(function (w) {
      if (srs.isLearning(state, w.id)) n += 1;
    });
    return n;
  }

  function masteredCount(state) {
    var maxBox = global.LexiGo.Srs.MAX_BOX;
    var n = 0;
    global.LexiGo.Banks.activeWords().forEach(function (w) {
      var rec = state.words[w.id];
      if (rec && rec.box >= maxBox) n += 1;
    });
    return n;
  }

  /** 已知/未知的比例，用于细进度条 */
  function accuracy(state) {
    var k = todayKnown(state);
    var u = todayUnknown(state);
    var total = k + u;
    if (!total) return { known: 0, unknown: 0, percent: 0 };
    return {
      known: k,
      unknown: u,
      percent: Math.round((k / total) * 100)
    };
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Stats = {
    today: today,
    todayLearned: todayLearned,
    todayKnown: todayKnown,
    todayUnknown: todayUnknown,
    touchedCount: touchedCount,
    deckProgress: deckProgress,
    dueCount: dueCount,
    learningCount: learningCount,
    masteredCount: masteredCount,
    accuracy: accuracy
  };
})(window);