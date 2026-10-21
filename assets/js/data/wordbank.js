/**
 * LexiGo 内置词库
 * ---------------------------------------------------------------
 * 由开发者预先整理并内置，用户无需导入任何文件。
 *
 * 字段说明：
 *   id      单词唯一编号
 *   word    日语表记字（汉字或假名）
 *   kana    读音假名
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
        pos: '名',
        meaning: '味道',
        marker: null,
        example: null
      },
      {
        id: 'w2',
        word: '明日',
        kana: 'あした',
        pos: '名',
        meaning: '明天',
        marker: null,
        example: null
      },
      {
        id: 'w3',
        word: '焦る',
        kana: 'あせる',
        pos: '动词',
        meaning: '焦急',
        marker: '0@@@',
        example: null
      },
      {
        id: 'w4',
        word: '遊ぶ',
        kana: 'あそぶ',
        pos: '动词',
        meaning: '玩耍',
        marker: null,
        example: null
      },
      {
        id: 'w5',
        word: '新しい',
        kana: 'あたらしい',
        pos: '形容词',
        meaning: '新的',
        marker: '④',
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

  WORD_BANK.orderedIds = function () {
    return WORD_BANK.words.map(function (w) {
      return w.id;
    });
  };

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.WORD_BANK = WORD_BANK;
})(window);