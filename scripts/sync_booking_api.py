import json
import os
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT_DIR = Path(__file__).resolve().parents[1]


def load_env_file() -> None:
    env_file = ROOT_DIR / ".env"

    if not env_file.exists():
        return

    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()

        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_env_file()

API_HOST = "api." + "mind" + "bodyonline.com"
BASE_URL = f"https://{API_HOST}/public/v6"
SITE_ID = os.getenv("BOOKING_SITE_ID", "5753835")
API_KEY = os.getenv("BOOKING_API_KEY")

RAW_OUTPUT_DIR = ROOT_DIR / "api_results"
CACHE_FILE = ROOT_DIR / "data" / "studio-cache.json"

RAW_OUTPUT_DIR.mkdir(exist_ok=True)
CACHE_FILE.parent.mkdir(exist_ok=True)


SEED_ENDPOINTS: List[Dict[str, Any]] = [
    {"name": "Products", "method": "GET", "path": "/sale/products"},
    {"name": "Packages", "method": "GET", "path": "/sale/packages"},
    {"name": "Sales", "method": "GET", "path": "/sale/sales"},
    {"name": "Sale Services", "method": "GET", "path": "/sale/services"},
    {"name": "Sale Contracts", "method": "GET", "path": "/sale/contracts", "params": {"LocationId": 1, "SoldOnline": "true"}},
    {"name": "Classes", "method": "GET", "path": "/class/classes"},
    {"name": "Class Descriptions", "method": "GET", "path": "/class/classdescriptions"},
    {"name": "Class Schedules", "method": "GET", "path": "/class/classschedules"},
    {"name": "Enrollments", "method": "GET", "path": "/enrollment/enrollments"},
    {"name": "Locations", "method": "GET", "path": "/site/locations"},
    {"name": "Sites", "method": "GET", "path": "/site/sites"},
    {"name": "Session Types", "method": "GET", "path": "/site/sessiontypes"},
    {"name": "Programs", "method": "GET", "path": "/site/programs"},
    {"name": "Resources", "method": "GET", "path": "/site/resources"},
    {"name": "Staff", "method": "GET", "path": "/staff/staff"},
    {"name": "Appointment Options", "method": "GET", "path": "/appointment/appointmentoptions"},
    {"name": "Staff Appointments", "method": "GET", "path": "/appointment/staffappointments"},
    {"name": "Clients", "method": "GET", "path": "/client/clients"},
    {"name": "Client Indexes", "method": "GET", "path": "/client/clientindexes"},
    {"name": "Client Referral Types", "method": "GET", "path": "/client/clientreferraltypes"},
    {"name": "Custom Client Fields", "method": "GET", "path": "/client/customclientfields"},
    {"name": "Required Client Fields", "method": "GET", "path": "/client/requiredclientfields"},
]

TARGET_MEMBERSHIPS = [
    {
        "label": "Drop in",
        "sessions": 1,
        "matches": ["drop in", "drop-in", "dropin"],
        "imagePosition": "48% 76%",
    },
    {
        "label": "4 class pack",
        "sessions": 4,
        "matches": ["4 class pack-3 months contract", "4 class membership", "4 class pack", "four class"],
        "fallbackPrice": "$150.00",
        "imagePosition": "34% 42%",
    },
    {
        "label": "5 class pack",
        "sessions": 5,
        "matches": ["5 class pack", "five class"],
        "imagePosition": "72% 48%",
    },
    {
        "label": "10 class pack",
        "sessions": 10,
        "matches": ["10 class pack", "ten class"],
        "imagePosition": "60% 72%",
    },
]


def get_headers() -> Dict[str, str]:
    if not API_KEY:
        raise RuntimeError(
            "Missing BOOKING_API_KEY. Set BOOKING_API_KEY and BOOKING_SITE_ID before running."
        )

    return {
        "Api-Key": API_KEY,
        "SiteId": SITE_ID,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "CaveModernPilatesSync/1.0",
    }


def safe_filename(name: str) -> str:
    return re.sub(r"[^a-z0-9._-]+", "_", name.lower()).strip("_")


def save_json(filename: str, data: Any) -> Path:
    path = RAW_OUTPUT_DIR / f"{safe_filename(filename)}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def first_list(data: Any) -> List[Any]:
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for value in data.values():
            if isinstance(value, list):
                return value

    return []


def money(value: Any) -> str:
    try:
        return f"${float(value):.2f}"
    except (TypeError, ValueError):
        return str(value or "")


def parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None

    text = str(value).replace("Z", "+00:00")

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def nested_name(value: Any, fallback: str = "") -> str:
    if isinstance(value, dict):
        return str(value.get("Name") or value.get("FirstName") or fallback)

    return str(value or fallback)


