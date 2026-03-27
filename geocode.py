import json
import os
import re
import time

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

KAKAO_REST_API_KEY = os.environ.get("KAKAO_REST_API_KEY", "").strip()
if not KAKAO_REST_API_KEY:
    raise RuntimeError("KAKAO_REST_API_KEY is not set. Add it to .env.")

INPUT_FILE = "bmgg_list.json"
OUTPUT_FILE = "ssp-map/public/bmgg_with_coords.json"
FAILURE_FILE = "ssp-map/public/geocode_failures.json"
DELAY_SEC = 0.1
RETRY_WEAK_ADDRESS = os.environ.get("RETRY_WEAK_ADDRESS", "").lower() in {"1", "true", "yes", "on"}

SIDO_PREFIX_RE = re.compile(
    r"^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|"
    r"서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|"
    r"경기도|강원도|강원특별자치도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|"
    r"경상북도|경상남도|제주특별자치도)"
)

PROVINCE_ALIASES: dict[str, str] = {
    "서울": "서울",
    "서울특별시": "서울",
    "부산": "부산",
    "부산광역시": "부산",
    "대구": "대구",
    "대구광역시": "대구",
    "인천": "인천",
    "인천광역시": "인천",
    "광주": "광주",
    "광주광역시": "광주",
    "대전": "대전",
    "대전광역시": "대전",
    "울산": "울산",
    "울산광역시": "울산",
    "세종": "세종",
    "세종특별자치시": "세종",
    "경기": "경기",
    "경기도": "경기",
    "강원": "강원",
    "강원도": "강원",
    "강원특별자치도": "강원",
    "충북": "충북",
    "충청북도": "충북",
    "충남": "충남",
    "충청남도": "충남",
    "전북": "전북",
    "전라북도": "전북",
    "전북특별자치도": "전북",
    "전남": "전남",
    "전라남도": "전남",
    "경북": "경북",
    "경상북도": "경북",
    "경남": "경남",
    "경상남도": "경남",
    "제주": "제주",
    "제주도": "제주",
    "제주특별자치도": "제주",
}

PROVINCE_QUERY_PREFIXES: dict[str, list[str]] = {
    "서울": ["서울특별시"],
    "부산": ["부산광역시"],
    "대구": ["대구광역시"],
    "인천": ["인천광역시"],
    "광주": ["광주광역시"],
    "대전": ["대전광역시"],
    "울산": ["울산광역시"],
    "세종": ["세종특별자치시"],
    "경기": ["경기도"],
    "강원": ["강원특별자치도", "강원도"],
    "충북": ["충청북도"],
    "충남": ["충청남도"],
    "전북": ["전북특별자치도", "전라북도"],
    "전남": ["전라남도"],
    "경북": ["경상북도"],
    "경남": ["경상남도"],
    "제주": ["제주특별자치도"],
}

GTCD_TO_PROVINCES: dict[str, set[str]] = {
    "서울": {"서울"},
    "인천": {"인천"},
    "경인": {"경기", "인천"},
    "경기북부": {"경기"},
    "부산.울산": {"부산", "울산"},
    "대구.경북": {"대구", "경북"},
    "광주.전남": {"광주", "전남"},
    "대전.충남": {"대전", "충남", "세종"},
    "충북": {"충북"},
    "전북": {"전북"},
    "경남": {"경남"},
    "강원영동": {"강원"},
    "강원영서": {"강원"},
    "강원": {"강원"},
    "제주": {"제주"},
}


def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" ,")


def has_sido_prefix(address: str) -> bool:
    return bool(SIDO_PREFIX_RE.match(normalize_spaces(address)))


def normalize_province(value: str | None) -> str | None:
    if not value:
        return None
    text = normalize_spaces(value)
    if not text:
        return None
    token = text.split(" ", 1)[0]
    return PROVINCE_ALIASES.get(token)


def infer_expected_provinces(item: dict) -> set[str]:
    provinces: set[str] = set()

    gtcd = (item.get("gtcdNm") or "").strip()
    provinces.update(GTCD_TO_PROVINCES.get(gtcd, set()))

    bjdsgg = normalize_spaces(item.get("bjdsgg") or "")
    if bjdsgg:
        province = normalize_province(bjdsgg)
        if province:
            provinces.add(province)

    return provinces


