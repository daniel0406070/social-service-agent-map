import json
import os
import xml.etree.ElementTree as ET

import requests

def load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return

    with open(path, encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            if key.startswith("export "):
                key = key[len("export ") :].strip()
            if not key or key in os.environ:
                continue

            value = value.strip().strip('"').strip("'")
            os.environ[key] = value


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BASE_DIR, ".env")
load_env_file(ENV_FILE)

API_KEY = os.environ.get("BMGG_OPEN_API_KEY", os.environ.get("API_KEY", "")).strip()
if not API_KEY:
    raise RuntimeError("BMGG_OPEN_API_KEY (or API_KEY) is not set. Add it to .env.")

BASE_URL = "https://apis.data.go.kr/1300000/bmggJeongBo/list"
NUM_OF_ROWS = 1000


def parse_item(item_el: ET.Element) -> dict:
    return {child.tag: child.text for child in item_el}


def fetch_all_items() -> list[dict]:
    all_items = []
    page_no = 1

    while True:
        params = {
            "serviceKey": API_KEY,
            "numOfRows": NUM_OF_ROWS,
            "pageNo": page_no,
        }

        response = requests.get(BASE_URL, params=params, timeout=30)
        response.raise_for_status()

        root = ET.fromstring(response.content)

        result_code = root.findtext("header/resultCode") or root.findtext(".//resultCode", "")
        if result_code != "00":
            result_msg = root.findtext("header/resultMsg") or root.findtext(".//resultMsg", "")
            raise RuntimeError(f"API 오류: {result_code} - {result_msg}")

        total_count = int(root.findtext(".//totalCount") or 0)
        items_el = root.findall(".//item")

        if not items_el:
            break

        page_items = [parse_item(el) for el in items_el]
        all_items.extend(page_items)
        print(f"페이지 {page_no} 완료 - 누적 {len(all_items)} / {total_count}건")

        if len(all_items) >= total_count:
            break

        page_no += 1

    return all_items


def main():
    print("복무기관 정보 수집 시작...")
    items = fetch_all_items()

    output_path = "bmgg_list.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f"\n완료! 총 {len(items)}개 복무기관 정보를 '{output_path}'에 저장했습니다.")


if __name__ == "__main__":
    main()
