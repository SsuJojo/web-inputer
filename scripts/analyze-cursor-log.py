from __future__ import annotations

import ast
import re
from pathlib import Path

log_path = Path("logs/remote-input.log")
pattern = re.compile(r"^(?P<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}).*client-log ip=(?P<ip>\S+) entry=(?P<entry>\{.*\})$")

sync_entries = []
predict_entries = []
for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
    match = pattern.match(line)
    if not match:
        continue
    try:
        entry = ast.literal_eval(match.group("entry"))
    except Exception:
        continue
    item = {"time": match.group("time"), "ip": match.group("ip"), **entry}
    if entry.get("kind") == "cursor-sync":
        sync_entries.append(item)
    elif entry.get("kind") == "cursor-predict":
        predict_entries.append(item)

moving = []
for entry in sync_entries:
    sent = entry.get("sent") or {}
    actual = entry.get("actual") or {}
    sent_x = sent.get("x") or 0
    sent_y = sent.get("y") or 0
    actual_x = actual.get("x") or 0
    actual_y = actual.get("y") or 0
    if abs(sent_x) >= 6 or abs(sent_y) >= 6:
        moving.append((entry, sent_x, sent_y, actual_x, actual_y))

print(f"sync_entries={len(sync_entries)} predict_entries={len(predict_entries)} moving_sync_entries={len(moving)}")
if sync_entries:
    print(f"first_sync={sync_entries[0]['time']} latest_sync={sync_entries[-1]['time']}")
if predict_entries:
    print(f"first_predict={predict_entries[0]['time']} latest_predict={predict_entries[-1]['time']}")

print("\nLatest 20 moving cursor-sync entries:")
for entry, sent_x, sent_y, actual_x, actual_y in moving[-20:]:
    ratio_x = actual_x / sent_x if sent_x else None
    ratio_y = actual_y / sent_y if sent_y else None
    print({
        "time": entry["time"],
        "seq": entry.get("seq"),
        "hard": entry.get("hard"),
        "movingNow": entry.get("movingNow"),
        "requestedAge": entry.get("requestedAge"),
        "sent": {"x": sent_x, "y": sent_y},
        "actual": {"x": round(actual_x, 2), "y": round(actual_y, 2)},
        "ratio": {"x": None if ratio_x is None else round(ratio_x, 3), "y": None if ratio_y is None else round(ratio_y, 3)},
        "measured": entry.get("measured"),
        "gain": entry.get("gain"),
        "error": entry.get("error"),
    })

ratios_x = []
ratios_y = []
for _, sent_x, sent_y, actual_x, actual_y in moving:
    if abs(sent_x) >= 6 and sent_x * actual_x > 0:
        ratios_x.append(actual_x / sent_x)
    if abs(sent_y) >= 6 and sent_y * actual_y > 0:
        ratios_y.append(actual_y / sent_y)

def summarize(name: str, values: list[float]) -> None:
    if not values:
        print(f"{name}: none")
        return
    values = sorted(values)
    mid = values[len(values) // 2]
    avg = sum(values) / len(values)
    print(f"{name}: n={len(values)} min={values[0]:.3f} median={mid:.3f} avg={avg:.3f} max={values[-1]:.3f}")

print("\nRatio summary actual/sent:")
summarize("x", ratios_x)
summarize("y", ratios_y)

print("\nLatest 20 cursor-predict entries:")
for entry in predict_entries[-20:]:
    print({
        "time": entry["time"],
        "dx": entry.get("dx"),
        "dy": entry.get("dy"),
        "sent": entry.get("sent"),
        "gain": entry.get("gain"),
        "rx": entry.get("rx"),
        "ry": entry.get("ry"),
    })
