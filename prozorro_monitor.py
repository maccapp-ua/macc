#!/usr/bin/env python3
"""
MACC Prozorro Monitor — моніторинг будівельних тендерів.

Критерії відбору:
  • ДК 021:2015 коди: 45* (будівельні роботи)
    45000000-7 Будівельні роботи
    45100000-8 Підготовчі роботи на майданчику
    45200000-9 Зведення будівель та споруд
    45300000-0 Будівельно-монтажні роботи
    45400000-1 Завершальні будівельні роботи
  • Статус: period уточнень, подання пропозицій, прекваліфікація
  • Типи процедур: відкриті торги, відкриті торги з особливостями,
    тендер, переговорна для потреб оборони
  • Регіон: вся Україна (без обмежень)
  • Сума: від 200 000 грн
"""

import os
import json
import html
import time
import datetime as dt
from pathlib import Path

import requests

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")

PROZORRO_FEED = os.environ.get(
    "PROZORRO_FEED", "https://public-api.prozorro.gov.ua/api/2.5/tenders"
)

# ── Критерії відбору ─────────────────────────────────────────────────
TARGET_STATUSES = {
    "active.enquiries",          # Період уточнень
    "active.tendering",          # Подання пропозицій
    "active.pre-qualification",  # Прекваліфікація
}

TARGET_METHOD_TYPES = {
    "aboveThreshold",       # Відкриті торги
    "aboveThresholdEU",     # Відкриті торги з особливостями
    "belowMarket",          # Тендер
    "simple.defense",       # Переговорна процедура для потреб оборони
    "aboveThresholdUA",     # Відкриті торги (UA)
    "aboveThresholdUA.defense",  # Переговорна (UA)
}

CPV_IDS = {
    "45000000-7", "45000000",  # Будівельні роботи
    "45100000-8", "45100000",  # Підготовчі роботи на майданчику
    "45200000-9", "45200000",  # Зведення будівель та споруд
    "45300000-0", "45300000",  # Будівельно-монтажні роботи
    "45400000-1", "45400000",  # Завершальні будівельні роботи
}
MIN_AMOUNT   = 200_000.0    # грн

MAX_PAGES        = int(os.environ.get("MAX_PAGES", "80"))
MAX_DETAIL_FETCH = int(os.environ.get("MAX_DETAIL_FETCH", "2000"))
REQUEST_PAUSE    = 0.15

DATA_DIR   = Path(__file__).parent / "data"
SEEN_PATH  = DATA_DIR / "seen.json"
FEED_PATH  = DATA_DIR / "dzo_feed.json"
STATE_PATH = DATA_DIR / "state.json"
FEED_LIMIT = 50

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "MACCProzorroBot/1.0"})


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"offset": None}