def item_name(item: Dict[str, Any]) -> str:
    description = item.get("ClassDescription")
    if isinstance(description, dict):
        return str(description.get("Name") or item.get("Name") or "")

    return str(item.get("Name") or item.get("ServiceName") or item.get("Description") or "")


def item_price(item: Dict[str, Any]) -> str:
    for key in ["Price", "OnlinePrice", "UnitPrice", "Amount"]:
        if key in item and item[key] not in [None, ""]:
            return money(item[key])

    return ""


def item_sessions(item: Dict[str, Any], fallback: int) -> int:
    for key in ["Count", "Sessions", "SessionCount", "NumberOfSessions", "Quantity"]:
        value = item.get(key)
        if isinstance(value, int) and value > 0:
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)

    return fallback


def is_sell_online(item: Dict[str, Any]) -> bool:
    for key in ["SellOnline", "SoldOnline", "IsSellOnline", "AvailableOnline", "Online"]:
        if key in item:
            return bool(item[key])

    return False


def strip_html(value: Any) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def first_contract_item(contract: Dict[str, Any]) -> Dict[str, Any]:
    items = contract.get("ContractItems")

    if isinstance(items, list) and items and isinstance(items[0], dict):
        return items[0]

    return {}


def service_category(name: str) -> str:
    lowered = name.lower()

    if "new client" in lowered or "newbie" in lowered or "starter" in lowered or "intro" in lowered:
        return "newbie"

    return "classPacks"


def normalize_service_store_item(item: Dict[str, Any]) -> Dict[str, Any]:
    name = item_name(item)
    sessions = item_sessions(item, 1)
    expiration_length = item.get("ExpirationLength")
    expiration_unit = item.get("ExpirationUnit")
    expires = ""

    if expiration_length and expiration_unit:
        expires = f"Expires in {expiration_length} {str(expiration_unit).lower()}"

    return {
        "id": str(item.get("Id") or item.get("ProductId") or ""),
        "productId": item.get("ProductId"),
        "kind": "service",
        "category": service_category(name),
        "name": name,
        "sourceName": name,
        "price": item_price(item),
        "sessions": sessions,
        "description": expires,
        "sellOnline": is_sell_online(item),
        "requiresWaiver": True,
        "requiresTerms": False,
    }


def normalize_contract_store_item(contract: Dict[str, Any]) -> Dict[str, Any]:
    item = first_contract_item(contract)
    name = str(contract.get("Name") or item.get("Name") or "")
    item_name_text = str(item.get("Name") or name)
    session_match = re.search(r"(\d+)\s*class", item_name_text.lower())
    sessions = int(session_match.group(1)) if session_match else 0
    commitment_months = contract.get("NumberOfAutopays") or 0
    price = (
        money(contract.get("RecurringPaymentAmountTotal"))
        if contract.get("RecurringPaymentAmountTotal") not in [None, ""]
        else money(item.get("Price"))
    )

    return {
        "id": str(contract.get("Id") or ""),
        "kind": "contract",
        "category": "memberships",
        "name": re.sub(r"\s+", " ", name).strip(),
        "sourceName": re.sub(r"\s+", " ", item_name_text).strip(),
        "price": price,
        "sessions": sessions,
        "commitmentMonths": int(commitment_months) if str(commitment_months).isdigit() else commitment_months,
        "description": f"{sessions} classes/month" if sessions else "Monthly membership",
        "agreementTerms": strip_html(contract.get("AgreementTerms")),
        "requiresElectronicConfirmation": bool(contract.get("RequiresElectronicConfirmation")),
        "sellOnline": is_sell_online(contract),
        "requiresWaiver": True,
        "requiresTerms": True,
    }


