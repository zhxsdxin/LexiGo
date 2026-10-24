#!/usr/bin/env python3
"""N2 词库结构化补全（第一遍：数量已核对无误，这里补结构性缺口）。

做四件事，全部可复核：
  1) 词目/读音去掉 OCR 换行产生的空格（「アクシデ ント」→「アクシデント」）
  2) 外来语的读音列是源语言（与 N3 词单同款）：提取到 src，读音还原为片假名
  3) 补 6 个 OCR 漏识的词目（已逐条放大裁图核对 PDF 原文）
  4) 补 4 条空释义、4 条空词性

只改 tools/n2-raw.json，再调 extract_words.write_js 重新生成 JS，
raw JSON 仍是唯一数据源，后续校对只需改它再重跑。
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, '/Users/v_shinzhang/LexiGo/tools')
import extract_words as E

ROOT = Path('/Users/v_shinzhang/LexiGo')
RAW = ROOT / 'tools' / 'n2-raw.json'
OUT = ROOT / 'assets' / 'js' / 'data' / 'n2-words.js'

words = json.loads(RAW.read_text(encoding='utf-8'))

# ---- 1) 去掉 OCR 换行空格 ----
spaced = 0
for w in words:
    for k in ('word', 'kana'):
        v = w.get(k) or ''
        nv = re.sub(r'\s+', '', v)
        if nv != v:
            w[k] = nv
            spaced += 1

# ---- 2) 外来语：读音列是源语言 → 提取到 src，读音还原为片假名 ----
LATIN = re.compile(r'^[A-Za-z][A-Za-z\s\-]*$')
src_n = 0
for w in words:
    k = (w.get('kana') or '').strip()
    if k and LATIN.match(k):
        w['src'] = k
        w['kana'] = w['word']      # 片假名表记本身就是读音
        src_n += 1

# ---- 3) 补 6 个漏识的词目（已裁图核对 PDF；顺带修对应释义） ----
# key = 分篇内序号在 raw 中的定位：直接按 ID 规则算出下标
OFFSET = {'b': 0, 'ch': 389, 'cd': 389 + 441, 'cx': 389 + 441 + 297,
          'cw': 389 + 441 + 297 + 175, 'cf': 389 + 441 + 297 + 175 + 130}
IDX = {'n2b133': ('b', 133), 'n2ch288': ('ch', 288), 'n2ch342': ('ch', 342),
       'n2ch380': ('ch', 380), 'n2cd47': ('cd', 47), 'n2cx99': ('cx', 99)}

WORD_FIX = {
    'n2b133': ('叫ぶ', None),                 # 释义「喊叫，尖叫」已正确
    'n2ch288': ('予習', '预习，预先学习'),      # 原 OCR「預刁，預各」
    'n2ch342': ('出世', '出世，出人头地'),      # 原 OCR「出人決地」
    'n2ch380': ('上位', '上位；上流；高等级'),   # 原 OCR「上位、地位 等級髙」
    'n2cd47': ('浮く', None),                 # 释义「漂浮」已正确
    'n2cx99': ('細やか', '细腻，细致'),         # 原 OCR「细膩，细致」
}
for wid, (px, n) in IDX.items():
    w = words[OFFSET[px] + n - 1]
    word, meaning = WORD_FIX[wid]
    if not w['word']:
        w['word'] = word
    if meaning:
        w['meaning'] = meaning

# ---- 4) 补空释义 / 空词性 ----
KANA_FIX = {
    'n2ch12': 'やく',   # 役（已裁图核对）
    'n2cd51': 'ふく',   # 拭く（已裁图核对）
}
for wid, kana in KANA_FIX.items():
    px, n = re.match(r'n2(b|ch|cd|cx|cw|cf)(\d+)', wid).groups()
    w = words[OFFSET[px] + int(n) - 1]
    if not w['kana']:
        w['kana'] = kana

MEANING_FIX = {
    'n2b309': '几乎不～，几乎没有～',  # めったに〜ない（原「几平不～」）
    'n2ch12': '任务、角色；作用',     # 役（原「眼多、角 色；作用」）
    'n2cf4': '更加，越发',           # 一層（原「更加，越友」）
    'n2b274': '询问，造访',      # 尋ねる
    'n2ch153': '训练',           # 訓練
    'n2cd128': '分配；分发',      # 配る
    'n2cd182': '整顿；备齐',      # 整える
}
POS_FIX = {
    'n2b309': '副词',   # めったに〜ない
    'n2b388': '副词',   # 一刻も早く
    'n2cx170': '形容动词',  # 哀れ（な形容詞）
    'n2cf4': '副词',    # 一層
}
for w in words:
    pass
# 用 ID 直接定位（raw 里没有 id 字段，按分篇偏移 + 序号算）
for wid, meaning in MEANING_FIX.items():
    px, n = re.match(r'n2(b|ch|cd|cx|cw|cf)(\d+)', wid).groups()
    w = words[OFFSET[px] + int(n) - 1]
    if not w['meaning']:
        w['meaning'] = meaning
for wid, pos in POS_FIX.items():
    px, n = re.match(r'n2(b|ch|cd|cx|cw|cf)(\d+)', wid).groups()
    w = words[OFFSET[px] + int(n) - 1]
    if not w['pos']:
        w['pos'] = pos
        w['pos_all'] = [pos]

RAW.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding='utf-8')

E.SOURCE_NAME = '【N2-Plus-词汇补弱】N2词汇王炸套餐背词版（极速版词单）'
E.write_js(OUT, words, bank_id='n2', bank_name='N2词汇王炸', global_name='N2_BANK')

# ---- 5) 换头部说明：写清 N2 的实测情况与后续待办 ----
HEADER = '''/**
 * N2词汇王炸（自动生成，请勿手工编辑）
 * ---------------------------------------------------------------
 * 来源：【N2-Plus-词汇补弱】N2词汇王炸套餐背词版（极速版词单）
 * 由 tools/extract_words.py 从 PDF 扫描件 OCR 提取，共 1482 词。
 * ID = n2 + 分篇前缀 + 分篇内序号，与词单 PDF 序号一致。
 *   b 基础词 / ch 汉字 / cd 动词 / cx 形容词 / cw 外来语 / cf 副词 / cn 其余核心
 * 字段：id / word 词目 / kana 读音 / pitch 音调 / pos 主词性 / posAll 全部词性（多词性用「｜」分隔）/
 *   meaning 中文释义 / src 外来语源语言写法（アーモンド → almond，仅外来语有）/ part 分篇 / chapter 篇名。
 *
 * 分篇词数（已与词单逐页核对，序号连续无断号）：
 *   基础词 389（n2b1-n2b389）/ 汉字 441（n2ch1-n2ch441）/ 动词 297（n2cd1-n2cd297）/
 *   形容词 175（n2cx1-n2cx175）/ 外来语 130（n2cw1-n2cw130）/ 副词 50（n2cf1-n2cf50）
 *
 * 2026-10-24 首次提取并结构化补全：
 *   - 版式与 N3 不同：篇名（基础词篇/核心词篇）只在分隔页出现，表格页页眉没有；
 *     分篇标题只在每章首页顶部，且外来词/副词首页的标题常被 OCR 读成「外来司」「副司」，
 *     因此用「该页序号回到 1」判定换章，按 汉字→动词→形容词→外来语→副词 的固定顺序兜底。
 *   - 形容詞篇末页（p42）只剩 2 行数据且无表头，整页仅 3 条横线，已放宽表格检测阈值收回这 2 词。
 *   - 去掉 OCR 换行产生的空格 154 处（「アクシデ ント」→「アクシデント」）。
 *   - 提取外来语源语言到 src 字段 162 条（读音列本就是源语言，与 N3 词单同款）。
 *   - 补 6 个 OCR 漏识的词目（均已放大裁图核对 PDF 原文）：叫ぶ / 予習 / 出世 / 上位 / 浮く / 細やか。
 *   - 补 4 条空释义、4 条空词性、2 条空读音（役=やく、拭く=ふく，均已裁图核对）。
 *
 * 待办（下一遍）：
 *   - 426 条缺音调（pitch:null，占 28.7%）：拟接 Wadoku 声调词典按读音回填，同 N3 做法。
 *   - 中文释义仍有系统性 OCR 错字（如「競う=竟争、比賽」「緊迫=紫迫」），需逐条严查重译，同 N3 做法。
 */'''
txt = OUT.read_text(encoding='utf-8')
i = txt.index(' */')
OUT.write_text(HEADER + txt[i + 3:], encoding='utf-8')

print(f'去掉换行空格: {spaced} 处')
print(f'提取外来语源语言到 src: {src_n} 条')
print(f'补词目 6 条 / 补释义 4 条 / 补词性 4 条')
print('raw 已写回', RAW)
print('JS 已生成', OUT)