def save_state(state):
    DATA_DIR.mkdir(exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def fetch_candidate_ids(offset):
    """Гортає фід, попередній фільтр за статусом."""
    ids, pages = [], 0
    url = PROZORRO_FEED
    base_params = {
        "limit": 100,
        "descending": "0",
        "opt_fields": "status,procurementMethodType",
    }
    params = dict(base_params)
    if offset:
        params["offset"] = offset

    while pages < MAX_PAGES:
        try:
            r = SESSION.get(url, params=params, timeout=40)
            r.raise_for_status()
            body = r.json()
        except Exception as e:
            print(f"[warn] фід: {e}")
            break

        data = body.get("data", [])
        if not data:
            break

        for t in data:
            tid = t.get("id")
            if not tid:
                continue
            if t.get("status") not in TARGET_STATUSES:
                continue
            ids.append(tid)

        nxt = body.get("next_page", {})
        new_offset = nxt.get("offset")
        if not new_offset or new_offset == offset:
            offset = new_offset
            break
        offset = new_offset
        params = {**base_params, "offset": offset}
        pages += 1

    return ids, offset


def fetch_tender(tid):
    r = SESSION.get(f"{PROZORRO_FEED}/{tid}", timeout=40)
    r.raise_for_status()
    return r.json().get("data", {})


def matches(t):
    # статус
    if t.get("status") not in TARGET_STATUSES:
        return False

    # тип процедури (якщо зазначено — фільтруємо; якщо None — пропускаємо)
    method_type = t.get("procurementMethodType") or ""
    if method_type and method_type not in TARGET_METHOD_TYPES:
        return False

    # сума
    val = t.get("value", {}) or {}
    amount = float(val.get("amount") or 0)
    currency = (val.get("currency") or "").upper()
    if currency and currency != "UAH":
        return False
    if amount < MIN_AMOUNT:
        return False

    # CPV (ДК 021:2015): хоча б один item має починатися на "45"
    cpv_ok = False
    for it in t.get("items", []) or []:
        cid = ((it.get("classification") or {}).get("id") or "")
        if cid in CPV_IDS:
            cpv_ok = True
            break
    return cpv_ok


def to_record(t):
    val = t.get("value", {}) or {}
    pe  = t.get("procuringEntity", {}) or {}
    tid = t.get("id", "")

    status_ua = {
        "active.enquiries":          "Період уточнень",
        "active.tendering":          "Подання пропозицій",
        "active.pre-qualification":  "Прекваліфікація",
    }.get(t.get("status"), t.get("status", ""))

    method_ua = {
        "aboveThreshold":            "Відкриті торги",
        "aboveThresholdEU":          "Відкриті торги з особливостями",
        "belowMarket":               "Тендер",
        "simple.defense":            "Переговорна (оборона)",
        "aboveThresholdUA":          "Відкриті торги",
        "aboveThresholdUA.defense":  "Переговорна (оборона)",
    }.get(t.get("procurementMethodType", ""), "")

    end = ((t.get("tenderPeriod") or {}).get("endDate") or "")[:16].replace("T", " ")
    region = ((pe.get("address") or {}).get("region") or "")

    # CPV першого items
    cpv_label = ""
    for it in t.get("items", []) or []:
        cid = ((it.get("classification") or {}).get("id") or "")
        cdesc = ((it.get("classification") or {}).get("description") or "")
        if cid in CPV_IDS:
            cpv_label = f"{cid} {cdesc}".strip()
            break

    return {
        "title":    t.get("title", "Без назви"),
        "summary":  f"{pe.get('name', '')} · {status_ua}" + (f" · {method_ua}" if method_ua else ""),
        "amount":   f"{float(val.get('amount') or 0):,.0f} грн".replace(",", " "),
        "deadline": end,
        "region":   region,
        "cpv":      cpv_label,
        "url":      f"https://prozorro.gov.ua/tender/{tid}",
    }


def load_seen():
    if SEEN_PATH.exists():
        return set(json.loads(SEEN_PATH.read_text(encoding="utf-8")))
    return set()


def save_seen(seen):
    DATA_DIR.mkdir(exist_ok=True)
    SEEN_PATH.write_text(
        json.dumps(sorted(seen)[-5000:], ensure_ascii=False), encoding="utf-8"
    )


def send_telegram(records):
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        print("[warn] немає TELEGRAM_BOT_TOKEN/CHAT_ID.")
        return
    today = dt.date.today().strftime("%d.%m.%Y")
    lines = [f"<b>🏗 Нові будівельні тендери — {today}</b>", ""]
    for r in records[:20]:
        title = html.escape(r["title"])
        lines.append(
            f"• <a href=\"{html.escape(r['url'])}\"><b>{title}</b></a>\n"
            f"  {html.escape(r['summary'])}\n"
            f"  💰 {html.escape(r['amount'])}"
            + (f"   📍 {html.escape(r['region'])}" if r.get("region") else "")
            + f"\n  ⏳ до {html.escape(r['deadline'])}"
        )
    text = "\n\n".join(lines)[:4000]
    SESSION.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": TELEGRAM_CHAT_ID, "text": text,
              "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=30,
    ).raise_for_status()
    print(f"[ok] Telegram: {len(records)} тендер(ів).")


def update_feed(records):
    DATA_DIR.mkdir(exist_ok=True)
    old = []
    if FEED_PATH.exists():
        try:
            old = json.loads(FEED_PATH.read_text(encoding="utf-8")).get("items", [])
        except Exception:
            old = []
    now = dt.datetime.now().isoformat(timespec="minutes")
    items = ([{**r, "added": now} for r in records] + old)[:FEED_LIMIT]
    FEED_PATH.write_text(
        json.dumps({"updated": now, "items": items}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[ok] стрічку оновлено: {FEED_PATH}")


def main():
    state = load_state()
    seen  = load_seen()

    ids, new_offset = fetch_candidate_ids(state.get("offset"))
    print(f"[info] кандидатів (статус пройшов): {len(ids)}")

    fresh_ids = [i for i in ids if i not in seen][:MAX_DETAIL_FETCH]
    print(f"[info] нових для перевірки: {len(fresh_ids)}")

    matched = []
    for i, tid in enumerate(fresh_ids, 1):
        try:
            t = fetch_tender(tid)
            if matches(t):
                matched.append(to_record(t))
        except Exception as e:
            print(f"[warn] tender {tid}: {e}")
        seen.add(tid)
        if i % 200 == 0:
            print(f"[info] оброблено {i}/{len(fresh_ids)}…")
        time.sleep(REQUEST_PAUSE)

    print(f"[info] під критерії підійшло: {len(matched)}")

    if matched:
        send_telegram(matched)
        update_feed(matched)

    save_seen(seen)
    if new_offset:
        state["offset"] = new_offset
        save_state(state)
    print("[done]")


if __name__ == "__main__":
    main()
