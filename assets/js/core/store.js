/**
 * 本地持久化
 * ---------------------------------------------------------------
 * 学习状态、错词、进度全部保存在浏览器本地（localStorage）。
 * 刷新或关闭页面后重新打开可以恢复。
 * 隐私模式 / 存储被禁用时不抛错，降级为内存态，页面照常可用。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'lexigo.state.v1';
  var SCHEMA_VERSION = 1;

  var memoryFallback = null;
  var storageOK = (function () {
    try {
      var probe = '__lexigo_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function todayKey(ts) {
    var d = ts ? new Date(ts) : new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  function daysAgoKey(n) {
    return todayKey(Date.now() - n * 86400000);
  }

  function emptyDay() {
    return { ids: [], known: 0, unknown: 0 };
  }

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      createdAt: Date.now(),
      /** 每日统计：{ 'YYYY-MM-DD': { ids: [], known, unknown } } */
      days: {},
      /** 每个单词的学习档案 */
      words: {},
      /** 学习页状态 */
      study: {
        cursor: 0,
        order: 'sequential', // sequential | random
        orderSeed: 1
      },
      /** 复习页状态 */
      review: {
        queue: [],
        cursor: 0,
        roundStartedAt: 0,
        answeredInRound: 0
      }
    };
  }

  function read() {
    var raw = null;
    if (storageOK) {
      try {
        raw = global.localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        raw = null;
      }
    } else {
      raw = memoryFallback;
    }
    if (!raw) return defaultState();
    try {
      var parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      return defaultState();
    }
  }

  function write(state) {
    var raw = JSON.stringify(state);
    if (storageOK) {
      try {
        global.localStorage.setItem(STORAGE_KEY, raw);
        return true;
      } catch (e) {
        // 配额溢出等异常：降级到内存，保证当前会话可用
        memoryFallback = raw;
        return false;
      }
    }
    memoryFallback = raw;
    return false;
  }

  function migrate(data) {
    var base = defaultState();
    if (!data || typeof data !== 'object') return base;

    var merged = {
      version: SCHEMA_VERSION,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : base.createdAt,
      days: (data.days && typeof data.days === 'object') ? data.days : {},
      words: (data.words && typeof data.words === 'object') ? data.words : {},
      study: Object.assign({}, base.study, data.study || {}),
      review: Object.assign({}, base.review, data.review || {})
    };

    // 单词档案字段补齐，防止旧数据缺字段导致渲染出错
    Object.keys(merged.words).forEach(function (id) {
      var rec = merged.words[id] || {};
      merged.words[id] = {
        id: id,
        box: typeof rec.box === 'number' ? rec.box : 0,
        seen: typeof rec.seen === 'number' ? rec.seen : 0,
        known: typeof rec.known === 'number' ? rec.known : 0,
        unknown: typeof rec.unknown === 'number' ? rec.unknown : 0,
        streak: typeof rec.streak === 'number' ? rec.streak : 0,
        lastResult: rec.lastResult === 'known' ? 'known' : (rec.lastResult === 'unknown' ? 'unknown' : null),
        lastSeenAt: typeof rec.lastSeenAt === 'number' ? rec.lastSeenAt : 0,
        dueAt: typeof rec.dueAt === 'number' ? rec.dueAt : 0
      };
    });

    if (merged.review.queue.some(function (id) { return typeof id !== 'string'; })) {
      merged.review.queue = [];
      merged.review.cursor = 0;
    }

    return merged;
  }

  function ensureDay(state, ts) {
    var key = todayKey(ts);
    if (!state.days[key]) state.days[key] = emptyDay();
    var day = state.days[key];
    if (!Array.isArray(day.ids)) day.ids = [];
    if (typeof day.known !== 'number') day.known = 0;
    if (typeof day.unknown !== 'number') day.unknown = 0;
    return day;
  }

  /** 只保留最近 30 天，避免 localStorage 无限增长 */
  function pruneDays(state) {
    var keys = Object.keys(state.days);
    if (keys.length <= 30) return;
    keys.sort();
    keys.slice(0, keys.length - 30).forEach(function (k) {
      delete state.days[k];
    });
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Store = {
    STORAGE_KEY: STORAGE_KEY,
    isPersistent: function () {
      return storageOK;
    },
    read: read,
    write: write,
    todayKey: todayKey,
    daysAgoKey: daysAgoKey,
    ensureDay: ensureDay,
    pruneDays: pruneDays,
    clear: function () {
      if (storageOK) {
        try {
          global.localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* 忽略 */ }
      }
      memoryFallback = null;
    }
  };
})(window);