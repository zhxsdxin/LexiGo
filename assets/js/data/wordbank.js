/**
 * LexiGo 内置词库
 * ---------------------------------------------------------------
 * 由开发者预先整理并内置，用户无需导入任何文件。
 *
 * 字段说明：
 *   id      单词唯一编号
 *   word    日语表记字（汉字或假名）
 *   kana    读音假名
 *   pitch   音调番号（0-4），仅当词库中存在时才填写
 *   pos     词性（仅当词库中存在时才填写）
 *   meaning 中文释义
 *   marker  原始资料中的标记位，仅作溯源保留，不在界面展示
 *   example 例句（可选）。词库中不存在时保持 null，界面自动隐藏该区域，
 *           不做补齐，也不编造内容。
 */
(function (global) {
  'use strict';

  var WORD_BANK = {
    id: 'default',
    name: '默认词库',
    words: [
      {
        id: 'w1',
        word: '味',
        kana: 'あじ',
        pitch: 0,
        pos: '名',
        meaning: '味道',
        marker: null,
        example: null
      },
      {
        id: 'w2',
        word: '明日',
        kana: 'あした',
        pitch: 0,
        pos: '名',
        meaning: '明天',
        marker: null,
        example: null
      },
      {
        id: 'w3',
        word: '焦る',
        kana: 'あせる',
        pitch: 2,
        pos: '动词',
        meaning: '焦急',
        marker: null,
        example: null
      },
      {
        id: 'w4',
        word: '遊ぶ',
        kana: 'あそぶ',
        pitch: 0,
        pos: '动词',
        meaning: '玩耍',
        marker: null,
        example: null
      },
      {
        id: 'w5',
        word: '新しい',
        kana: 'あたらしい',
        pitch: 4,
        pos: '形容词',
        meaning: '新的',
        marker: null,
        example: null
      }
    ]
  };

  // 词性代码 → 展示文案。词库里写的是代码，展示层做一次映射。
  var POS_LABEL = {
    '名': '名词',
    '形': '形容词',
    '形容詞': '形容词',
    '動': '动词',
    '動詞': '动词',
    '副': '副词',
    '接続': '连接词'
  };

  var byId = {};
  WORD_BANK.words.forEach(function (w, i) {
    // 保证 id 稳定，同时保留原始序号用于顺序学习
    w.index = i + 1;
    byId[w.id] = w;
  });

  WORD_BANK.total = WORD_BANK.words.length;

  WORD_BANK.get = function (id) {
    return byId[id] || null;
  };

  WORD_BANK.posLabel = function (pos) {
    if (!pos) return '';
    return POS_LABEL[pos] || pos;
  };

  // 音调番号 → 显示字符。
  //
  // 关键：1-4 必须用 U+2460 区的带圈数字（①②③④），
  // 不能用 U+24EA 区看起来一样的 ⓫⓬⓭⓮。
  // U+24EB-24EE 在 Unicode 里是「黑圈拉丁小写字母 b/c/d/e」，
  // macOS 字体会把它们渲染成黑底白字的字母，数字 1-4 全部显示错误。
  // 带圈零只有 U+24EA 这一个码位，用它没问题。
  // 写成 Unicode 转义是为了避免源码里的字符在编辑或传输中被改写。
  var PITCH_MARK = {
    0: '\u24EA', // U+24EA 带圈零
    1: '\u2460', // U+2460 ①
    2: '\u2461', // U+2461 ②
    3: '\u2462', // U+2462 ③
    4: '\u2463'  // U+2463 ④
  };

  WORD_BANK.pitchMark = function (pitch) {
    if (pitch === null || pitch === undefined) return '';
    return PITCH_MARK[pitch] || '';
  };

  WORD_BANK.hasPitch = function (pitch) {
    return pitch !== null && pitch !== undefined && PITCH_MARK[pitch] !== undefined;
  };

  WORD_BANK.orderedIds = function () {
    return WORD_BANK.words.map(function (w) {
      return w.id;
    });
  };

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.WORD_BANK = WORD_BANK;
})(window);