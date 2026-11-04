#!/usr/bin/env python3
"""校验 data/raw/*.json 与三语言 variants，并生成 assets/js/data.js。"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
VARIANTS = ROOT / "data" / "variants"
OUT = ROOT / "assets" / "js" / "data.js"

LANGS = ("c", "cpp", "python")
LANG_LABEL = {"c": "C", "cpp": "C++", "python": "Python"}

MODULES = [
    {"key": "basics", "name": "C语言基础", "display": "程序设计基础", "prefix": "基", "short": "基础",
     "desc": "数据类型、运算符、流程控制、输入输出与预处理"},
    {"key": "array", "name": "数组", "display": "数组与字符串", "prefix": "数", "short": "数组",
     "desc": "一维/二维数组、字符数组、排序查找与矩阵"},
    {"key": "pointer", "name": "指针", "display": "指针与引用", "prefix": "指", "short": "指针",
     "desc": "指针与地址、数组指针、字符串、动态内存与函数指针"},
    {"key": "struct", "name": "结构体", "display": "结构体与类", "prefix": "结", "short": "结构体",
     "desc": "结构体定义、嵌套、数组、指针、链表与 typedef"},
    {"key": "enum", "name": "枚举", "display": "枚举与常量", "prefix": "枚", "short": "枚举",
     "desc": "枚举常量、本质、作用域与典型应用"},
    {"key": "function", "name": "函数", "display": "函数与递归", "prefix": "函", "short": "函数",
     "desc": "定义调用、参数传递、递归、作用域与模块化"},
]
BY_NAME = {m["name"]: m for m in MODULES}
TYPES = {"choice", "fill", "design"}
EXPECTED_MODULE_COUNTS = {
    "C语言基础": 68, "数组": 90, "指针": 98,
    "结构体": 78, "枚举": 20, "函数": 46,
}
EXPECTED_TYPE_COUNTS = {"choice": 260, "fill": 70, "design": 70}
TOTAL_EXPECTED = 400


def die(errors: list[str]) -> None:
    print("\n".join(f"  [FAIL] {e}" for e in errors))
    print(f"\n共 {len(errors)} 个问题，构建中止。")
    sys.exit(1)


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:  # noqa: BLE001
        die([f"{path.relative_to(ROOT)}: JSON 解析失败：{exc}"])


def code_fence(text: str, lang: str) -> str:
    return re.sub(r"```(?:c|cpp|python)\b", f"```{lang}", text)


def check_options(where: str, options, answer, errors: list[str]) -> None:
    if not isinstance(options, list) or len(options) != 4:
        errors.append(f"{where}: options 必须恰好 4 项")
        return
    if len({str(o).strip() for o in options}) != 4:
        errors.append(f"{where}: options 存在重复项")
    if any(not str(o).strip() for o in options):
        errors.append(f"{where}: options 存在空项")
    if not isinstance(answer, int) or answer not in range(4):
        errors.append(f"{where}: answer 必须是 0~3 的整数")


def check_fill(where: str, stem: str, blanks, errors: list[str], warnings: list[str]) -> None:
    if not isinstance(blanks, list) or not (2 <= len(blanks) <= 4):
        errors.append(f"{where}: blanks 需为 2~4 项")
        return
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


def check_design(where: str, solution, points, errors: list[str], warnings: list[str], lang: str) -> None:
    if not isinstance(solution, str) or len(solution.strip()) < 40:
        errors.append(f"{where}: 缺少完整 solution")
        return
    if lang in ("c", "cpp") and "main" not in solution:
        errors.append(f"{where}: solution 需包含 main")
    if lang == "python":
        if not re.search(r"\bdef\s+main\b|\binput\s*\(|sys\.stdin", solution) and "print" not in solution:
            warnings.append(f"{where}: Python solution 未见输入/输出逻辑，请确认")
    if not isinstance(points, list) or not (3 <= len(points) <= 5):
        errors.append(f"{where}: points 需为 3~5 条")


def check_variant(q: dict, lang: str, v: dict, errors: list[str], warnings: list[str]) -> None:
    where = f"{q['id']}[{lang}]"
    analysis = v.get("analysis", "")
    if not isinstance(analysis, str) or len(analysis.strip()) < 30:
        errors.append(f"{where}: analysis 为空或过短")
    if analysis.count("```") % 2:
        errors.append(f"{where}: analysis 中代码围栏 ``` 未闭合")
    for bad in ("TODO", "待补充"):
        if bad in analysis:
            errors.append(f"{where}: analysis 含占位文本 {bad!r}")

    qtype = q["type"]
    if qtype == "choice":
        options = v.get("options", q.get("options"))
        answer = v.get("answer", q.get("answer"))
        check_options(where, options, answer, errors)
        if lang == "python" and not v.get("stem") and "```c" in q.get("stem", ""):
            warnings.append(f"{where}: Python 选择题题干含 C 代码但未提供 Python stem，请确认")
        return

    stem = v.get("stem", q.get("stem", ""))
    if not isinstance(stem, str) or len(stem.strip()) < 20:
        errors.append(f"{where}: stem 为空或过短")
    if stem.count("```") % 2:
        errors.append(f"{where}: stem 中代码围栏 ``` 未闭合")
    if lang == "python" and not v.get("stem") and "```c" in q.get("stem", ""):
        errors.append(f"{where}: Python 代码题题干含 C 代码，必须提供独立 stem")
    if qtype == "fill":
        blanks = v.get("blanks", q.get("blanks"))
        if lang == "python" and not v.get("blanks"):
            errors.append(f"{where}: Python 填空题必须提供独立 blanks")
        check_fill(where, stem, blanks, errors, warnings)
    else:
        solution = v.get("solution", q.get("solution"))
        points = v.get("points", q.get("points"))
        check_design(where, solution, points, errors, warnings, lang)


def main() -> None:
    check_only = "--check" in sys.argv
    partial = "--partial" in sys.argv
    errors: list[str] = []
    warnings: list[str] = []
    questions: list[dict] = []
    by_id: dict[str, dict] = {}
    seen_stems: dict[str, str] = {}

    files = sorted(RAW.glob("*.json"))
    if not files:
        die([f"未找到题库文件：{RAW}/*.json"])

    for path in files:
        rel = path.relative_to(ROOT)
        data = read_json(path)
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
            if qid in by_id:
                errors.append(f"{where}: id 重复：{qid}")
            by_id[qid] = q
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
            for bad in ("TODO", "待补充"):
                if bad in stem or bad in analysis:
                    errors.append(f"{where}: 含占位文本 {bad!r}")

            key = re.sub(r"\s+", "", stem)
            if key in seen_stems:
                errors.append(f"{where}: 题干与 {seen_stems[key]} 重复")
            seen_stems[key] = str(qid)

            if qtype == "choice":
                check_options(where, q.get("options"), q.get("answer"), errors)
            elif qtype == "fill":
                check_fill(where, stem, q.get("blanks"), errors, warnings)
            elif qtype == "design":
                check_design(where, q.get("solution"), q.get("points"), errors, warnings, "c")

            q["_file"] = rel.as_posix()
            questions.append(q)

    if errors:
        die(errors)

    # 合并外部语言变体：data/variants/python-*.json / cpp-*.json
    for lang in ("cpp", "python"):
        for path in sorted(VARIANTS.glob(f"{lang}-*.json")):
            data = read_json(path)
            if not isinstance(data, dict):
                errors.append(f"{path.relative_to(ROOT)}: 顶层必须是对象 {{id: variant}}")
                continue
            for qid, variant in data.items():
                q = by_id.get(qid)
                if not q:
                    errors.append(f"{path.relative_to(ROOT)}: 未知题目 id {qid}")
                    continue
                if not isinstance(variant, dict):
                    errors.append(f"{path.relative_to(ROOT)}: {qid} 的 variant 必须是对象")
                    continue
                q.setdefault("variants", {})[lang] = variant

    # 校验每道题的三语言变体
    for q in questions:
        variants = q.get("variants")
        if not isinstance(variants, dict):
            errors.append(f"{q['id']}: 缺少 variants（需含 cpp/python）")
            continue
        for lang in ("cpp", "python"):
            v = variants.get(lang)
            if not isinstance(v, dict):
                errors.append(f"{q['id']}: 缺少 variants.{lang}")
                continue
            # C++ 代码题允许直接沿用 C 版本，补全后再校验
            if lang == "cpp":
                if q["type"] in ("fill", "design") and not v.get("stem"):
                    v["stem"] = code_fence(q["stem"], "cpp")
                if q["type"] == "fill" and not v.get("blanks"):
                    v["blanks"] = q.get("blanks")
                if q["type"] == "design" and not v.get("solution"):
                    v["solution"] = q.get("solution")
                if q["type"] == "design" and not v.get("points"):
                    v["points"] = q.get("points")
            check_variant(q, lang, v, errors, warnings)

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
        if len(questions) != TOTAL_EXPECTED:
            errors.append(f"总题数 {len(questions)}，预期 {TOTAL_EXPECTED}")

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
            "title": "程序设计基础 · 三语言习题复习库",
            "subtitle": "C / C++ / Python · PTA 风格 · 400 题 · 含答案解析",
            "version": "2.0",
            "total": len(questions),
            "languages": [
                {"key": "c", "label": "C", "ext": "c"},
                {"key": "cpp", "label": "C++", "ext": "cpp"},
                {"key": "python", "label": "Python", "ext": "py"},
            ],
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
