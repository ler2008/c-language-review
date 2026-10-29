#!/usr/bin/env python3
"""校验并提取网页运行所需文件到 dist/。"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

RUNTIME_FILES = [
    "index.html",
    "assets/css/style.css",
    "assets/js/app.js",
    "assets/js/data.js",
]


def main() -> None:
    missing = [f for f in RUNTIME_FILES if not (ROOT / f).is_file()]
    if missing:
        print("缺少运行文件，请先执行 python tools/build_data.py：")
        for f in missing:
            print("  -", f)
        sys.exit(1)

    data_js = (ROOT / "assets/js/data.js").read_text(encoding="utf-8")
    m = re.search(r'"total":(\d+)', data_js)
    total = int(m.group(1)) if m else 0
    if total != 300:
        print(f"题库总数为 {total}，预期 300。请先运行 python tools/build_data.py。")
        sys.exit(1)

    if DIST.exists():
        shutil.rmtree(DIST)
    for rel in RUNTIME_FILES:
        target = DIST / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, target)

    size = sum(p.stat().st_size for p in DIST.rglob("*") if p.is_file())
    print(f"已生成上传目录：{DIST.relative_to(ROOT)}/（{size:,} bytes）")
    print("  ├── index.html")
    print("  └── assets/")
    print("\n上传时请确保 index.html 在网站根目录。")
    print("微信部署步骤见 docs/WECHAT_DEPLOY.md")


if __name__ == "__main__":
    main()
