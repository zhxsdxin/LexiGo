/**
 * 例句数据校验
 * ---------------------------------------------------------------
 * 用法：node tools/check_examples.mjs
 *
 * 发音读的是 ruby 展平后的假名串（见 assets/js/ui/card.js 的 rubyToKana），
 * 显示用的也是 ruby —— 所以 ruby 是「读音」的唯一来源，错了就是又念错又显示错。
 * 这个脚本把能自动判定的部分全部卡住：
 *
 *   1. 例句里词目的 ruby 读音，是否和卡片 kana 对得上（多音字取错义项会在这里暴露）
 *   2. 例句里的汉字是否都被 ruby 覆盖（漏一个，发音就会去猜）
 *   3. jp 表记与 ruby 表记是否一致（不一致只提示：多音词可以故意把 jp 写成假名）
 *   4. 例句里有没有混入简体中文专用字形（後→后、願→愿 之类）
 *   5. kana 字段有没有混入拉丁字母或杂符号
 *
 * 退出码：有问题返回 1，全通过返回 0。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadBank(file) {
  const src = readFileSync(join(root, 'assets/js/data', file), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return window.LexiGo;
}

const n3 = loadBank('n3-words.js').N3_BANK.words;
const n2 = loadBank('n2-words.js').N2_BANK.words;
const all = [...n3.map((w) => ['N3', w]), ...n2.map((w) => ['N2', w])];
const withEx = all.filter(([, w]) => w.example && w.example.ruby);

const isKanji = (c) => /[一-龯]/.test(c);

/** 把 [漢字|よみ] 串拆成 token，其余字符按单字成 token */
function tokenize(ruby) {
  const toks = [];
  let i = 0;
  while (i < ruby.length) {
    if (ruby[i] === '[') {
      const close = ruby.indexOf(']', i);
      const bar = ruby.indexOf('|', i);
      if (close > 0 && bar > 0 && bar < close) {
        toks.push({ k: ruby.slice(i + 1, bar), r: ruby.slice(bar + 1, close) });
        i = close + 1;
        continue;
      }
    }
    toks.push({ k: ruby[i], r: ruby[i] });
    i++;
  }
  return toks;
}

const errors = [];
const warns = [];

// ---- 1. 词目读音 vs 卡片 kana ----
for (const [bank, w] of withEx) {
  let stem = '';
  for (const c of w.word) {
    if (isKanji(c)) stem += c;
    else break;
  }
  if (!stem) continue;
  const toks = tokenize(w.example.ruby);
  const plain = toks.map((t) => t.k).join('');
  const read = toks.map((t) => t.r).join('');

  // 只允许词干从 token 边界起，否则「言づける」会先命中「伝言」里的「言」
  const starts = new Set();
  let pos = 0;
  for (const t of toks) {
    starts.add(pos);
    pos += t.k.length;
  }
  let idx = -1;
  for (let i = 0; i <= plain.length - stem.length; i++) {
    if (starts.has(i) && plain.substr(i, stem.length) === stem) {
      idx = i;
      break;
    }
  }
  if (idx < 0) continue; // 活用形（狙って）或 jp 已写成假名，跳过

  const map = [];
  let p = 0;
  for (const t of toks) {
    for (let j = 0; j < t.k.length; j++) map.push(p + j);
    p += t.r.length;
  }
  const from = map[idx];
  const to = idx + stem.length < map.length ? map[idx + stem.length] : read.length;
  const got = read.slice(from, to);
  if (!w.kana.startsWith(got)) {
    errors.push(`${bank} ${w.id} ${w.word}(${w.kana}) 例句注成「${got}」\n      ${w.example.ruby}`);
  }
}

// ---- 2. 汉字是否被 ruby 全覆盖 ----
for (const [bank, w] of withEx) {
  const flat = w.example.ruby.replace(/\[([^[\]|]+)\|([^[\]|]+)\]/g, (m, k, r) => r);
  const left = [...flat].filter(isKanji);
  if (left.length) {
    errors.push(`${bank} ${w.id} ${w.word} 例句有 ${left.length} 个汉字没注音：${left.join('')}\n      ${w.example.ruby}`);
  }
}

// ---- 3. jp 与 ruby 表记不一致（提示，不算错）----
for (const [bank, w] of withEx) {
  const surface = w.example.ruby.replace(/\[([^[\]|]+)\|([^[\]|]+)\]/g, (m, k, r) => k);
  if (surface !== (w.example.jp || '')) {
    warns.push(`${bank} ${w.id} ${w.word} jp 与 ruby 表记不同（多音词故意写假名属正常）\n      jp   ${w.example.jp}\n      ruby ${surface}`);
  }
}

// ---- 4. 简体中文专用字形 ----
const SIMPLIFIED = new Set([...'后愿说语车电见长门间样动实发无为经东买卖鸟风飞开关听员题颜质轻转历协单团图场变层热时计认识话试该费资责惯纸级纪绿终织统绝结觉规视览证评译谁读优价剧办队阶际难响园圆处备头奖妇孙专导尘岁币师馆验鸡鸣丽龄务势华卫压厅县']);
for (const [bank, w] of withEx) {
  const text = (w.example.jp || '') + (w.example.ruby || '');
  const bad = [...new Set([...text].filter((c) => isKanji(c) && SIMPLIFIED.has(c)))];
  if (bad.length) {
    errors.push(`${bank} ${w.id} ${w.word} 例句含简体中文专用字形：${bad.join(' ')}\n      ${w.example.jp}`);
  }
}

// ---- 5. kana 字段混入杂字符 ----
for (const [bank, w] of all) {
  if (/[A-Za-z♪♫♬]/.test(w.kana || '')) {
    errors.push(`${bank} ${w.id} kana 含拉丁字母/杂符号：${w.word} → ${w.kana}`);
  }
}

console.log(`词库：N3 ${n3.length} 词 / N2 ${n2.length} 词，带例句 ${withEx.length} 条\n`);

if (warns.length) {
  console.log(`提示 ${warns.length} 条（jp 与 ruby 表记不同）`);
  warns.slice(0, 20).forEach((t) => console.log('  · ' + t));
  if (warns.length > 20) console.log(`  …另有 ${warns.length - 20} 条`);
  console.log('');
}

if (errors.length) {
  console.log(`❌ ${errors.length} 处问题：`);
  errors.forEach((t) => console.log('  · ' + t));
  process.exit(1);
}
console.log('✅ 例句读音、汉字覆盖、字形、kana 字段全部通过');
