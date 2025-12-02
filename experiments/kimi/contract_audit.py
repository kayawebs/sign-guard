import os
import sys
import json
import base64
from pathlib import Path
from typing import List

from openai import OpenAI

def build_rules(expected_name: str):
    # 第一条：严格相等判断（逐字匹配）。仅当完全一致时才可判定为 ok。
    r1 = (
        "合同主体名称必须正确、完整；并且‘我方’名称必须与标准署名完全一致"
        f"（标准署名：{expected_name or '上海大学材料科学与工程学院'}，逐字匹配，不允许全角/半角、空格或括号形态差异）。"
    )
    return [
        r1,
        "若合同已有对方盖章，则合同文本中的对方名称必须与印章印文一致。",
        "对方已盖章且多页或有附件，应加盖骑缝章。",
        "禁止在空白文本或未成文载体上盖对方印章。",
        "对方签章必须齐全，包括对方印章（如需盖章）和对方签名/授权人签字。",
        "合同签署日期必须存在（若盖章则应在邻近标注日期）。",
        "对方主体名称、签名栏信息和印章印文需一致。",
    ]

CATEGORIES = [
    "本科教学类",
    "研究生教学类",
    "科研类",
    "人事/劳动类",
    "国际/港澳台交流类",
    "学工类",
    "院团委类",
    "其他",
]


def to_data_url(p: Path) -> str:
    ext = p.suffix.lower().lstrip('.') or 'png'
    b64 = base64.b64encode(p.read_bytes()).decode('utf-8')
    return f"data:image/{ext};base64,{b64}"


def build_messages(img_paths: List[Path], expected_name: str):
    content = []
    for p in img_paths:
        content.append({"type": "image_url", "image_url": {"url": to_data_url(p)}})
    rules = build_rules(expected_name)
    rules_txt = (
        "你是合同预审核助手。立场：‘我方’固定为标准署名（默认上海大学材料科学与工程学院），‘对方’为与我方相对一方。\n"
        f"我方={expected_name or '上海大学材料科学与工程学院'}。请严格按固定规则输出：\n"
        + "\n".join([f"{i+1}) {r}" for i, r in enumerate(rules)])
        + "\n输出合法 JSON（只输出 JSON，不要额外文本）：\n"
        + "{\n  \"ok\": boolean,\n  \"checks\": [{\"name\": string, \"ok\": boolean, \"message\": string}],\n  \"category\": string,\n  \"recognized\": {\n    \"seals\": [{\"side\": \"我方\"|\"对方\"|\"未知\", \"imprint_text\": string, \"near_text\": string|null}],\n    \"signatures\": [{\"side\": \"我方\"|\"对方\"|\"未知\", \"name\": string|null, \"label\": string|null}]\n  }\n}\n"
        + "严格性要求：\n- 第一条必须基于‘完全一致(逐字相等)’判断我方名称是否等于标准署名；若不完全一致，即判定为 false（可在 message 中说明近似/宽松匹配情况，但不影响结果）。\n"
        + "- 甲/乙/供/需关系：甲方=需方，乙方=供方。\n- 判断‘我方’：若甲/乙任意一方名称与标准署名完全一致，则该方为我方；若都不一致，默认甲方(需方)为我方。相关规则中的‘对方’为相对的一方。\n"
        + "- checks 必须包含全部7项，顺序与名称完全一致，不得遗漏；若无法识别某项，也必须输出该项并设置 ok=false，message 简述原因。\n"
        + "在 checks 的第一条 message 中，必须列出识别到的甲/需与乙/供名称，以及与标准署名的匹配结果（完全一致/不一致）。\n"
        + "在 recognized.seals 中，给出识别到的印章印文文本（imprint_text）及其附近文字（near_text），并标注 side；\n"
        + "在 recognized.signatures 中，给出识别到的签名/委托代理人信息（name 或 label，例如‘委托代理人’），并标注 side。\n"
        + "分类可选：" + "/".join(CATEGORIES)
    )
    content.append({"type": "text", "text": rules_txt})
    return [
        {"role": "system", "content": "You are Kimi."},
        {"role": "user", "content": content},
    ]


def main():
    if not os.environ.get("MOONSHOT_API_KEY"):
        print("Missing MOONSHOT_API_KEY in environment", file=sys.stderr)
        sys.exit(1)
    if len(sys.argv) < 2:
        print("Usage: python contract_audit.py <image1> [image2 ...] [--expected=学院名]", file=sys.stderr)
        sys.exit(1)

    expected = "上海大学材料科学与工程学院"
    args = []
    for a in sys.argv[1:]:
        if a.startswith("--expected="):
            expected = a.split("=", 1)[1].strip() or expected
        else:
            args.append(a)

    paths = [Path(a) for a in args]
    for p in paths:
        if not p.exists():
            print(f"File not found: {p}", file=sys.stderr)
            sys.exit(1)

    # Avoid inheriting shell proxy envs that may require socksio unless explicitly allowed
    if not os.environ.get("MOONSHOT_TRUST_ENV"):
        for k in ["ALL_PROXY","all_proxy","HTTP_PROXY","http_proxy","HTTPS_PROXY","https_proxy"]:
            os.environ.pop(k, None)

    client = OpenAI(
        api_key=os.environ.get("MOONSHOT_API_KEY"),
        base_url="https://api.moonshot.ai/v1",
    )

    messages = build_messages(paths, expected)
    resp = client.chat.completions.create(
        model="moonshot-v1-128k-vision-preview",
        messages=messages,
        temperature=0,
    )
    text = resp.choices[0].message.content or ""
    # try to parse JSON block
    data = None
    try:
        data = json.loads(text)
    except Exception:
        import re
        m = re.search(r"[\[{][\s\S]*[\]}]", text)
        if m:
            try:
                data = json.loads(m.group(0))
            except Exception:
                pass
    if data is None:
        print(text)
        sys.exit(2)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
