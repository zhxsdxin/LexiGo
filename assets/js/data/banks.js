/**
 * 词库管理
 * ---------------------------------------------------------------
 * 支持多个词库共存（默认 5 词示例库 + N3 词单全量库），
 * 叠加「子集」维度：每个词库内部按篇 / 类别划成若干子集，
 * 用户可自由勾选子集（单选或多选），学习与复习只针对选中的词。
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;

  function normalize(raw) {
    if (!raw) return null;
    var words = (raw.words || []).map(function (w, i) {
      return {
        id: w.id || ('x' + i),
        word: w.word,
        kana: w.kana,
        pitch: (w.pitch === null || w.pitch === undefined) ? null : w.pitch,
        pos: w.pos || '',
        posAll: w.posAll || '',
        meaning: w.meaning || '',
        // src：外来语的源语言写法（ガイド → guide），无则空串
        src: w.src || '',
        // example：例句，词库中不存在时为 null
        example: w.example || null,
        part: w.part || '',
        chapter: w.chapter || '',
        index: i
      };
    });
    return {
      id: raw.id,
      name: raw.name,
      words: words,
      total: words.length
    };
  }

  /** 全部可用词库 */
  var banks = [];
  function register(raw) {
    return addBank(raw);
  }

  var byId = {};
  function refreshIndex() {
    byId = {};
    banks.forEach(function (b) {
      byId[b.id] = b;
    });
  }

  /** 注册一个词库并刷新索引 */
  function addBank(raw) {
    var b = normalize(raw);
    if (!b) return null;
    banks.push(b);
    refreshIndex();
    reindex();
    return b;
  }

  // ---- 子集定义 ----
  // 基础：整本词单的基础词篇
  // 核心类：按词单自身的分篇划分，读音/释义/词性都可直接用
  var SUBSET_DEFS = [
    {
      id: 'basic',
      name: '基础',
      desc: '日常高频词，打底用',
      groups: ['基础词'],
      match: function (w) { return w.part === 'basic'; }
    },
    {
      id: 'kanji',
      name: '汉字',
      desc: '单字与双字词，偏 N2 补弱',
      groups: ['核心词'],
      match: function (w) { return w.chapter === '汉字'; }
    },
    {
      id: 'verb',
      name: '动词',
      desc: '五段 / 一段 / 不规则',
      groups: ['核心词'],
      match: function (w) { return w.chapter === '动词'; }
    },
    {
      id: 'adj',
      name: '形容词',
      desc: 'い形容词与な形容词',
      groups: ['核心词'],
      match: function (w) { return w.chapter === '形容词'; }
    },
    {
      id: 'loan',
      name: '外来语',
      desc: '片假名外来词',
      groups: ['核心词'],
      match: function (w) { return w.chapter === '外来语'; }
    },
    {
      id: 'adv',
      name: '副词',
      desc: '修饰动词的副词',
      groups: ['核心词'],
      match: function (w) { return w.chapter === '副词'; }
    },
    {
      id: 'noun',
      name: '核心词·其余',
      desc: '核心词篇里未归入上述五类的条目（当前为空）',
      groups: ['核心词'],
      // 六个分篇已覆盖全部核心词，这个子集只作为兜底，
      // 没有匹配到词时界面上会自动置灰不可选。
      match: function (w) {
        return w.part === 'core' && !w.chapter;
      }
    }
  ];

  var subsetById = {};
  SUBSET_DEFS.forEach(function (s) { subsetById[s.id] = s; });

  /** 某个词库下各子集的单词 id */
  function subsetIds(bankId, subsetId) {
    var b = byId[bankId];
    var def = subsetById[subsetId];
    if (!b || !def) return [];
    var out = [];
    b.words.forEach(function (w) {
      if (def.match(w)) out.push(w.id);
    });
    return out;
  }

  /** 多个子集求并集；空选表示全选 */
  function mergeSubsetIds(bankId, subsetIdsList) {
    if (!subsetIdsList || !subsetIdsList.length) return null;
    var seen = {};
    var out = [];
    subsetIdsList.forEach(function (sid) {
      subsetIds(subankId(bankId), sid).forEach(function (id) {
        if (!seen[id]) { seen[id] = 1; out.push(id); }
      });
    });
    return out;
  }

  function subankId(bankId) { return bankId; }

  // 音调番号 → 显示字符。
  //
  // 关键：1-4 必须用 U+2460 区的带圈数字（①②③④），
  // U+24EB-24EE 在 Unicode 里是「黑圈拉丁小写字母 b/c/d/e」，
  // macOS 字体会把它们渲染成黑底白字的字母，数字 1-4 全部显示错误。
  // 带圈零 ⓪ 只有 U+24EA 这一个码位，用它没问题。
  var PITCH_MARK = {
    0: '\u24EA',  // ⓪ 带圈零
    1: '\u2460',  // ①
    2: '\u2461',  // ②
    3: '\u2462',  // ③
    4: '\u2463',  // ④
    5: '\u2464',  // ⑤
    6: '\u2465',  // ⑥
    7: '\u2466',  // ⑦
    8: '\u2467',  // ⑧
    9: '\u2468',  // ⑨
    10: '\u2469', // ⑩
    11: '\u246A'  // ⑪
  };

  /** 音调番号 → 带圈数字；无音调返回空串 */
  function pitchMark(pitch) {
    if (pitch === null || pitch === undefined) return '';
    return PITCH_MARK[pitch] || '';
  }

  function hasPitch(pitch) {
    return pitch !== null && pitch !== undefined && PITCH_MARK[pitch] !== undefined;
  }

  function subsets() { return SUBSET_DEFS.slice(); }
  function getSubset(id) { return subsetById[id] || null; }

  // 全局单词索引：id → 词条。学习状态是全局的，切库也不会丢。
  var wordIndex = {};
  function reindex() {
    wordIndex = {};
    banks.forEach(function (b) {
      b.words.forEach(function (w) {
        wordIndex[w.id] = w;
        w.bankId = b.id;
      });
    });
  }

  /** 按 id 取词条，不限词库 */
  function getWord(id) {
    return wordIndex[id] || null;
  }

  /**
   * 当前生效范围内的全部词条。
   * ids 为 null 表示不限（整库）；空数组表示用户主动清空了子集。
   */
  function activeWords() {
    if (!global.LexiGo || !global.LexiGo.DeckMenu) return [];
    var deck = global.LexiGo.DeckMenu;
    var bank = deck.currentBank();
    if (!bank) return [];
    var ids = deck.activeIds(bank.id);
    var out = [];
    bank.words.forEach(function (w) {
      if (ids === null || ids.indexOf(w.id) >= 0) out.push(w);
    });
    return out;
  }

  refreshIndex();

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Banks = {
    reindex: reindex,
    getWord: getWord,
    activeWords: activeWords,
    register: register,
    all: function () { return banks.slice(); },
    get: function (id) { return byId[id] || null; },
    subsets: subsets,
    getSubset: getSubset,
    pitchMark: pitchMark,
    hasPitch: hasPitch,
    subsetIds: subsetIds,
    mergeSubsetIds: mergeSubsetIds,
    refreshIndex: refreshIndex
  };
})(window);