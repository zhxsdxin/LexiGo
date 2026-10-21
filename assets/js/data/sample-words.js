/**
 * 内置示例词库
 * ---------------------------------------------------------------
 * 这是最初手工整理的 5 词示例，用来快速体验交互。
 * 实际学习用 N3 全量词库（n3-words.js，由 tools/extract_words.py 生成）。
 * 两个词库共用同一套子集机制，可自由切换与勾选。
 */
(function (global) {
  'use strict';

  global.LexiGo = global.LexiGo || {};

  global.LexiGo.SAMPLE_BANK = {
    id: 'sample',
    name: '示例词库',
    words: [
      {
        id: 's1',
        word: '味',
        kana: 'あじ',
        pitch: 0,
        pos: '名词',
        posAll: '名词',
        meaning: '味道',
        part: 'basic',
        chapter: ''
      },
      {
        id: 's2',
        word: '明日',
        kana: 'あした',
        pitch: 0,
        pos: '名词',
        posAll: '名词',
        meaning: '明天',
        part: 'basic',
        chapter: ''
      },
      {
        id: 's3',
        word: '焦る',
        kana: 'あせる',
        pitch: 2,
        pos: '动词',
        posAll: '动词',
        meaning: '焦急',
        part: 'basic',
        chapter: ''
      },
      {
        id: 's4',
        word: '遊ぶ',
        kana: 'あそぶ',
        pitch: 0,
        pos: '动词',
        posAll: '动词',
        meaning: '玩耍',
        part: 'basic',
        chapter: ''
      },
      {
        id: 's5',
        word: '新しい',
        kana: 'あたらしい',
        pitch: 4,
        pos: '形容词',
        posAll: '形容词',
        meaning: '新的',
        part: 'basic',
        chapter: ''
      }
    ]
  };
})(window);