def extract_province_from_text(text: str | None) -> str | None:
    if not text:
        return None
    normalized = normalize_spaces(text)
    if not normalized:
        return None
    return normalize_province(normalized)


def extract_result_province(doc: dict, source: str) -> str | None:
    if source == "address":
        for field in ("road_address", "address"):
            value = doc.get(field) or {}
            region_1depth = value.get("region_1depth_name")
            province = extract_province_from_text(region_1depth)
            if province:
                return province
        return extract_province_from_text(doc.get("address_name"))

    for field in ("road_address_name", "address_name", "place_name"):
        province = extract_province_from_text(doc.get(field))
        if province:
            return province
    return None


def build_context_prefixes(item: dict) -> list[str]:
    prefixes: list[str] = []
    seen: set[str] = set()

    def add_prefix(value: str):
        v = normalize_spaces(value)
        if len(v) < 2:
            return
        if v not in seen:
            seen.add(v)
            prefixes.append(v)

    bjdsgg = normalize_spaces(item.get("bjdsgg") or "")
    if bjdsgg:
        add_prefix(bjdsgg)
        parts = bjdsgg.split(" ")
        if len(parts) >= 2:
            add_prefix(" ".join(parts[:2]))

    for province in sorted(infer_expected_provinces(item)):
        for prefix in PROVINCE_QUERY_PREFIXES.get(province, []):
            add_prefix(prefix)

    return prefixes[:8]


def build_query_candidates(address: str) -> list[str]:
    if not address:
        return []

    candidates: list[str] = []
    seen: set[str] = set()

    def add_candidate(value: str):
        v = re.sub(r"\s+", " ", value).strip(" ,")
        if len(v) < 3:
            return
        if v not in seen:
            seen.add(v)
            candidates.append(v)

    base = address.strip()
    if not base:
        return []

    add_candidate(base)

    cleaned = base.replace("<주  소>", "").replace("<주소>", "").strip()
    cleaned = re.sub(r"^(첫출근장소|근무지)\s*[:：]\s*", "", cleaned)
    add_candidate(cleaned)

    if "*" in cleaned:
        add_candidate(cleaned.split("*", 1)[0])

    cleaned_no_paren = re.sub(r"\([^)]*\)", "", cleaned)
    add_candidate(cleaned_no_paren)

    if "," in cleaned:
        add_candidate(cleaned.split(",", 1)[0])

    cleaned_no_floor = re.sub(r"\b\d+\s*층\b.*$", "", cleaned)
    add_candidate(cleaned_no_floor)

    return candidates[:8]


def build_query_candidates_with_context(item: dict) -> tuple[list[str], bool]:
    address = item.get("drmJuso", "")
    base_candidates = build_query_candidates(address)
    if not base_candidates:
        return [], False

    weak_address = not has_sido_prefix(base_candidates[0])
    if not weak_address:
        return base_candidates, weak_address

    queries: list[str] = []
    seen: set[str] = set()

    def add_query(value: str):
        v = normalize_spaces(value)
        if len(v) < 3:
            return
        if v not in seen:
            seen.add(v)
            queries.append(v)

    for prefix in build_context_prefixes(item):
        for candidate in base_candidates:
            add_query(f"{prefix} {candidate}")

    for candidate in base_candidates:
        add_query(candidate)

    return queries[:24], weak_address