def normalize_store(results: Dict[str, Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    services = [
        normalize_service_store_item(item)
        for item in first_list(results.get("Sale Services", {}).get("data", {}))
        if isinstance(item, dict) and is_sell_online(item) and not item.get("Discontinued")
    ]
    contracts = [
        normalize_contract_store_item(item)
        for item in first_list(results.get("Sale Contracts", {}).get("data", {}))
        if isinstance(item, dict) and is_sell_online(item)
    ]

    def sort_key(item: Dict[str, Any]) -> Any:
        return (
            item.get("commitmentMonths") or 0,
            item.get("sessions") or 0,
            item.get("name") or "",
        )

    return {
        "newbie": sorted([item for item in services if item["category"] == "newbie"], key=sort_key),
        "memberships": sorted(contracts, key=sort_key),
        "classPacks": sorted([item for item in services if item["category"] == "classPacks"], key=sort_key),
    }


def collect_sale_items(results: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []

    for name in ["Sale Services", "Packages", "Products"]:
        items.extend([item for item in first_list(results.get(name, {}).get("data", {})) if isinstance(item, dict)])

    return items


def find_membership(target: Dict[str, Any], items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    lowered_matches = target["matches"]
    candidates: List[Dict[str, Any]] = []

    for item in items:
        name = item_name(item).lower()
        if any(match in name for match in lowered_matches):
            candidates.append(item)

    if not candidates:
        return None

    def score(item: Dict[str, Any]) -> int:
        name = item_name(item).lower()
        for index, match in enumerate(lowered_matches):
            if match in name:
                return index
        return len(lowered_matches)

    return sorted(candidates, key=score)[0]


def normalize_memberships(results: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    sale_items = collect_sale_items(results)
    memberships: List[Dict[str, Any]] = []

    for target in TARGET_MEMBERSHIPS:
        source = find_membership(target, sale_items)

        memberships.append(
            {
                "name": target["label"],
                "sourceName": item_name(source) if source else target["label"],
                "id": source.get("Id") if source else None,
                "sessions": item_sessions(source, target["sessions"]) if source else target["sessions"],
                "serviceType": source.get("ServiceType") or "Classes" if source else "Classes",
                "serviceCategory": nested_name(source.get("Program"), "CAVE MODERN PILATES") if source else "CAVE MODERN PILATES",
                "price": item_price(source) if source else target.get("fallbackPrice", ""),
                "sellOnline": is_sell_online(source) if source else False,
                "imagePosition": target["imagePosition"],
            }
        )

    return memberships


def normalize_schedule(results: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    classes = [item for item in first_list(results.get("Classes With Date Range", {}).get("data", {})) if isinstance(item, dict)]

    if not classes:
        classes = [item for item in first_list(results.get("Classes", {}).get("data", {})) if isinstance(item, dict)]

    normalized: List[Dict[str, Any]] = []

    for item in classes:
        starts_at = parse_datetime(item.get("StartDateTime"))

        if not starts_at:
            continue

        staff = item.get("Staff") if isinstance(item.get("Staff"), dict) else {}
        capacity = item.get("MaxCapacity") or item.get("WebCapacity") or item.get("Capacity")
        booked = item.get("TotalBooked") or item.get("Booked") or item.get("TotalBookedWaitlist") or 0

        try:
            spots_left = max(int(capacity) - int(booked), 0) if capacity is not None else ""
        except (TypeError, ValueError):
            spots_left = ""

        normalized.append(
            {
                "id": item.get("Id"),
                "classScheduleId": item.get("ClassScheduleId"),
                "date": starts_at.strftime("%a %b %-d") if os.name != "nt" else starts_at.strftime("%a %b %#d"),
                "time": starts_at.strftime("%-I:%M %p") if os.name != "nt" else starts_at.strftime("%#I:%M %p"),
                "startDateTime": item.get("StartDateTime"),
                "className": item_name(item),
                "instructor": nested_name(staff, "Varies"),
                "spotsLeft": spots_left,
                "bookUrl": f"schedule.html?classId={item.get('Id')}" if item.get("Id") else "schedule.html",
            }
        )

    return sorted(normalized, key=lambda row: row["startDateTime"])


def normalize_location(results: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    locations = [item for item in first_list(results.get("Locations", {}).get("data", {})) if isinstance(item, dict)]
    location = locations[0] if locations else {}

    street = str(location.get("Address") or "").strip()
    address2 = str(location.get("Address2") or "").strip()
    city = str(location.get("City") or "").strip()
    state = str(location.get("StateProvCode") or "").strip()
    postal = str(location.get("PostalCode") or "").strip()

    if city and city.lower() in street.lower() and postal and postal in street:
        address_parts = [street, address2]
    else:
        address_parts = [street, address2, city, state, postal]

    address = ", ".join(str(part) for part in address_parts if part)

    return {
        "address": address or "Launch address coming soon",
        "parking": "Parking details coming soon.",
        "hours": "",
        "email": location.get("Email") or "support@cavemodernpilates.com",
    }


def run_endpoint(name: str, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = BASE_URL + path
    full_url = url + (("?" + urlencode(params)) if params else "")
    started = time.time()
    request = Request(full_url, headers=get_headers(), method="GET")

    try:
        with urlopen(request, timeout=35) as response:
            status = response.status
            raw_body = response.read().decode("utf-8")
            ok = 200 <= status < 300
    except HTTPError as error:
        status = error.code
        raw_body = error.read().decode("utf-8")
        ok = False
    except URLError as error:
        data = {"error": str(error.reason)}
        save_json(name, data)
        return {
            "name": name,
            "path": path,
            "params": params or {},
            "url": full_url,
            "status": "ERROR",
            "ok": False,
            "elapsed_ms": round((time.time() - started) * 1000),
            "data": data,
        }

    try:
        data = json.loads(raw_body)
    except ValueError:
        data = {"raw_response": raw_body}

    save_json(name, data)

    return {
        "name": name,
        "path": path,
        "params": params or {},
        "url": full_url,
        "status": status,
        "ok": ok,
        "elapsed_ms": round((time.time() - started) * 1000),
        "data": data,
    }


def run_paginated_endpoint(
    name: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    list_key: str = "Classes",
    limit: int = 100,
) -> Dict[str, Any]:
    all_items: List[Any] = []
    offset = 0
    first_result: Optional[Dict[str, Any]] = None
    last_result: Optional[Dict[str, Any]] = None

    while True:
        page_params = {
            **(params or {}),
            "request.limit": limit,
            "request.offset": offset,
        }
        page_name = f"{name} Page {offset // limit + 1}"
        result = run_endpoint(page_name, path, page_params)
        last_result = result

        if first_result is None:
            first_result = result

        if not result.get("ok"):
            break

        data = result.get("data", {})
        page_items = data.get(list_key, []) if isinstance(data, dict) else []

        if not isinstance(page_items, list) or not page_items:
            break

        all_items.extend(page_items)

        pagination = data.get("PaginationResponse", {}) if isinstance(data, dict) else {}
        total = pagination.get("TotalResults")
        page_size = pagination.get("PageSize") or len(page_items)
        offset += int(page_size)

        if total is not None and offset >= int(total):
            break

        time.sleep(0.2)

    base = first_result or last_result or {}
    combined_data = {
        **(base.get("data", {}) if isinstance(base.get("data"), dict) else {}),
        list_key: all_items,
        "PaginationResponse": {
            "RequestedLimit": limit,
            "RequestedOffset": 0,
            "PageSize": len(all_items),
            "TotalResults": len(all_items),
        },
    }
    combined_result = {
        **base,
        "name": name,
        "data": combined_data,
        "ok": bool(all_items) and bool(base.get("ok")),
    }
    save_json(name, combined_data)

    return combined_result


def build_parameterized_endpoints() -> List[Dict[str, Any]]:
    today = date.today()
    future = today + timedelta(days=45)

    return [
        {
            "name": "Classes With Date Range",
            "path": "/class/classes",
            "params": {
                "request.startDateTime": today.isoformat(),
                "request.endDateTime": future.isoformat(),
            },
        }
    ]


def write_cache(results: Dict[str, Dict[str, Any]]) -> None:
    if not any(result.get("ok") for result in results.values()) and CACHE_FILE.exists():
        print("API sync failed; keeping the existing public cache.")
        return

    cache = {
        "generatedAt": datetime.now().astimezone().isoformat(),
        "source": "cached booking API snapshot",
        "booking": {
            "scheduleUrl": "schedule.html",
            "accountUrl": f"https://clients.mindbodyonline.com/classic/ws?studioid={SITE_ID}&stype=-7&sView=week&sLoc=0",
            "mode": "booking-api-cache",
            "note": "Generated by scripts/sync_booking_api.py. Browser pages read this cache instead of calling the booking API directly.",
        },
        "memberships": normalize_memberships(results),
        "store": normalize_store(results),
        "waiver": {
            "title": "Cave Pilates, LLC Waiver and Release of Liability",
            "url": "policies.html#liability-waiver",
            "version": "2026-06-14",
            "requiredBeforeFirstClass": True,
        },
        "schedule": normalize_schedule(results),
        "location": normalize_location(results),
        "cachePolicy": {
            "publicSchedule": "5-15 minutes",
            "pricingAndMemberships": "6-12 hours",
            "staff": "24 hours",
            "locations": "24 hours",
        },
    }

    CACHE_FILE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    results: Dict[str, Dict[str, Any]] = {}

    for endpoint in SEED_ENDPOINTS:
        print(f"Fetching {endpoint['name']}...")
        result = run_endpoint(endpoint["name"], endpoint["path"], endpoint.get("params"))
        results[endpoint["name"]] = result
        time.sleep(0.2)

    for endpoint in build_parameterized_endpoints():
        print(f"Fetching {endpoint['name']}...")
        if endpoint["name"] == "Classes With Date Range":
            result = run_paginated_endpoint(endpoint["name"], endpoint["path"], endpoint.get("params"), "Classes")
        else:
            result = run_endpoint(endpoint["name"], endpoint["path"], endpoint.get("params"))
        results[endpoint["name"]] = result
        time.sleep(0.2)

    summary = [
        {key: value for key, value in result.items() if key != "data"}
        for result in results.values()
    ]

    save_json("summary", summary)
    write_cache(results)

    print(f"Wrote public cache to {CACHE_FILE}")
    print(f"Wrote raw API responses to {RAW_OUTPUT_DIR}")


if __name__ == "__main__":
    main()
