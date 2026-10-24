#!/usr/bin/env python3
"""
从 N3 词汇 PDF 词单中提取单词数据。

PDF 是纯图片扫描件（无文字层），流程：
  1. PyMuPDF 渲染每页为 PNG
  2. 从位图找出表格横线/竖线，还原单元格网格
  3. 按单元格裁成小图，逐格送 macOS Vision 做日文 OCR
  4. 组装 {序号, 单词, 读音, 声调, 词性, 释义}
  5. 按每页篇名归入子集（基础词篇 / 核心词篇·汉字·动词·…）

用法：
  python3 tools/extract_words.py --pdf <词单.pdf> --out assets/js/data/n3-words.js
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
from pitch_match import build_templates, classify_pitch

# ---- 表格线检测参数 ----
DARK = 165
ROW_COVER = 0.45      # 横线需横跨页面该比例宽度
COL_COVER = 0.30      # 竖线候选需纵跨页面该比例高度
LINE_MAX = 8          # 线厚超过此值视为内容而非线
# 分隔线强度阈值。
#
# 关键：强度必须相对「表格的纵向范围」计算，而不是整页。
# 表格占满整页时（如 49 行的页面），实线整页强度约 0.93；
# 但短表格（如只有 22 行、只占页高 42% 的页面）整页强度会被稀释到 0.42，
# 用整页阈值会把这种页面误判成「非词表页」而整页漏掉。
# 换成表内强度后，两种页面都是 1.00，而文字笔画只有 0.33 左右。
LINE_STRENGTH = 0.75

ER = 0.45      # 横线需横跨页面该比例宽度
COL_COVER = 0.30      # 竖线候选需纵跨该比例高度
LINE_MAX = 8          # 线厚超过此值视为内容而非线
LINE_STRENGTH = 0.75  # 分隔线贯穿整列，暗像素占比阈值（实测 0.93，文字笔画约 0.32）

# OCR 会把表头「单词/读音/词性/释义/序号/声调」误识成这些形近字，出现即视为表头行
HEADER_NOISE = {
    '单词', '单司', '単司', '读音', '速音', '瑛音', '词性', '司性',
    '释义', '释乂', '釋乂', '序号', '声调', '声週', '序号',
}

# 词单来源，写进生成文件的注释里
SOURCE_NAME = '【N2-Plus-词汇补弱】N3词汇王炸套餐背词版（极速版词单）'

# ---- 词性 ----
# 词单原文用的是「名 / 形 / 副 / 動1 / 自他動1 / サ変」这类简写。
# OCR 会把其中的汉字认成形近字：
#   動 → 劫 / 劯 / 功 / 効
#   サ変 → 砂3 / あ3 / 砂
#   達体詞 → 達体司 / 迕体
# 因此先做字符级纠错，再归一化成中文词性。

# OCR 误识字 → 正确字
_POS_FIX = {
    '劫': '動', '劯': '動', '功': '動', '効': '動', '劝': '動', '勃': '動',
    '砂': 'サ', 'あ': 'サ', '迕': '達', '初': '動', '砌': '動',
    '司': '詞', '語': '詞',
}

# 動 字整体漏识时只剩「自1」「他2」这类残码，按动词前缀兜底
_POS_PREFIX = ('自', '他', '自動', '他動', '自他')

# 归一化后的展示词性
POS_MAP = {
    '名': '名词',
    '形': '形容词',
    '副': '副词',
    '形動': '形容动词',
    '接': '连接词',
    '連': '连接词',
    '感': '感叹词',
}


def _fix_pos_text(raw: str) -> str:
    """修正 OCR 把词性代码里的汉字认错的问题"""
    if not raw:
        return raw
    out = raw
    for bad, good in _POS_FIX.items():
        out = out.replace(bad, good)
    return out


def normalize_pos(raw: str) -> tuple[str, list[str]]:
    """词性代码 → (主类, 全部类别)。

    '他動1'      → ('动词', ['动词'])
    '名・形'      → ('名词', ['名词', '形容词'])
    '名・サ変'    → ('名词', ['名词', '形容动词'])
    """
    if not raw:
        return '', []
    text = _fix_pos_text(raw)
    # サ変 / な形容 先整体记下来，避免逐字拆解。
    # OCR 常把 サ変 读成「砂3」「あ3」，这里补齐带尾号的变体。
    text = re.sub(r'(砂|あ|サ)\s*[3３]', 'サ変', text)
    text = text.replace('サ変', 'な形容')
    text = text.replace('達体詞', 'な形容')

    parts = [p for p in re.split(r'[・,，/\s]+', text) if p]
    cats = []
    for p in parts:
        if p == 'な形容':
            cats.append('形容动词')
        elif '動' in p:
            # 自 / 他 / 自他 是动词的语态前缀，1/2/3 是段数，都归为「动词」
            cats.append('动词')
        elif re.fullmatch(r'[自他]\d?', p):
            # OCR 把「動」整个漏掉，只剩「自1」「他2」这类残码
            cats.append('动词')
        elif p.startswith('自') or p.startswith('他'):
            # 「自動1 / 他動1 / 自他動」被 OCR 读成「自云 / 他方 / 自代」等变体，
            # 只要以自/他 开头就是动词的语态标记
            cats.append('动词')
        elif p in POS_MAP:
            cats.append(POS_MAP[p])
        elif p.startswith('形'):
            cats.append('形容词')
        elif p.startswith('副'):
            cats.append('副词')
        elif p.startswith('名'):
            cats.append('名词')
        else:
            cats.append(p)

    seen = set()
    uniq = []
    for c in cats:
        if c not in seen:
            seen.add(c)
            uniq.append(c)

    # 主类按「动词 → 形容词 → 副词 → 名词」的优先级取
    main = ''
    for pref in ('动词', '形容词', '形容动词', '副词', '名词'):
        if pref in uniq:
            main = pref
            break
    if not main:
        main = uniq[0] if uniq else ''
    return main, uniq


def guess_pos(word: str, kana: str) -> tuple[str, list[str]]:
    """词性整列缺失时，按表记与读音形态粗判。

    纯词单里几乎不出现整列缺失，这里只是保险：
    片假名结尾 → 动词；な/に/で结尾且含汉字 → 形容动词；其余留空。
    """
    if kana and re.fullmatch(r'[\u30a1-\u30f6ー\-\s]+', kana):
        return '动词', ['动词']
    return '', []


def normalize_pitch(raw: str) -> int | None:
    """OCR 出的声调值归一化成 0-N。

    带圈数字常被识别成 'o'（⓪）、'1'（①）或裸数字，这里统一还原。
    长词的音调可以到 ⑤ 甚至更高，因此带圈数字按 Unicode 区段通用解码，
    而不是只列 ⓪-④。
    """
    if not raw:
        return None
    t = raw.strip()
    # 通用带圈数字解码：⓪/①-⑳/㉑-㉟/㊱-㊿
    if len(t) == 1:
        c = ord(t)
        if c == 0x24EA:            # ⓪
            return 0
        if 0x2460 <= c <= 0x2473:  # ① - ⑳
            return c - 0x2460 + 1
        if 0x3251 <= c <= 0x325F:  # ㉑ - ㉟
            return c - 0x3251 + 21
        if 0x32B1 <= c <= 0x32BF:  # ㊱ - ㊿
            return c - 0x32B1 + 36
    # 纯 ASCII 数字
    if re.fullmatch(r'\d+', t):
        return int(t)
    # OCR 常见误识
    low = t.lower()
    if low in ('o', '0', '○', '〇'):
        return 0
    if low in ('1', 'l', 'i', '|'):
        return 1
    if low in ('2', 'z'):
        return 2
    if low in ('3',):
        return 3
    if low in ('4', 'a'):
        return 4
    if low in ('5', 's'):
        return 5
    if low in ('6', 'b'):
        return 6
    if low in ('7', 't'):
        return 7
    if low in ('8', 'e'):
        return 8
    if low in ('9', 'g'):
        return 9
    return None



def to_simplified(t: str) -> str:
    """繁 → 简。

    OCR 识别日文汉字时容易混入繁体字形（如「意味」→「意味」正常，
    但「東西」可能读成「東西」的繁体「東西」）。这里做常用字替换。
    表是「繁:简」单字对照，遍历替换避免多字键报错。
    """
    if not t:
        return t
    for trad, simp in _T2S.items():
        if trad in t:
            t = t.replace(trad, simp)
    return t


# 常用繁体 → 简体（只收词单里可能出现的字）
_T2S = {
    '號': '号',
    '圖': '图',
    '國': '国',
    '會': '会',
    '說': '说',
    '來': '来',
    '個': '个',
    '們': '们',
    '時': '时',
    '對': '对',
    '還': '还',
    '沒': '没',
    '後': '后',
    '點': '点',
    '過': '过',
    '進': '进',
    '遠': '远',
    '這': '这',
    '樣': '样',
    '萬': '万',
    '與': '与',
    '業': '业',
    '東': '东',
    '車': '车',
    '門': '门',
    '問': '问',
    '間': '间',
    '聞': '闻',
    '開': '开',
    '關': '关',
    '長': '长',
    '馬': '马',
    '鳥': '鸟',
    '魚': '鱼',
    '龍': '龙',
    '風': '风',
    '飛': '飞',
    '飯': '饭',
    '館': '馆',
    '廣': '广',
    '電': '电',
    '氣': '气',
    '價': '价',
    '實': '实',
    '寫': '写',
    '讀': '读',
    '學': '学',
    '習': '习',
    '買': '买',
    '賣': '卖',
    '錢': '钱',
    '銀': '银',
    '鐵': '铁',
    '體': '体',
    '頭': '头',
    '顏': '颜',
    '愛': '爱',
    '樂': '乐',
    '藥': '药',
    '應': '应',
    '該': '该',
    '難': '难',
    '離': '离',
    '場': '场',
    '報': '报',
    '發': '发',
    '轉': '转',
    '較': '较',
    '農': '农',
    '運': '运',
    '選': '选',
    '適': '适',
    '鄉': '乡',
    '醫': '医',
    '釋': '释',
    '針': '针',
    '鋼': '钢',
    '錄': '录',
    '錯': '错',
    '鍵': '键',
    '鎮': '镇',
    '鏡': '镜',
    '鐘': '钟',
    '陣': '阵',
    '隨': '随',
    '雜': '杂',
    '雙': '双',
    '雞': '鸡',
    '靈': '灵',
    '靜': '静',
    '願': '愿',
    '驗': '验',
    '驚': '惊',
    '鬥': '斗',
    '魯': '鲁',
    '鮮': '鲜',
    '麗': '丽',
    '麥': '麦',
    '黃': '黄',
    '黨': '党',
    '齊': '齐',
    '齡': '龄',
    '總': '总',
    '續': '续',
    '纖': '纤',
    '網': '网',
    '線': '线',
    '細': '细',
    '給': '给',
    '結': '结',
    '經': '经',
    '統': '统',
    '絕': '绝',
    '綠': '绿',
    '維': '维',
    '綜': '综',
    '緊': '紧',
    '緣': '缘',
    '編': '编',
    '緩': '缓',
    '締': '缔',
    '練': '练',
    '縣': '县',
    '縮': '缩',
    '績': '绩',
    '繁': '繁',
    '纏': '缠',
    '罰': '罚',
    '義': '义',
    '職': '职',
    '聯': '联',
    '聰': '聪',
    '肅': '肃',
    '脅': '胁',
    '脈': '脉',
    '腦': '脑',
    '臉': '脸',
    '臨': '临',
    '舉': '举',
    '舊': '旧',
    '艙': '舱',
    '藝': '艺',
    '蘭': '兰',
    '處': '处',
    '衆': '众',
    '術': '术',
    '衛': '卫',
    '衝': '冲',
    '裝': '装',
    '複': '复',
    '見': '见',
    '規': '规',
    '視': '视',
    '親': '亲',
    '覺': '觉',
    '觀': '观',
    '計': '计',
    '訂': '订',
    '認': '认',
    '討': '讨',
    '訓': '训',
    '託': '托',
    '記': '记',
    '訪': '访',
    '設': '设',
    '許': '许',
    '診': '诊',
    '註': '注',
    '証': '证',
    '評': '评',
    '詞': '词',
    '試': '试',
    '話': '话',
    '詳': '详',
    '誌': '志',
    '課': '课',
    '調': '调',
    '談': '谈',
    '請': '请',
    '論': '论',
    '諸': '诸',
    '謀': '谋',
    '謝': '谢',
    '識': '识',
    '警': '警',
    '議': '议',
    '護': '护',
    '變': '变',
    '讓': '让',
    '豐': '丰',
    '財': '财',
    '責': '责',
    '貧': '贫',
    '貨': '货',
    '販': '贩',
    '貪': '贪',
    '貴': '贵',
    '貸': '贷',
    '費': '费',
    '賀': '贺',
    '賃': '赁',
    '賄': '贿',
    '資': '资',
    '賓': '宾',
    '賜': '赐',
    '賞': '赏',
    '賠': '赔',
    '賢': '贤',
    '質': '质',
    '購': '购',
    '贈': '赠',
    '贏': '赢',
    '走': '走',
    '起': '起'
}


def render_pages(pdf: Path, out_dir: Path, dpi: int) -> list[Path]:
    """把 PDF 每页渲染成 PNG"""
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf)
    paths = []
    for i in range(doc.page_count):
        f = out_dir / f'p{i + 1:02d}.png'
        if not f.exists():
            doc[i].get_pixmap(dpi=dpi).save(f)
        paths.append(f)
    doc.close()
    return paths


def _runs(vals, maxlen: int) -> list[int]:
    """把连续索引合并成段，返回每段均值。用于定位线条。"""
    groups: list[list[int]] = []
    for v in vals:
        if groups and v - groups[-1][-1] <= 2:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [int(np.mean(g)) for g in groups if len(g) <= maxlen]


def _to_gray(png: Path) -> np.ndarray:
    src = pymupdf.Pixmap(str(png))
    a = np.frombuffer(src.samples, dtype=np.uint8).reshape(src.height, src.width, src.n)
    if a.shape[2] == 1:
        return a[:, :, 0]
    return a[:, :, :3].mean(axis=2)


def find_table(png: Path):
    """还原表格网格。返回 (rows, col_edges)；非表格页返回 None。

    col_edges 是 7 个列边界的像素 x。
    """
    gray = _to_gray(png)
    H, W = gray.shape
    dark = gray < DARK

    rows = _runs([y for y in range(H) if dark[y].sum() > W * ROW_COVER], LINE_MAX)
    # 至少 3 条横线（2 个行带）。
    # N2 的分篇末页可能只剩 2 行数据且不带表头（实测 p42 形容詞篇末页），
    # 整页只有 3 条横线，用 <4 会把这两行整页丢掉。
    if len(rows) < 3:
        return None

    # 竖线强度相对表格纵向范围计算，短表格也能正确识别
    top, bottom = rows[0], rows[-1]
    span = max(1, bottom - top + 1)

    cand = _runs([x for x in range(W) if dark[top:bottom + 1, x].sum() > span * COL_COVER],
                 LINE_MAX)
    strong = [x for x in cand if dark[top:bottom + 1, x].mean() >= LINE_STRENGTH]
    cols: list[int] = []
    for x in strong:
        if not cols or x - cols[-1] > 8:
            cols.append(x)

    if len(cols) < 7:
        return None
    return rows, cols[:7]


def _trim_to_ink(gray: np.ndarray, pad: int = 6) -> np.ndarray:
    """把单元格裁到墨迹边界，并留少量余量。

    表格边框线会严重干扰 OCR：实测带边框的单字裁剪图识别结果为空，
    去掉边框并聚焦到墨迹后同一个字就能正常读出（豆、草 等）。
    """
    dark = gray < DARK
    ys, xs = np.where(dark)
    if len(ys) == 0:
        return gray
    H, W = gray.shape
    y0 = max(0, ys.min() - pad)
    y1 = min(H, ys.max() + pad + 1)
    x0 = max(0, xs.min() - pad)
    x1 = min(W, xs.max() + pad + 1)
    if y1 <= y0 or x1 <= x0:
        return gray
    return gray[y0:y1, x0:x1]


def crop_cells(png: Path, rows: list[int], cols: list[int], work: Path, tag: int):
    """按网格把每个单元格裁成独立小图，放大后返回 [(路径, (行,列))]"""
    work.mkdir(parents=True, exist_ok=True)
    gray = _to_gray(png)
    H, W = gray.shape

    out = []
    n = 0
    for ri in range(len(rows) - 1):
        y0, y1 = rows[ri] + 2, rows[ri + 1] - 2
        if y1 - y0 < 12 or y1 > H:
            continue
        for ci in range(6):
            # 只取单元格内部，排除左右表格边框线。
            # 边框是贯穿整格的竖线，Vision 会把它当内容，导致单字识别为空。
            x0, x1 = cols[ci] + 3, cols[ci + 1] - 3
            if x1 <= x0 or x1 > W:
                continue
            sub = _trim_to_ink(gray[y0:y1, x0:x1])
            if sub.size == 0:
                continue
            # 放大 3 倍：声调是空心圈，笔画细，小图下容易丢失
            sub = np.repeat(np.repeat(sub, 3, axis=0), 3, axis=1)
            h, w = sub.shape
            dst = work / f'c{tag:03d}_{n:04d}.png'
            # 灰度 → RGB：先构造连续缓冲再拷贝
            rgb = np.empty((h, w, 3), dtype=np.uint8)
            rgb[:, :, 0] = sub
            rgb[:, :, 1] = sub
            rgb[:, :, 2] = sub
            pm = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False)
            pm.samples_mv[:] = rgb.tobytes()
            pm.save(dst)
            out.append((dst, (ri, ci)))
            n += 1
    return out


def ocr_batch(images) -> dict[tuple[int, int], str]:
    """把裁好的单元格图交给 Vision 批量识别。

    Swift 端每张图输出一行，识别失败也会输出空行，
    因此必须按行号对齐，不能按非空行对齐，否则会整体错位。
    """
    if not images:
        return {}

    binary = Path(tempfile.gettempdir()) / 'lexigo_vocr'
    src = Path(__file__).parent / 'vision_ocr_cells.swift'
    if not binary.exists() or binary.stat().st_mtime < src.stat().st_mtime:
        build = subprocess.run(['swiftc', '-O', str(src), '-o', str(binary)],
                               capture_output=True, text=True)
        if build.returncode != 0:
            print('OCR 编译失败:', build.stderr[-300:], file=sys.stderr)
            return {}
    cmd = [str(binary)]

    paths = [str(p) for p, _ in images]
    keys = [k for _, k in images]

    BATCH = 150
    result: dict[tuple[int, int], str] = {}
    for start in range(0, len(paths), BATCH):
        proc = subprocess.run(cmd + paths[start:start + BATCH],
                              capture_output=True, text=True, timeout=1800)
        if proc.returncode != 0:
            print('OCR 出错:', proc.stderr[-400:], file=sys.stderr)
            continue
        lines = proc.stdout.split('\n')
        while lines and lines[-1] == '':
            lines.pop()
        for key, line in zip(keys[start:start + BATCH], lines):
            txt = line.strip()
            if txt:
                result[key] = txt
    return result


def ocr_header(page_png: Path, work: Path, tag: int):
    """OCR 页面顶部区域，取出篇名与分篇标题。

    版式固定：左上角是「基础词篇 / 核心词篇」，其下方居中是红色大字分篇名
    （汉字 / 动词 / 形容词 / 外来词 / 副词 …）。
    """
    work.mkdir(parents=True, exist_ok=True)
    src = pymupdf.Pixmap(str(page_png))
    arr = np.frombuffer(src.samples, dtype=np.uint8).reshape(src.height, src.width, src.n)
    if arr.shape[2] == 1:
        arr = np.repeat(arr, 3, axis=2)
    else:
        arr = np.ascontiguousarray(arr[:, :, :3])
    H, W = arr.shape[:2]

    # 顶部 12% 区域，横向切成 3 块分别识别，避开表格线
    top = arr[0:int(H * 0.12), :]
    third = W // 3
    crops = [top[:, 0:third], top[:, third:2 * third], top[:, 2 * third:]]
    paths = []
    for i, c in enumerate(crops):
        c = np.repeat(np.repeat(c, 2, axis=0), 2, axis=1)
        dst = work / f'h{tag:03d}_{i}.png'
        pm = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, c.shape[1], c.shape[0]), False)
        pm.samples_mv[:] = c.tobytes()
        pm.save(dst)
        paths.append(dst)

    texts = []
    for dst in paths:
        proc = subprocess.run(
            [str(Path(tempfile.gettempdir()) / 'lexigo_vocr'), str(dst)],
            capture_output=True, text=True, timeout=120)
        if proc.returncode == 0:
            texts.append(proc.stdout.strip())
    return texts


def ocr_whole_page(page_png: Path, work: Path, tag: int) -> str:
    """整页 OCR，用于识别非词表页（封面 / 分篇分隔页）上的篇名。

    N2 的「基础词篇 / 核心词篇」只出现在分隔页，表格页页眉里没有，
    靠这个才能知道后面的表格属于哪一篇。
    """
    work.mkdir(parents=True, exist_ok=True)
    src = pymupdf.Pixmap(str(page_png))
    arr = np.frombuffer(src.samples, dtype=np.uint8).reshape(src.height, src.width, src.n)
    if arr.shape[2] == 1:
        arr = np.repeat(arr, 3, axis=2)
    else:
        arr = np.ascontiguousarray(arr[:, :, :3])
    dst = work / f'd{tag:03d}.png'
    pm = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, arr.shape[1], arr.shape[0]), False)
    pm.samples_mv[:] = arr.tobytes()
    pm.save(dst)
    proc = subprocess.run(
        [str(Path(tempfile.gettempdir()) / 'lexigo_vocr'), str(dst)],
        capture_output=True, text=True, timeout=300)
    return proc.stdout.strip() if proc.returncode == 0 else ''


# 篇名关键词 → 归属。
# OCR 会把「基础词篇/核心词篇」认成「基砧河篇/核心河篇」等形近字，
# 因此把实际出现过的变体一并列出。
PART_PATTERNS = [
    ('基础', 'basic'), ('基礎', 'basic'), ('基砧', 'basic'), ('基柮', 'basic'),
    ('基砒', 'basic'), ('基杢', 'basic'),
    ('核心', 'core'), ('核心词篇', 'core'), ('核心詞篇', 'core'),
    ('核心河篇', 'core'), ('核心河篅', 'core'), ('核心洞篇', 'core'),
]

# 分篇标题关键词 → 子集。标题是红色大字，同样会被认成形近字。
CHAPTER_PATTERNS = [
    # 汉字
    ('汉字', '汉字'), ('漢字', '汉字'), ('汊字', '汉字'), '汉字',
    # 动词
    ('动词', '动词'), ('動詞', '动词'), ('劫词', '动词'), ('劫司', '动词'),
    # 形容词
    ('形容词', '形容词'), ('形容詞', '形容词'), ('形容司', '形容词'), ('形容凋', '形容词'),
    # 外来语
    ('外来词', '外来语'), ('外來語', '外来语'), ('外来語', '外来语'),
    ('外来洞', '外来语'), ('外来语', '外来语'),
    # 副词
    ('副词', '副词'), ('副詞', '副词'), ('副洞', '副词'), ('副司', '副词'),
    # 外来词（N2 首页标题常被读成「外来司」）
    ('外来司', '外来语'), ('外來司', '外来语'),
    # 动词（N2 首页标题常被读成「効河」）
    ('効河', '动词'), ('効詞', '动词'),
]


def classify_section(header_texts) -> tuple[str, str]:
    """从页面顶部文字判断 (篇, 分篇)。篇没识别出来时沿用上一页。"""
    joined = to_simplified(' '.join(t for t in header_texts if t))
    part = ''
    for kw, val in PART_PATTERNS:
        if kw in joined:
            part = val
            break
    chapter = ''
    for kw, val in CHAPTER_PATTERNS:
        if kw in joined:
            chapter = val
            break
    return part, chapter


def page_starts_chapter(byrow: dict, skip_rows: set) -> bool:
    """该页首个数据行的序号是否为 1（即新分篇的第一页）。

    用于分篇名漏识别时的兜底：N2 的外来词/副词首页，红色标题常被 OCR
    读成「外来司」「副司」这类认不出的变体，但序号一定从 1 重新起算。
    序号列本身不可信（会漏读误读），只用来判定「是否换章」这一个布尔量。
    """
    for ri in sorted(byrow):
        if ri == 0 or ri in skip_rows:
            continue
        cell = (byrow[ri].get(0) or '').strip()
        return cell.isdigit() and int(cell) == 1
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--dpi', type=int, default=200)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--dump', default='')
    # 词库身份：同一套脚本可复用提取 N3 / N2 等多套词单
    ap.add_argument('--bank-id', default='n3')
    ap.add_argument('--bank-name', default='')
    ap.add_argument('--global', dest='global_name', default='')
    ap.add_argument('--source', default='')
    # 分篇固定顺序（逗号分隔）。提供后启用「序号回到 1 即换章」的兜底，
    # 用于分篇标题 OCR 认不出的版式（N2 的外来词/副词首页）。不传则保持 N3 行为。
    ap.add_argument('--chapter-order', default='')
    args = ap.parse_args()

    bank_id = args.bank_id
    bank_name = args.bank_name or f'{bank_id.upper()} 词库'
    global_name = args.global_name or f'{bank_id.upper()}_BANK'
    chapter_order = [c.strip() for c in args.chapter_order.split(',') if c.strip()]
    if args.source:
        global SOURCE_NAME
        SOURCE_NAME = args.source

    pdf = Path(args.pdf)
    if not pdf.exists():
        print(f'找不到文件: {pdf}', file=sys.stderr)
        return 1

    tmp = Path(tempfile.mkdtemp(prefix='n3ocr'))
    pages = render_pages(pdf, tmp / 'pages', args.dpi)
    if args.limit:
        pages = pages[:args.limit]

    all_words = []
    # 每个分篇各用一个计数器，按「分篇内数据行位置」推进。
    # 不采信 OCR 的序号列——那一列经常漏识或误读（「味」的 1 读不出来、
    # 「辺り」的 6 被读成 9），会造成缺号与重复。词单的序号就是分篇内连续行号，
    # 用行位置推进既准确又能保证 ID 连续。
    counters = {}      # (part, chapter) -> 下一个序号
    blanks = []# 单词列为空但保留了条目的行，便于人工补录
    cur_part = ''      # 基础词篇 / 核心词篇
    cur_chapter = ''   # 汉字 / 动词 / 形容词 / 外来语 / 副词 …
    core_idx = -1      # 当前分篇在固定顺序里的位置
    for idx, page in enumerate(pages):
        grid = find_table(page)
        if not grid:
            # 非词表页（封面 / 分篇分隔页）：整页 OCR 认篇名。
            # N2 的「基础词篇 / 核心词篇」只在分隔页出现，表格页页眉里没有。
            div = ocr_whole_page(page, tmp / 'div', idx)
            dp_, dc_ = classify_section([div])
            if dp_ and dp_ != cur_part:
                cur_part = dp_
                cur_chapter = ''
                core_idx = -1
            tag = f'  识别到篇名 {dp_}' if dp_ else ''
            print(f'p{idx + 1:02d}  跳过（非词表页）{tag}')
            continue
        rows, cols = grid

        # 页眉识别篇名。分篇标题只在该篇首页出现，之后沿用。
        hdr = ocr_header(page, tmp / 'hdr', idx)
        p_, c_ = classify_section(hdr)
        # 篇归属。
        # N3 每页页眉都带「基础词篇/核心词篇」；N2 的篇名只在分隔页出现，
        # 表格页页眉没有，只能由分篇名与先后顺序推断。
        if p_ and p_ != cur_part:
            cur_part = p_
            cur_chapter = ''
        elif not p_ and not cur_part:
            # 还没有归属：N2 的第一个表格页属于基础词篇
            cur_part = 'basic'

        cells = crop_cells(page, rows, cols, tmp / 'cells', idx)
        ocr = ocr_batch(cells)

        # 组装行
        byrow = {}
        for (ri, ci), txt in ocr.items():
            byrow.setdefault(ri, {})[ci] = txt

        # 表头与分篇标题行的识别
        #
        # 1) 表头行：单词 / 读音 / 词性 / 释义 四个列里有 ≥2 个命中 HEADER_NOISE。
        #    只用单列判定会误伤真实词条——实测 #388「単語」的释义列被 OCR 读成
        #    「単司」，与表头噪声撞车，单列匹配就会把这条真词丢掉。
        # 2) 分篇标题行（红色大字「形容词」「外来语」等）：紧挨在表头行上方，
        #    OCR 只能读出一两个残字，靠位置关系剔除。
        header_rows = set()
        for ri, cells_map in byrow.items():
            hits = sum(1 for col in (1, 2, 4, 5)
                       if cells_map.get(col, '') in HEADER_NOISE)
            if hits >= 2:
                header_rows.add(ri)
        # 标题行 = 表头行的前一行带
        skip_rows = set(header_rows) | {r - 1 for r in header_rows if r - 1 >= 0}

        # 分篇归属：识别到分篇名就用它；漏识别时（N2 外来词/副词首页的红色标题
        # 常被读成「外来司」「副司」）按「该页序号回到 1」判定换章，按固定顺序推进。
        # 只有已进入核心词篇才推进——基础词篇首页的序号同样是 1，不能触发换章。
        if c_:
            cur_chapter = c_
            if not p_:
                cur_part = 'core'
            if chapter_order and c_ in chapter_order:
                core_idx = chapter_order.index(c_)
        elif chapter_order and cur_part == 'core' and page_starts_chapter(byrow, skip_rows):
            if core_idx < 0:
                core_idx = 0              # 核心词篇的第一个分篇
            elif core_idx + 1 < len(chapter_order):
                core_idx += 1             # 后续分篇
            cur_chapter = chapter_order[core_idx]

        # 页面位图，供声调模板匹配使用
        src = pymupdf.Pixmap(str(page))
        parr = np.frombuffer(src.samples, dtype=np.uint8).reshape(
            src.height, src.width, src.n)
        if parr.shape[2] == 1:
            parr = np.repeat(parr, 3, axis=2)
        parr = np.ascontiguousarray(parr[:, :, :3])

        # 第一遍：靠 OCR 收集每种声调的清晰样本
        known = {}
        for ri, cells_map in byrow.items():
            if ri == 0:
                continue
            d = normalize_pitch(cells_map.get(3, ''))
            if d is not None and cells_map.get(0, '').isdigit():
                known.setdefault(d, []).append(ri)
        templates = build_templates(parr, rows, cols, known)

        # 第二遍：OCR 缺失的声调用模板匹配补齐
        filled = 0
        for ri, cells_map in byrow.items():
            if ri == 0 or cells_map.get(3):
                continue
            if not cells_map.get(0, '').isdigit():
                continue
            if not templates:
                break
            d = classify_pitch(parr, rows, cols, ri, templates)
            if d is not None:
                cells_map[3] = str(d)
                filled += 1

        # 组装词条
        #
        # 序号不采信 OCR 的序号列——那一列经常漏识或误读
        # （「味」的 1 读不出来、「辺り」的 6 被读成 9），
        # 会造成缺号与重复。词单的序号就是全书的连续行号，
        # 因此直接用「跨页累计的数据行序号」作为权威值，
        # OCR 出来的序号只作为 no_raw 留档供核对。
        words = []
        key = (cur_part, cur_chapter)
        no = counters.get(key, 1)

        for ri in sorted(byrow):
            if ri in skip_rows:
                continue
            cells_map = byrow[ri]
            idxs = cells_map.get(0, '')
            w = cells_map.get(1, '')
            kana = cells_map.get(2, '')
            pos_raw = cells_map.get(4, '')
            meaning = cells_map.get(5, '')

            # 整行都没内容才算空行；单词列单独为空（单字汉字常被漏识）
            # 仍然保留条目，保证词条总数与词单一致
            if not w and not kana and not meaning:
                continue

            no_raw = int(idxs) if idxs.isdigit() else None
            main_pos, all_pos = normalize_pos(pos_raw)
            if not main_pos:
                main_pos, all_pos = guess_pos(w, kana)

            entry = {
                'no': no,
                'no_raw': no_raw,
                'word': w.strip(),
                'kana': kana.strip(),
                'pitch': normalize_pitch(cells_map.get(3, '')),
                'pos': main_pos,
                'pos_all': all_pos,
                'pos_raw': pos_raw.strip(),
                'meaning': to_simplified(meaning.strip()),
                'part': cur_part,
                'chapter': cur_chapter,
                'page': idx + 1,
            }
            words.append(entry)
            no += 1
            if not w.strip():
                blanks.append((no, kana.strip()))

        counters[key] = no
        if words:
            all_words.extend(words)
            miss_pitch = sum(1 for x in words if x['pitch'] is None)
            no_word = sum(1 for x in words if not x['word'])
            tag = f'{cur_part}/{cur_chapter}' if cur_chapter else (cur_part or '?')
            print(f'p{idx + 1:02d}  {len(words):3d} 词  [{tag}]  '
                  f'声调补齐 {filled:2d}  仍缺 {miss_pitch:2d}  缺单词 {no_word:2d}  '
                  f'{words[0]["word"] or "?"} → {words[-1]["word"] or "?"}')

    print(f'\n合计 {len(all_words)} 词，'
          f'缺声调 {sum(1 for w in all_words if w["pitch"] is None)} 条，'
          f'缺单词 {sum(1 for w in all_words if not w["word"])} 条')
    if blanks:
        print('以下行保留了条目但单词列为空，需人工补录：')
        for n, kana in blanks[:20]:
            print(f'  #{n}  假名={kana or "(无)"}')
    if args.dump:
        Path(args.dump).write_text(
            json.dumps(all_words, ensure_ascii=False, indent=1), encoding='utf-8')
        print('原始数据已写入', args.dump)

    write_js(Path(args.out), all_words,
             bank_id=bank_id, bank_name=bank_name, global_name=global_name)
    return 0


def write_js(out_path: Path, words: list[dict],
             bank_id: str = 'n3', bank_name: str = 'N3 词库',
             global_name: str = 'N3_BANK'):
    """输出前端可直接 <script> 引入的数据文件。

    ID 规则：{bank_id} + 分篇前缀 + 该分篇内序号
        基础词     b      n3b1  – n3b…
        核心词·汉字   ch    n3ch1 – n3ch…
        核心词·动词   cd    n3cd1 – n3cd…
        核心词·形容词 cx    n3cx1 – n3cx…
        核心词·外来语 cw    n3cw1 – n3cw…
        核心词·副词   cf    n3cf1 – n3cf…
        核心词·其余   cn    n3cn1 – n3cn…
    序号与词单 PDF 里的序号一致（分篇内从 1 开始连续）。
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)

    def esc(v):
        return (str(v).replace('\\', '\\\\')
                .replace("'", "\\'").replace('\n', ' '))

    prefix = {
        ('basic', ''): 'b',
        ('core', '汉字'): 'ch',
        ('core', '动词'): 'cd',
        ('core', '形容词'): 'cx',
        ('core', '外来语'): 'cw',
        ('core', '副词'): 'cf',
        ('core', ''): 'cn',
    }

    counts = {}
    lines = [
        '/**',
        f' * {bank_name}（自动生成，请勿手工编辑）',
        ' ---------------------------------------------------------------',
        f' * 来源：{SOURCE_NAME}',
        f' * 由 tools/extract_words.py 从 PDF 扫描件 OCR 提取，共 {len(words)} 词。',
        f' * ID = {bank_id} + 分篇前缀 + 分篇内序号，与词单 PDF 序号一致。',
        f' *   b 基础词 / ch 汉字 / cd 动词 / cx 形容词 / cw 外来语 / cf 副词 / cn 其余核心',
        ' * 音调 0-N；null 表示该词在词单中未标声调。',
        ' */',
        "window.LexiGo = window.LexiGo || {};",
        f'window.LexiGo.{global_name} = {{ id: "{bank_id}", name: "{bank_name}", words: [',
    ]

    for i, w in enumerate(words):
        key = (w['part'], w['chapter'] or '')
        px = prefix.get(key, 'n')
        n = counts.get(key, 0) + 1
        counts[key] = n
        wid = f'{bank_id}{px}{n}'

        meaning = esc(w['meaning'].replace('，', ',').replace(';', '，')).replace(',', '，')
        pos = w['pos'] or ''
        pos_all = '|'.join(w.get('pos_all') or [])
        pitch = 'null' if w['pitch'] is None else w['pitch']
        src = w.get('src') or ''
        src_field = f"src: '{esc(src)}', " if src else ''

        lines.append(
            f"  {{ id: '{wid}', word: '{esc(w['word'])}', kana: '{esc(w['kana'])}', "
            f"pitch: {pitch}, pos: '{esc(pos)}', posAll: '{esc(pos_all)}', "
            f"meaning: '{meaning}', {src_field}part: '{w['part']}', chapter: '{w['chapter']}' }}"
            + (',' if i < len(words) - 1 else '')
        )
    lines.append(']};')
    out_path.write_text('\n'.join(lines), encoding='utf-8')

    print(f'词库已写入 {out_path}')
    print('各分篇 ID 范围:')
    for key, n in counts.items():
        px = prefix.get(key, 'n')
        label = '基础词' if key[0] == 'basic' else (key[1] or '其余核心')
        print(f'  {label:8} {bank_id}{px}1 - {bank_id}{px}{n}  ({n} 词)')


if __name__ == '__main__':
    sys.exit(main())