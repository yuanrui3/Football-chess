#!/usr/bin/env python3
"""Download, normalize and assemble the completed Runway Adam recordings.

Usage: python3 scripts/assemble-adam-commentary.py --results /absolute/results.json
The results file is private build input; temporary asset URLs never enter dist.
Each result accepts an HTTPS url or an absolute localPath from an asset export.
Generation is deliberately separate, so resuming this command spends no credits.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PROFILE = "loudnorm I=-16 TP=-1.5 LRA=11; mono 44100Hz 128kbps MP3"
ID = re.compile(r"^adam_[a-z0-9_]+$")


def atomic_json(path, value):
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(value, indent=2) + "\n")
    tmp.replace(path)


def probe(path):
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ], text=True))
    if not 1 <= duration <= 15:
        raise ValueError(f"Unexpected recording duration: {path.name} ({duration:.3f}s)")
    size = path.stat().st_size
    if size < 1000:
        raise ValueError(f"Empty recording: {path.name}")
    return {"durationMs": round(duration * 1000), "bytes": size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--plan", type=Path, default=ROOT / "docs/adam-commentary-plan.json")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--download-only", action="store_true",
                        help="Cache available recordings without emitting a partial playable catalog")
    args = parser.parse_args()
    if not args.results.is_absolute():
        parser.error("--results must be an absolute path")
    plan = json.loads(args.plan.read_text())
    results = json.loads(args.results.read_text())
    if isinstance(results, list):
        results = {row["id"]: row for row in results}
    recordings = {row["id"]: row for row in plan["recordings"]}
    if len(recordings) != len(plan["recordings"]) or any(not ID.fullmatch(key) for key in recordings):
        raise ValueError("Duplicate or unsafe recording IDs")
    used = {rid for group in ("events", "tactics") for entry in plan[group].values()
            for rid in entry["recordingIds"]}
    if used != set(recordings):
        raise ValueError("Plan must contain exactly its used recording IDs")
    missing = [rid for rid in recordings if not any(results.get(rid, {}).get(key)
               for key in ("url", "localPath"))]
    if missing and not args.download_only:
        raise ValueError(f"Missing completed audio results: {', '.join(missing)}")
    if args.download_only:
        recordings = {rid: record for rid, record in recordings.items() if rid not in missing}

    output = ROOT / "dist/audio/adam"
    output.mkdir(parents=True, exist_ok=True)
    cache_path = args.results.parent / "adam-build-cache.json"
    try:
        cache = json.loads(cache_path.read_text())
    except (OSError, ValueError):
        cache = {}
    lock = threading.Lock()
    completed = 0

    def make(item):
        nonlocal completed
        rid, record = item
        destination = output / f"{rid}.mp3"
        cached = cache.get(rid)
        metadata = None
        if cached and cached.get("profile") == PROFILE and destination.exists():
            measured = probe(destination)
            if measured["sha256"] == cached.get("sha256"):
                metadata = measured
        if metadata is None:
            local_path = results[rid].get("localPath")
            if local_path:
                raw = Path(local_path)
                if not raw.is_absolute() or not raw.is_file():
                    raise ValueError(f"Expected an existing absolute localPath for {rid}")
                if raw.resolve() == destination.resolve():
                    raise ValueError(f"Source and normalized output must differ for {rid}")
            else:
                url = results[rid].get("url")
                if not isinstance(url, str) or not url.startswith("https://"):
                    raise ValueError(f"Expected an HTTPS audio result for {rid}")
                raw = args.results.parent / f"{rid}.raw.mp3"
            normalized = output / f"{rid}.tmp.mp3"
            for attempt in range(0 if local_path else 3):
                try:
                    with urllib.request.urlopen(url, timeout=90) as response:
                        raw.write_bytes(response.read())
                    break
                except urllib.error.HTTPError as error:
                    if error.code not in (408, 429, 500, 502, 503, 504) or attempt == 2:
                        raise RuntimeError(f"Audio transfer failed for {rid}: HTTP {error.code}") from None
                    time.sleep(attempt + 1)
                except (OSError, TimeoutError) as error:
                    if attempt == 2:
                        raise RuntimeError(f"Audio transfer failed for {rid}: {type(error).__name__}") from None
                    time.sleep(attempt + 1)
            try:
                subprocess.run([
                    "ffmpeg", "-v", "error", "-i", str(raw), "-af",
                    "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100",
                    "-codec:a", "libmp3lame", "-b:a", "128k", "-y", str(normalized)
                ], check=True, capture_output=True)
                metadata = probe(normalized)
                normalized.replace(destination)
            finally:
                if not local_path:
                    raw.unlink(missing_ok=True)
                normalized.unlink(missing_ok=True)
        with lock:
            cache[rid] = {**metadata, "profile": PROFILE}
            atomic_json(cache_path, cache)
            completed += 1
            if completed % 25 == 0 or completed == len(recordings):
                print(f"Validated {completed}/{len(recordings)} Adam recordings", flush=True)
        return rid, {"id": rid, "text": record["text"], **metadata,
                     "path": f"./audio/adam/{rid}.mp3?v={metadata['sha256'][:12]}"}

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 6))) as pool:
        measured = dict(pool.map(make, recordings.items()))
    if args.download_only:
        print(json.dumps({"cached": len(measured), "missing": len(missing),
                          "catalogWritten": False}), flush=True)
        return
    definitions = {group: plan[group] for group in ("events", "tactics")}
    module = """/** Complete offline Adam library. Generated by scripts/assemble-adam-commentary.py. */
export const ADAM_COMMENTARY_RECORDING = Object.freeze(VOICE_METADATA);
const recordings = Object.freeze(Object.fromEntries(RECORDING_METADATA.map(record => [record.id,
  Object.freeze({...record, src:new URL(record.path, import.meta.url).href})])));
const definitions = DEFINITION_METADATA;
function catalog(entries) {
  return Object.freeze(Object.fromEntries(Object.entries(entries).map(([key, definition]) => {
    const choices = definition.recordingIds.map(id => Object.freeze({...recordings[id], key,
      voice:'Adam', delivery:definition.delivery, ready:true,
      ...(definition.snapshot === undefined ? {} : {snapshot:definition.snapshot})}));
    return [key, Object.freeze({...choices[0], ...(choices.length > 1 ? {variants:Object.freeze(choices)} : {})})];
  })));
}
export const ADAM_EVENT_CLIPS = catalog(definitions.events);
export const ADAM_TACTICAL_CLIPS = catalog(definitions.tactics);
"""
    module = module.replace("VOICE_METADATA", json.dumps({"provider": "Runway", **plan["voice"],
                            "generated": plan.get("created"), "encoding": PROFILE}))
    module = module.replace("RECORDING_METADATA", json.dumps(list(measured.values()), ensure_ascii=False, indent=2))
    module = module.replace("DEFINITION_METADATA", json.dumps(definitions, ensure_ascii=False, indent=2))
    (ROOT / "dist/adam-commentary-clips.js").write_text(module)
    provenance = {"voice": plan["voice"], "generated": plan.get("created"), "encoding": PROFILE,
                  "recordings": [{**row, "taskId": results[rid].get("taskId")}
                                 for rid, row in measured.items()],
                  "counts": {"recordings": len(measured), "events": len(plan["events"]),
                             "tactics": len(plan["tactics"]),
                             "durationSeconds": round(sum(row["durationMs"] for row in measured.values()) / 1000, 3)}}
    atomic_json(ROOT / "docs/adam-commentary-provenance.json", provenance)
    print(json.dumps(provenance["counts"]), flush=True)


if __name__ == "__main__":
    main()