def geocode_address(item: dict) -> dict:
    queries, weak_address = build_query_candidates_with_context(item)
    expected_provinces = infer_expected_provinces(item)
    if not queries:
        return {
            "coords": None,
            "source": None,
            "query": None,
            "reason": "blank_address",
            "last_error": None,
            "queries": [],
        }

    address_url = "https://dapi.kakao.com/v2/local/search/address.json"
    keyword_url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    last_error = None

    def try_source(url: str, source: str):
        nonlocal last_error

        fallback_hit = None
        for query in queries:
            params = {"query": query, "size": 5}
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=10)
                if resp.status_code != 200:
                    last_error = f"{source}_http_{resp.status_code}"
                    continue
                docs = resp.json().get("documents", [])
                if not docs:
                    continue

                for doc in docs:
                    province = extract_result_province(doc, source)
                    if expected_provinces and province and province not in expected_provinces:
                        if fallback_hit is None:
                            fallback_hit = (doc, query, province)
                        continue
                    if expected_provinces and province is None and weak_address:
                        continue
                    return doc, query

                if fallback_hit is None:
                    fallback_hit = (docs[0], query, extract_result_province(docs[0], source))
            except Exception as e:
                last_error = f"{source}_exception:{e}"

        if fallback_hit and not (weak_address and expected_provinces):
            doc, query, _ = fallback_hit
            return doc, query
        return None, None

    def to_result(doc: dict, source: str, query: str):
        return {
            "coords": (float(doc["y"]), float(doc["x"])),
            "source": source,
            "query": query,
            "reason": None,
            "last_error": None,
            "queries": queries,
        }

    doc, query = try_source(address_url, "address")
    if doc:
        return to_result(doc, "address", query)

    doc, query = try_source(keyword_url, "keyword")
    if doc:
        return to_result(doc, "keyword", query)

    if weak_address and expected_provinces and last_error is None:
        last_error = f"region_mismatch(expected={','.join(sorted(expected_provinces))})"

    return {
        "coords": None,
        "source": None,
        "query": None,
        "reason": "not_found",
        "last_error": last_error,
        "queries": queries,
    }


def has_coords(entry: dict) -> bool:
    return entry.get("lat") is not None and entry.get("lng") is not None


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        items: list[dict] = json.load(f)

    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            done: list[dict] = json.load(f)
        done_codes = {d["bmgigwanCd"] for d in done if has_coords(d)}
        print(f"이어하기: 이미 {len(done_codes)}건 완료")
    else:
        done = []
        done_codes = set()

    results = {d["bmgigwanCd"]: d for d in done}
    failures: list[dict] = []
    source_count = {"address": 0, "keyword": 0}

    pending = []
    for item in items:
        code = item["bmgigwanCd"]
        existing = results.get(code)
        if existing and has_coords(existing):
            if RETRY_WEAK_ADDRESS and not has_sido_prefix(item.get("drmJuso", "")):
                pending.append(item)
            continue
        pending.append(existing or item)

    print(f"남은 건수: {len(pending)} / {len(items)}")
    if RETRY_WEAK_ADDRESS:
        print("옵션: RETRY_WEAK_ADDRESS=ON (시/도 누락 주소 재시도)")

    for i, item in enumerate(pending, 1):
        address = item.get("drmJuso", "")
        geocode_result = geocode_address(item)
        coords = geocode_result["coords"]

        entry = dict(item)
        if coords:
            entry["lat"], entry["lng"] = coords
            source_count[geocode_result["source"]] += 1
        else:
            entry["lat"] = None
            entry["lng"] = None
            failures.append(
                {
                    "bmgigwanCd": item["bmgigwanCd"],
                    "drmJuso": address,
                    "reason": geocode_result["reason"],
                    "lastError": geocode_result["last_error"],
                    "triedQueries": geocode_result["queries"],
                }
            )

        results[item["bmgigwanCd"]] = entry

        if i % 100 == 0 or i == len(pending):
            all_results = list(results.values())
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(all_results, f, ensure_ascii=False)
            with open(FAILURE_FILE, "w", encoding="utf-8") as f:
                json.dump(failures, f, ensure_ascii=False)
            success = sum(1 for r in all_results if has_coords(r))
            print(
                f"  [{i}/{len(pending)}] 저장 완료 - 좌표 성공: {success}건 "
                f"(address {source_count['address']}, keyword {source_count['keyword']}, 실패 {len(failures)})"
            )

        time.sleep(DELAY_SEC)

    print(f"\n완료! '{OUTPUT_FILE}'에 저장되었습니다.")
    print(f"실패 목록: '{FAILURE_FILE}'")


if __name__ == "__main__":
    main()
