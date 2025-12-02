import os
import sys
import base64
from pathlib import Path

from openai import OpenAI


def to_data_url(p: Path) -> str:
    ext = p.suffix.lower().lstrip('.') or 'png'
    b64 = base64.b64encode(p.read_bytes()).decode('utf-8')
    return f"data:image/{ext};base64,{b64}"


def main():
    if not os.environ.get("MOONSHOT_API_KEY"):
        print("Missing MOONSHOT_API_KEY in environment", file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python vision_sample.py <image_path>")
        sys.exit(1)

    img_path = Path(sys.argv[1])
    if not img_path.exists():
        print(f"File not found: {img_path}", file=sys.stderr)
        sys.exit(1)

    # Avoid inheriting shell proxy envs that may require socksio unless explicitly allowed
    if not os.environ.get("MOONSHOT_TRUST_ENV"):
        for k in ["ALL_PROXY","all_proxy","HTTP_PROXY","http_proxy","HTTPS_PROXY","https_proxy"]:
            os.environ.pop(k, None)

    client = OpenAI(
        api_key=os.environ.get("MOONSHOT_API_KEY"),
        base_url="https://api.moonshot.ai/v1",
    )

    image_url = to_data_url(img_path)

    completion = client.chat.completions.create(
        model="moonshot-v1-8k-vision-preview",
        messages=[
            {"role": "system", "content": "You are Kimi."},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_url}},
                    {"type": "text", "text": "Describe the content of the image."},
                ],
            },
        ],
    )

    print(completion.choices[0].message.content)


if __name__ == "__main__":
    main()
