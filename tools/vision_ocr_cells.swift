#!/usr/bin/env swift
// 逐个单元格做日文 OCR。输入一批图片路径，按顺序输出每张图的识别文本（一行一张）。
// 单元格很小，只含一个词或一个短语，因此关闭语言纠正，避免被"猜"错。
// 用法: swift vision_ocr_cells.swift <图片1> <图片2> ...

import Foundation
import Vision
import AppKit

func recognize(_ path: String) -> String {
    guard let img = NSImage(contentsOfFile: path),
          let tiff = img.tiffRepresentation,
          let bmp = NSBitmapImageRep(data: tiff),
          let cg = bmp.cgImage else { return "" }

    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    // 单元格内容是日语词条与中文释义，日语优先，同时允许中文
    req.recognitionLanguages = ["ja-JP", "zh-Hans"]
    req.usesLanguageCorrection = false
    // 提高最小识别高度，保证小字也尽力识别
    req.minimumTextHeight = 0.0

    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { return "" }

    guard let obs = req.results else { return "" }
    // 单元格内通常只有一行；有多个结果时按 y 排序拼起来
    let lines = obs.compactMap { o -> (String, CGFloat)? in
        guard let c = o.topCandidates(1).first else { return nil }
        return (c.string, o.boundingBox.origin.y)
    }.sorted { $0.1 > $1.1 }

    return lines.map { $0.0 }.joined(separator: " ")
}

for path in CommandLine.arguments.dropFirst() {
    print(recognize(path))
}