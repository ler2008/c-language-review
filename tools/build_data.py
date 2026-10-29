#!/usr/bin/env python3
"""校验 data/raw/*.json 并生成 assets/js/data.js。"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "assets" / "js" / "data.js"

MODULES = [
    {"key": "basics", "name": "C语言基础", "prefix": "基", "short": "基础",
     "desc": "数据类型、运算符、流程控制、输入输出与预处理"},
    {"key": "array", "name": "数组", "prefix": "数", "short": "数组",
     "desc": "一维/二维数组、字符数组、排序查找与矩阵"},
    {"key": "pointer", "name": "指针", "prefix": "指", "short": "指针",
     "desc": "指针与地址、数组指针、字符串、动态内存与函数指针"},
    {"key": "struct", "name": "结构体", "prefix": "结", "short": "结构体",
     "desc": "结构体定义、嵌套、数组、指针、链表与 typedef"},
    {"key": "enum", "name": "枚举", "prefix": "枚", "short": "枚举",
     "desc": "枚举常量、本质、作用域与典型应用"},
    {"key": "function", "name": "函数", "prefix": "函", "short": "函数",
     "desc": "定义调用、参数传递、递归、作用域与模块化"},
]
BY_NAME = {m["name"]: m for m in MODULES}
PREFIX = {m["prefix"] for m in MODULES}
TYPES = {"choice", "fill", "design"}
EXPECTED_MODULE_COUNTS = {
    "C语言基础": 50, "数组": 68, "指针": 76,
    "结构体": 60, "枚举": 16, "函数": 30,
}
EXPECTED_TYPE_COUNTS = {"choice": 182, "fill": 67, "design": 51}


def die(errors: list[str]) -> None:
    print("\n".join(f"  [FAIL] {e}" for e in errors))
    print(f"\n共 {len(errors)} 个问题，构建中止。")
    sys.exit(1)


def main() -> None:
    check_only = "--check" in sys.argv
    partial = "--partial" in sys.argv
    errors: list[str] = []
    warnings: list[str] = []
    questions: list[dict] = []
    seen_ids: set[str] = set()
    seen_stems: dict[str, str] = {}

    files = sorted(RAW.glob("*.json"))
    if not files:
        die([f"未找到题库文件：{RAW}/*.json"])

    for path in files:
        rel = path.relative_to(ROOT)
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{rel}: JSON 解析失败：{exc}")
            continue
        if not isinstance(data, list):
            errors.append(f"{rel}: 顶层必须是数组")
            continue
        for idx, q in enumerate(data, 1):
            where = f"{rel}#{idx}"
            if not isinstance(q, dict):
                errors.append(f"{where}: 必须是对象")
                continue
            qid = q.get("id", "")
            module = q.get("module", "")
            qtype = q.get("type", "")
            stem = q.get("stem", "")
            analysis = q.get("analysis", "")
            tags = q.get("tags")
            diff = q.get("difficulty")

            if module not in BY_NAME:
                errors.append(f"{where}: module 非法：{module!r}")
                continue
            if not re.fullmatch(rf"{BY_NAME[module]['prefix']}-\d{{2}}", str(qid)):
                errors.append(f"{where}: id 应形如 {BY_NAME[module]['prefix']}-01，实际 {qid!r}")
            if qid in seen_ids:
                errors.append(f"{where}: id 重复：{qid}")
            seen_ids.add(qid)
            if qtype not in TYPES:
                errors.append(f"{where}: type 非法：{qtype!r}")
            if diff not in (1, 2, 3):
                errors.append(f"{where}: difficulty 必须是 1/2/3")
            if not isinstance(tags, list) or not (2 <= len(tags) <= 4):
                errors.append(f"{where}: tags 需为 2~4 个字符串")
            if not isinstance(stem, str) or len(stem.strip()) < 10:
                errors.append(f"{where}: stem 为空或过短")
            if not isinstance(analysis, str) or len(analysis.strip()) < 15:
                errors.append(f"{where}: analysis 为空或过短")
            if stem.count("```") % 2:
                errors.append(f"{where}: stem 中代码围栏 ``` 未闭合")
            if analysis.count("```") % 2:
                errors.append(f"{where}: analysis 中代码围栏 ``` 未闭合")
            for bad in ("TODO", "待补充", "略。"):
                if bad in stem or bad in analysis:
                    errors.append(f"{where}: 含占位文本 {bad!r}")

            key = re.sub(r"\s+", "", stem)
            if key in seen_stems:
                errors.append(f"{where}: 题干与 {seen_stems[key]} 重复")
            seen_stems[key] = str(qid)

            if qtype == "choice":
                opts = q.get("options")
                ans = q.get("answer")
                if not isinstance(opts, list) or len(opts) != 4:
                    errors.append(f"{where}: options 必须恰好 4 项")
                else:
                    if len({str(o).strip() for o in opts}) != 4:
                        errors.append(f"{where}: options 存在重复项")
                    if any(re.match(r"^[A-Da-d][.、．)]", str(o)) for o in opts):
                        warnings.append(f"{where}: 选项带了 A/B/C/D 前缀，渲染时会重复")
                    if any(not str(o).strip() for o in opts):
                        errors.append(f"{where}: options 存在空项")
                if not isinstance(ans, int) or ans not in range(4):
                    errors.append(f"{where}: answer 必须是 0~3 的整数")

            elif qtype == "fill":
                blanks = q.get("blanks")
                if not isinstance(blanks, list) or not (2 <= len(blanks) <= 4):
                    errors.append(f"{where}: blanks 需为 2~4 项")
                else:
                    for b in blanks:
                        if not isinstance(b, dict):
                            errors.append(f"{where}: blanks 项必须是对象")
                            continue
                        if not b.get("no") or not b.get("answer"):
                            errors.append(f"{where}: blank 缺少 no/answer")
                        if b.get("no") and b["no"] not in stem:
                            errors.append(f"{where}: stem 中未出现占位符 {b.get('no')}")
                    if len({b.get("no") for b in blanks}) != len(blanks):
                        errors.append(f"{where}: blanks 的 no 重复")
                    if "①" not in stem:
                        warnings.append(f"{where}: stem 未看到 ① 占位符")

            elif qtype == "design":
                sol = q.get("solution")
                pts = q.get("points")
                if not isinstance(sol, str) or "main" not in sol:
                    errors.append(f"{where}: 缺少完整 solution（需含 main）")
                if not isinstance(pts, list) or not (3 <= len(pts) <= 5):
                    errors.append(f"{where}: points 需为 3~5 条")
                if not isinstance(sol, str) or "printf" not in sol:
                    warnings.append(f"{where}: solution 未见 printf，请确认输出要求")

            q["_file"] = rel.as_posix()
            questions.append(q)

    if errors:
        die(errors)

    mod_counts = Counter(q["module"] for q in questions)
    type_counts = Counter(q["type"] for q in questions)
    diff_counts = Counter(q["difficulty"] for q in questions)
    if not partial:
        for m in MODULES:
            got, want = mod_counts[m["name"]], EXPECTED_MODULE_COUNTS[m["name"]]
            if got != want:
                errors.append(f"模块「{m['name']}」数量 {got}，预期 {want}")
        for t, want in EXPECTED_TYPE_COUNTS.items():
            if type_counts[t] != want:
                errors.append(f"题型 {t} 数量 {type_counts[t]}，预期 {want}")
        if len(questions) != 300:
            errors.append(f"总题数 {len(questions)}，预期 300")

    print(f"读取 {len(files)} 个文件，共 {len(questions)} 道题")
    print("模块分布：" + "，".join(f"{m['name']} {mod_counts[m['name']]}" for m in MODULES))
    print("题型分布：" + "，".join(f"{k} {type_counts[k]}" for k in ("choice", "fill", "design")))
    print("难度分布：" + "，".join(f"{k}星 {diff_counts[k]}" for k in (1, 2, 3)))
    for name in BY_NAME:
        sub = [q for q in questions if q["module"] == name]
        answers = Counter(q.get("answer") for q in sub if q["type"] == "choice")
        print(f"  - {name}: " + "，".join(f"{chr(65 + i)}={answers[i]}" for i in range(4)))
    if warnings:
        print(f"\n提示（{len(warnings)} 条）：")
        for w in warnings[:30]:
            print(f"  [WARN] {w}")

    if errors:
        die(errors)

    if check_only:
        print("\n校验通过。")
        return

    order = {m["name"]: i for i, m in enumerate(MODULES)}
    questions.sort(key=lambda q: (order[q["module"]], q["id"]))
    for seq, q in enumerate(questions, 1):
        q["seq"] = seq

    bank = {
        "meta": {
            "title": "C 语言程序设计基础 · 习题复习库",
            "subtitle": "PTA 风格 · 300 题 · 含答案解析",
            "version": "1.0",
            "total": len(questions),
        },
        "modules": [
            {**m, "count": mod_counts[m["name"]]}
            for m in MODULES
        ],
        "typeCounts": dict(type_counts),
        "questions": questions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/* 由 tools/build_data.py 自动生成，请勿直接修改 */\n"
        "window.C_BANK = "
        + json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    size = OUT.stat().st_size
    print(f"\n已生成 {OUT.relative_to(ROOT)}（{size:,} bytes）")
    print("校验通过。")


if __name__ == "__main__":
    main()
