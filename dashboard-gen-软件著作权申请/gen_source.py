#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新生成《源代码.txt》：以当前仓库真实源码为准，去注释、空行后按
每页 50 行分页，页眉「dashboard-gen V1.0」，页脚「第 N 页 / 共 M 页」。

运行：python3 gen_source.py （需在仓库根目录执行）
"""
from __future__ import annotations

import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(__file__).resolve().parent / "源代码.txt"
HEADER = "dashboard-gen V1.0"
PAGE_LINES = 50

FILES = [
    "bin/dg",
    "lib/errors.js",
    "lib/theme.js",
    "lib/style.js",
    "lib/loader.js",
    "lib/a11y.js",
    "lib/components.js",
    "lib/render.js",
    "lib/build.js",
    "lib/cli.js",
    "scripts/a11y-check.mjs",
]


def strip(src: str) -> list[str]:
    """去掉行尾空白；删除空行、// 注释行、/* 注释行及块注释续行（保留 CSS
    `* { ... }` 选择器所在行）。"""
    kept = []
    for line in src.split("\n"):
        raw = line.rstrip()
        t = raw.strip()
        if not t:
            continue
        if t.startswith("//") or t.startswith("/*"):
            continue
        if t.startswith("*") and not t.startswith("* {"):
            continue
        kept.append(raw)
    return kept


def main() -> int:
    stream: list[str] = []
    source_total = 0
    for rel in FILES:
        p = REPO / rel
        if not p.exists():
            print(f"skip missing {rel}", file=sys.stderr)
            continue
        stripped = strip(p.read_text(encoding="utf-8"))
        source_total += len(stripped)
        stream.append(f"/* ================= 文件: {rel} ================= */")
        stream.extend(stripped)

    total = len(stream)
    pages = (total + PAGE_LINES - 1) // PAGE_LINES
    info = (
        f"软件全称：dashboard-gen（智能体落地页 / 内部工具只读仪表板生成器）V1.0\n"
        f"著作权人：许达（工作单位：中国移动研究院）\n"
        f"说明：本文件为软件著作权登记申请之源代码文档。页眉为软件名称及版本号（左对齐），"
        f"每页正文 {PAGE_LINES} 行，页脚为页码；页面为 A4 纵向，正文建议使用宋体五号。\n"
        f"源程序有效行数（已去除注释与空行、不含文件间分隔标注）：{source_total} 行。"
        f"按中国版权保护中心「前 30 页 + 后 30 页」规则，源程序不足 60 页（实际 {pages} 页），"
        f"故全部提交。\n"
    )

    lines_out = [info, ""]
    for i in range(pages):
        body = list(stream[i * PAGE_LINES : (i + 1) * PAGE_LINES])
        if i == pages - 1:
            # 末页补齐至整 50 行，保证每页版式一致（页脚仅紧随正文之后）。
            body += [""] * (PAGE_LINES - len(body))
        lines_out.append(HEADER)
        lines_out.extend(body)
        lines_out.append(f"第 {i + 1} 页 / 共 {pages} 页")
        lines_out.append("")

    OUT.write_text("\n".join(lines_out).rstrip("\n") + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({total} 行内容, {pages} 页)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
