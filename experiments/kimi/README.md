Kimi Vision quick test (Moonshot API)

Prerequisites
- Python 3.9+
- An API key in env: `MOONSHOT_API_KEY`

Setup
1) Create a venv and install deps
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt

2) Run a simple vision test (describe image)
   python vision_sample.py ../..//shu.png

3) Run a contract audit-style extraction to JSON
   python contract_audit.py ../..//shu.png --expected="上海大学材料科学与工程学院"
   # Or multiple pages
   python contract_audit.py page1.png page2.png

Notes
- The scripts send images as base64 data URLs, so no external hosting is required.
- The Moonshot API is OpenAI-compatible at base URL `https://api.moonshot.ai/v1`.
- If you hit rate limits or auth errors, confirm `MOONSHOT_API_KEY` is exported in your shell.
- Rule 1 explicitly requires exact string equality for 我方名称=标准署名（逐字相等，不允许全角/半角、空格、括号差异）。第一条的 message 必须列出甲/供与乙/需识别结果及匹配结论。
- The JSON now includes `recognized`:
  - `recognized.seals[]`: { side, imprint_text, near_text }
  - `recognized.signatures[]`: { side, name, label }
