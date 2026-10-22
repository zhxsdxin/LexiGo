/**
 * 假名 → 罗马字
 * ---------------------------------------------------------------
 * 词库的「读音」列是假名，想用罗马字检索就得先转写。
 * 这里内置一张转换表，不依赖任何库，双击 index.html 也能用。
 *
 * 输出两套写法，检索时一起进索引，两种输入习惯都能命中：
 *   Hepburn  —— し/ち/つ/ふ/じ → shi/chi/tsu/fu/ji（国内教材常见）
 *   训令式   —— し/ち/つ/ふ/じ → si/ti/tu/hu/zi
 * 例：家族 かぞく → kazoku（两套相同）/ 地震 じしん → jishin 与 jisin
 *
 * 约定：
 *   促音 っ → 重复后一个辅音（きって → kitte），っち → tchi
 *   拨音 ん → n（后接 b/p/m 时取 m，暗合 Hepburn：しんぶん → shimbun）
 *   长音 ー → 省略（コーヒー → kohi）
 */
(function (global) {
  'use strict';

  // 'hep' 或 'hep|kun'（两者写法不同时才用竖线）
  var KANA = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'さ': 'sa', 'し': 'shi|si', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'ざ': 'za', 'じ': 'ji|zi', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'た': 'ta', 'ち': 'chi|ti', 'つ': 'tsu|tu', 'て': 'te', 'と': 'to',
    'だ': 'da', 'ぢ': 'ji|di', 'づ': 'zu|du', 'で': 'de', 'ど': 'do',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu|hu', 'へ': 'he', 'ほ': 'ho',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'wo', 'ん': 'n',
    'ゔ': 'vu',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
    'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa',
    'ー': '' // 长音标记：省略
  };

  // 组合假名（拗音、小写外来语）
  var DIGRAPH = {
    'きゃ': 'kya', 'きぃ': 'kyi', 'きゅ': 'kyu', 'きぇ': 'kye', 'きょ': 'kyo',
    'ぎゃ': 'gya', 'ぎぃ': 'gyi', 'ぎゅ': 'gyu', 'ぎぇ': 'gye', 'ぎょ': 'gyo',
    'しゃ': 'sha|sya', 'しぃ': 'shi|si', 'しぇ': 'she|sye', 'しゅ': 'shu|syu', 'しょ': 'sho|syo',
    'じゃ': 'ja|zya', 'じぃ': 'ji|zi', 'じぇ': 'je|zye', 'じゅ': 'ju|zyu', 'じょ': 'jo|zyo',
    'ちゃ': 'cha|tya', 'ちぃ': 'chi|ti', 'ちぇ': 'che|tye', 'ちゅ': 'chu|tyu', 'ちょ': 'cho|tyo',
    'ぢゃ': 'ja|zya', 'ぢゅ': 'ju|zyu', 'ぢょ': 'jo|zyo',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo',
    'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo',
    'てぃ': 'ti', 'てゅ': 'tu', 'でぃ': 'di', 'でゅ': 'du',
    'とぅ': 'tu', 'どぅ': 'du', 'すぃ': 'si', 'ずぅ': 'zu',
    'くゎ': 'kwa', 'ぐゎ': 'gwa'
  };

  /** 取指定写法的读音（0=Hepburn，1=训令式） */
  function pick(value, style) {
    if (value.indexOf('|') < 0) return value;
    var parts = value.split('|');
    return style ? parts[1] : parts[0];
  }

  /** 片假名转平假名，ヴ 视作 vu 单独处理 */
  function toHiragana(s) {
    return String(s).replace(/[\u30A1-\u30F6]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  /** 取 i 位置处的读音块：优先组合假名，其次单假名 */
  function chunkAt(s, i, style) {
    var two = s.substr(i, 2);
    if (DIGRAPH[two]) return { text: pick(DIGRAPH[two], style), len: 2 };
    var one = s.charAt(i);
    if (KANA[one] !== undefined) return { text: pick(KANA[one], style), len: 1 };
    return { text: '', len: 1 };
  }

  /**
   * 转写为罗马字
   * @param {string} kana 假名（平假名或片假名）
   * @param {boolean} kun true 取训令式，false（默认）取 Hepburn
   */
  function convert(kana, kun) {
    if (!kana) return '';
    var s = toHiragana(kana);
    var out = '';
    var i = 0;

    while (i < s.length) {
      var c = s.charAt(i);

      // 促音：重复后一辅音（っ + ち → tchi）
      if (c === 'っ') {
        var nx = chunkAt(s, i + 1, kun);
        if (nx.text) {
          if (nx.text.indexOf('ch') === 0) out += 't' + nx.text;
          else if (/[bcdfghjklmnpqrstvwxyz]/.test(nx.text.charAt(0))) {
            out += nx.text.charAt(0) + nx.text;
          } else {
            out += nx.text;
          }
        }
        i += 1 + nx.len;
        continue;
      }

      // 拨音：n（后接 b/p/m 取 m）
      if (c === 'ん') {
        var nx2 = chunkAt(s, i + 1, kun);
        out += (nx2.text && /^[bpm]/.test(nx2.text)) ? 'm' : 'n';
        i += 1;
        continue;
      }

      var ch = chunkAt(s, i, kun);
      out += ch.text;
      i += ch.len;
    }
    return out;
  }

  /** 折叠连续重复字母：kitte → kite，便于按两种写法检索 */
  function collapse(s) {
    return String(s || '').replace(/(.)\1+/g, '$1');
  }

  /**
   * 一个词的全部检索用罗马字写法（空格分隔）
   * 同时给出原始写法与折叠写法，「kitte」和「kite」都能命中。
   */
  function forms(kana) {
    var hep = convert(kana, false);
    var kun = convert(kana, true);
    var list = [];
    function push(s) {
      if (s && list.indexOf(s) < 0) list.push(s);
    }
    push(hep);
    push(collapse(hep));
    push(kun);
    push(collapse(kun));
    return list.join(' ');
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Romaji = {
    convert: convert,
    forms: forms,
    collapse: collapse
  };
})(window);
