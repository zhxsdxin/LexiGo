#!/usr/bin/env python3
"""
声调符号识别（图像模板匹配兜底）

OCR 对带圈数字 ⓪ ①②③④ 这类空心圈字符识别不稳定（漏识或读成 o / 1 / 4）。
这里改用形状匹配：把圈内区域二值化后，与 0-4 的标准模板比对相似度。

模板直接从本页清晰的样本中学习：对同一页里 OCR 成功识别为 ①②③④ 的格子
取平均特征作为模板，再回头识别缺失的格子。属于自校准，无需内置字体。
"""

import numpy as np
import pymupdf

GRID = 10  # 归一化网格大小


def _features(mask: np.ndarray) -> np.ndarray:
    """把二值图归一化到 GRID×GRID，返回特征向量"""
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return np.zeros(GRID * GRID, dtype=np.float32)
    # 按包围盒裁剪后缩放，消除大小差异
    y0, y1 = ys.min(), ys.max() + 1
    x0, x1 = xs.min(), xs.max() + 1
    sub = mask[y0:y1, x0:x1]
    h, w = sub.shape
    if h == 0 or w == 0:
        return np.zeros(GRID * GRID, dtype=np.float32)
    # 最近邻缩放到 GRID×GRID
    yi = (np.arange(GRID) * h // GRID).clip(0, h - 1)
    xi = (np.arange(GRID) * w // GRID).clip(0, w - 1)
    small = sub[np.ix_(yi, xi)].astype(np.float32)
    return small.flatten()


def cell_mask(page_arr: np.ndarray, rows, cols, ri: int, ci: int, margin: int = 6) -> np.ndarray:
    """取出某单元格的暗像素掩码"""
    H, W = page_arr.shape[:2]
    y0, y1 = rows[ri] + 2, rows[ri + 1] - 2
    x0, x1 = max(0, cols[ci] - margin), min(W, cols[ci + 1] + margin)
    if y1 <= y0 or x1 <= x0:
        return np.zeros((1, 1), dtype=bool)
    sub = page_arr[y0:y1, x0:x1, :3].mean(axis=2)
    return sub < 165


def classify_pitch(page_arr, rows, cols, ri: int, templates: dict[int, np.ndarray]) -> int | None:
    """用模板匹配判断声调，templates 为 {数字: 特征向量}"""
    mask = cell_mask(page_arr, rows, cols, ri, 3)
    # 圈内数字：先找外圈圆环，再取圆心区域
    ys, xs = np.where(mask)
    if len(ys) < 20:
        return None
    y0, y1 = ys.min(), ys.max() + 1
    x0, x1 = xs.min(), xs.max() + 1
    h, w = y1 - y0, x1 - x0
    if h < 8 or w < 8:
        return None
    # 取中心 50% 区域（去掉外圈）
    cy0, cy1 = y0 + h * 0.28, y0 + h * 0.72
    cx0, cx1 = x0 + w * 0.28, x0 + w * 0.72
    inner = np.zeros_like(mask)
    inner[int(cy0):int(cy1), int(cx0):int(cx1)] = mask[int(cy0):int(cy1), int(cx0):int(cx1)]

    feat = _features(inner)
    if feat.sum() == 0:
        return None

    best, best_score = None, -1
    for digit, tpl in templates.items():
        # 余弦相似度
        denom = np.linalg.norm(feat) * np.linalg.norm(tpl)
        score = float(feat @ tpl / denom) if denom else 0.0
        if score > best_score:
            best, best_score = digit, score
    # 相似度过低说明形状不匹配任何已知模板
    return best if best_score > 0.72 else None


def build_templates(page_arr, rows, cols, known: dict[int, list[int]]):
    """用已知的 (数字 → 行号列表) 自校准出模板"""
    tpls = {}
    for digit, row_ids in known.items():
        feats = []
        for ri in row_ids:
            mask = cell_mask(page_arr, rows, cols, ri, 3)
            ys, xs = np.where(mask)
            if len(ys) < 20:
                continue
            y0, y1 = ys.min(), ys.max() + 1
            x0, x1 = xs.min(), xs.max() + 1
            h, w = y1 - y0, x1 - x0
            inner = np.zeros_like(mask)
            a, b = int(y0 + h * 0.28), int(y0 + h * 0.72)
            c, d = int(x0 + w * 0.28), int(x0 + w * 0.72)
            inner[a:b, c:d] = mask[a:b, c:d]
            f = _features(inner)
            if f.sum() > 0:
                feats.append(f)
        if feats:
            tpls[digit] = np.mean(feats, axis=0)
    return tpls