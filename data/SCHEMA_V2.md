# 题库数据规范（v2 · 三语言版）

v2 在 v1 的基础上增加 **C / C++ / Python 三套语言变体**。数据库仍是 400 道题，每道题在三种答题模式下都可见；切换模式时，题干中的代码、答案、解析和参考程序会切换为对应语言。

## 顶层题目

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 模块内唯一编号，如 `基-01` |
| `module` | string | 是 | 保持 v1 的模块名，前端会映射为显示名 |
| `type` | string | 是 | `choice` / `fill` / `design` |
| `difficulty` | number | 是 | 1/2/3 |
| `tags` | string[] | 是 | 2~4 个标签 |
| `stem` | string | 是 | C 语言版本的题干 |
| `options` | string[] | choice 必填 | C 语言版本选项，恰好 4 个 |
| `answer` | number | choice 必填 | C 语言版本答案下标 0~3 |
| `blanks` | object[] | fill 必填 | C 语言版本填空 |
| `solution` | string | design 必填 | C 语言版本完整程序 |
| `points` | string[] | design 必填 | C 语言版本采分点 3~5 条 |
| `analysis` | string | 是 | C 语言版本解析 |
| `langs` | string[] | 否 | 默认 `["c","cpp","python"]` |
| `variants` | object | 是 | 至少包含 `cpp` 与 `python` 两个键 |

## variants 覆盖规则

`variants.cpp` / `variants.python` 中的字段会覆盖顶层同名字段；没有提供的字段沿用 C 版本。必填：

| 字段 | 说明 |
|---|---|
| `analysis` | **必须提供**，用对应语言解释答案；可含代码块 |
| `stem` | 代码题必须提供；选择题若题干含 C 代码，也必须提供 |
| `options` / `answer` | 选择题答案或选项随语言变化时提供，否则沿用 C |
| `blanks` | 填空题的 Python 版本通常必须提供；C++ 可直接沿用 C 的填空时可不提供 |
| `solution` | 程序设计题必须提供对应语言的完整程序 |
| `points` | 可沿用 C 版本 |

### 选择题变体

```json
"variants": {
  "cpp": {
    "stem": "…（如题干含代码，改成 C++ 代码块）…",
    "analysis": "从 C++ 角度解释…"
  },
  "python": {
    "options": ["…", "…", "…", "…"],
    "answer": 1,
    "analysis": "从 Python 角度解释…"
  }
}
```

### 填空题变体

```json
"variants": {
  "cpp": {
    "stem": "…```cpp … ① …```",
    "analysis": "C++ 写法说明…"
  },
  "python": {
    "stem": "…```python … ① …```",
    "blanks": [
      { "no": "①", "answer": "…", "note": "…" }
    ],
    "analysis": "Python 写法说明…"
  }
}
```

### 程序设计题变体

```json
"variants": {
  "cpp": {
    "stem": "…```text 输入输出样例```",
    "solution": "#include <iostream>\n…",
    "analysis": "C++ 实现思路…",
    "points": ["…", "…", "…"]
  },
  "python": {
    "solution": "import sys\n…",
    "analysis": "Python 实现思路…"
  }
}
```

## 质量要求

- 三个语言版本的题目必须 **同一道题、同一组输入输出、同一个算法目标**，不能变成三道不同的题。
- C++ 版本使用标准 C++17；Python 版本使用 Python 3.10+。
- Python 参考程序必须能直接运行，避免依赖第三方库。
- 选择题的三个版本答案可以相同，但解析必须解释该语言下的关键差异；若答案不同，必须提供该语言的 `options` 与 `answer`。
- 代码围栏语言分别写 ` ```c `、` ```cpp `、` ```python `；输入输出样例用 ` ```text `。
- 不使用 `TODO`、`待补充`、`略。` 等占位文本。

## 新增题目文件

新增 100 题放在 `data/raw/09-exam-extra.json`，每题内联 `variants`。已有题目的 C++/Python 覆盖放在：

- `data/variants/cpp.json`
- `data/variants/python.json`

两个文件都是 `{ "题目id": { …variant… }, … }` 的对象。
