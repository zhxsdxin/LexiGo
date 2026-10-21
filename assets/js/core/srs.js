/**
 * 复习调度
 * ---------------------------------------------------------------
 * 用 Leitner 盒子管理每个单词的熟练度，box 越高复习间隔越长，
 * 连续答对逐级上升，答错立刻打回 box 0 并重新排进本轮队列。
 *
 * box 0 → 本轮内稍后再次出现（答错即回炉）
 * box 1 → 10 分钟后
 * box 2 → 1 天后
 * box 3 → 3 天后
 * box 4 → 7 天后
 * box 5 → 毕业，仅在手动开始新一轮复习时出现
 */
(function (global) {
  'use strict';

  var MIN = 60 * 1000;
  var DAY = 24 * 60 * MIN;

  // box -> 距离下次复习的间隔
  var INTERVAL = [0, 10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, Infinity];

  // box -> 展示用名称
  var BOX_NAME = ['未掌握', '眼熟', '认识', '熟悉', '牢固', '已掌握'];

  var MAX_BOX = 5;

  // 答错后在本轮队列中的回插间隔：隔 2 个词再出现
  var REINSERT_GAP = 2;

  function newRecord(id, now) {
    return {
      id: id,
      box: 0,
      seen: 0,
      known: 0,
      unknown: 0,
      streak: 0,
      lastResult: null,
      lastSeenAt: 0,
      dueAt: now || Date.now()
    };
  }

  function getRecord(state, id) {
    if (!state.words[id]) state.words[id] = newRecord(id);
    return state.words[id];
  }

  /**
   * 记录一次作答结果，返回更新后的档案
   * @param {object} state
   * @param {string} id     单词 id
   * @param {boolean} known true = 认识
   */
  function answer(state, id, known) {
    var rec = getRecord(state, id);
    var now = Date.now();

    rec.seen += 1;
    rec.lastSeenAt = now;
    rec.lastResult = known ? 'known' : 'unknown';

    if (known) {
      rec.known += 1;
      rec.streak += 1;
      if (rec.box < MAX_BOX) rec.box += 1;
      // 连续答对两次以上，可以跨一级，缩短等待
      if (rec.streak >= 2 && rec.box < MAX_BOX) {
        rec.box += 1;
        rec.streak = 0;
      }
      rec.dueAt = rec.box >= MAX_BOX ? now + DAY * 30 : now + INTERVAL[rec.box];
    } else {
      rec.unknown += 1;
      rec.streak = 0;
      rec.box = 0;
      rec.dueAt = now;
    }
    return rec;
  }

  function isDue(rec, now) {
    if (!rec) return true;
    if (rec.box >= MAX_BOX) return false; // 毕业词不进自动队列
    return (rec.dueAt || 0) <= (now || Date.now());
  }

  /** 已掌握但未到期的词 */
  function isLearning(state, id) {
    var rec = state.words[id];
    return !!rec && rec.seen > 0 && rec.box < MAX_BOX;
  }

  /**
   * 构建复习队列
   * @param {boolean} forceRestart true = 手动重开一轮，把所有未掌握的词全部拉进来
   */
  function buildQueue(state, forceRestart) {
    var words = global.LexiGo.Banks.activeWords();
    var now = Date.now();
    var list = [];

    words.forEach(function (w) {
      var rec = state.words[w.id];
      if (!rec || rec.seen === 0) return;
      if (rec.box >= MAX_BOX) {
        // 毕业词只在手动重开时召回
        if (forceRestart) list.push({ id: w.id, dueAt: rec.dueAt || 0, box: rec.box });
        return;
      }
      if (forceRestart || isDue(rec, now)) {
        list.push({ id: w.id, dueAt: rec.dueAt || 0, box: rec.box });
      }
    });

    list.sort(function (a, b) {
      if (a.box !== b.box) return a.box - b.box;      // 未掌握的排前面
      return a.dueAt - b.dueAt;                        // 同级按到期时间
    });

    return list.map(function (item) {
      return item.id;
    });
  }

  /**
   * 答错后回插到本轮队列的稍后位置。
   * 先移除该词已有的位置，避免同一单词在队列中重复出现。
   */
  function reinsert(queue, cursor, id) {
    var next = (queue || []).filter(function (item) {
      return item !== id;
    });
    var at = Math.max(0, Math.min(cursor + REINSERT_GAP, next.length));
    next.splice(at, 0, id);
    return next;
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Srs = {
    MAX_BOX: MAX_BOX,
    REINSERT_GAP: REINSERT_GAP,
    boxName: function (box) {
      return BOX_NAME[Math.max(0, Math.min(MAX_BOX, box || 0))];
    },
    intervalOf: function (box) {
      return INTERVAL[Math.max(0, Math.min(MAX_BOX, box || 0))];
    },
    newRecord: newRecord,
    getRecord: getRecord,
    answer: answer,
    isDue: isDue,
    isLearning: isLearning,
    buildQueue: buildQueue,
    reinsert: reinsert
  };
})(window);