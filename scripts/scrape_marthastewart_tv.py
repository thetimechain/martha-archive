#!/usr/bin/env python3
"""Extract per-episode segment / recipe / guest / business data from the
public marthastewart.tv video pages.

The pages are server-rendered (no login needed to read metadata). Each video
page exposes, in its <head>, an og:title like
    "MSL Season 8 Episode 024V - Make Friends with Your Oven ..."
and an og:description that is a bullet list of the episode's segments, e.g.
    - Red Berry Risotto Oatmeal
    - Kelmscott Rare Breeds
    - FT - Lunaform Pottery Part 1 and 2

That segment list is the richest public source of the recipes, guests,
businesses, and locations featured in each episode — none of which the current
episodes.json captures. This script harvests it and applies light heuristic
entity extraction. (An LLM pass on the collected segments would refine the
entity typing further; see docs/research/transcripts.md.)

Usage:
    python3 scrape_marthastewart_tv.py --limit 40            # sample
    python3 scrape_marthastewart_tv.py --all --out out.json  # full catalog

Only the standard library is used; network fetches go through `curl` so the
environment's proxy settings are honored.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SITEMAP = "https://www.marthastewart.tv/sitemap.xml"

# Segment-type codes used in the rundowns (GT=Garden Tip, FT=Field Trip,
# COW/TOW/CU=segment slots, GT/HK etc.). Stripped before entity detection.
CODE_RE = re.compile(r"\b(GT|FT|COW|TOW|CU|HK|DIY|SS|QT|AL)\b", re.I)

BUSINESS_SUFFIXES = (
    "pottery", "farm", "farms", "rare breeds", "gardens", "garden", "nursery",
    "vineyard", "vineyards", "orchard", "orchards", "bakery", "kitchen",
    "studio", "studios", "company", "co.", "inc.", "restaurant", "cafe",
    "shop", "store", "mill", "ranch", "creamery", "dairy", "winery",
    "greenhouse", "atelier", "workshop", "gallery",
)


# Optional marthastewart.tv session cookie, to reach subscriber-gated pages.
# Get it from your browser's dev tools while logged in (the `_session` cookie),
# and pass --cookie "_session=..." or set MSTV_COOKIE.
COOKIE = os.environ.get("MSTV_COOKIE", "")


def fetch(url, timeout=40):
    cmd = ["curl", "-sS", "--max-time", str(timeout)]
    if COOKIE:
        cmd += ["-H", f"Cookie: {COOKIE}"]
    cmd.append(url)
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return out.stdout
    except subprocess.CalledProcessError:
        return None


def meta(h, prop, attr="property"):
    m = re.search(rf'<meta {attr}="{re.escape(prop)}" content="(.*?)"\s*/?>', h, re.S | re.I)
    return html.unescape(m.group(1)).strip() if m else None


TITLE_RE = re.compile(
    r"(?:MSL|MSS)\s+Season\s+(\d+)\s+Episode\s+(\d+)\w*\s*-\s*(.*?)(?:\s*-\s*Martha Stewart TV)?$",
    re.I,
)


def parse_video(url):
    h = fetch(url)
    if not h:
        return None
    og_title = meta(h, "og:title") or ""
    og_desc = meta(h, "og:description") or meta(h, "description", "name") or ""
    segments = [
        re.sub(r"^[-•]\s*", "", ln).strip()
        for ln in og_desc.splitlines()
        if ln.strip() and ln.strip() not in {"-", "•"}
    ]
    season = episode = None
    title = og_title.replace(" - Martha Stewart TV", "").strip()
    m = TITLE_RE.search(og_title)
    if m:
        season, episode, title = int(m.group(1)), int(m.group(2)), m.group(3).strip()

    businesses, guests, recipes = [], [], []
    for seg in segments:
        clean = CODE_RE.sub("", seg).strip(" -")
        low = clean.lower()
        is_ft = bool(re.match(r"^\s*FT\b", seg, re.I)) or " ft " in f" {seg.lower()} " \
            or "field trip" in low
        # Guest: "with <Name>" or an honorific
        gm = re.search(r"\bwith\s+((?:Mrs?\.|Dr\.|Chef|Ms\.)?\s?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})", clean)
        if gm:
            guests.append(gm.group(1).strip())
        # Business / location: FT field trips, or names ending in a business word
        if is_ft or any(low.endswith(sfx) or low.endswith(sfx + "s") for sfx in BUSINESS_SUFFIXES) \
                or any(f" {sfx}" in f" {low}" for sfx in ("pottery", "rare breeds", "farm", "vineyard", "orchard", "creamery")):
            biz = re.sub(r"^(FT|Field Trip)\s*(to\s+)?-?\s*", "", clean, flags=re.I)
            biz = re.sub(r"\s+Part\s+\d+.*$", "", biz, flags=re.I).strip()
            if biz:
                businesses.append(biz)
        elif not gm:
            recipes.append(clean)

    return {
        "code": url.rsplit("/", 1)[-1],
        "url": url,
        "season": season,
        "episode": episode,
        "title": title,
        "segments": segments,
        "recipes": recipes,
        "guests": sorted(set(guests)),
        "businesses": sorted(set(businesses)),
    }


def video_urls(limit=None, show_prefix="msl"):
    # The 2015-era sitemap lists the plain /videos/<code> URLs, but the current
    # site 404s those and serves the live page at the "-hi-res" variant. Derive
    # the live URLs by appending the suffix.
    sm = fetch(SITEMAP)
    urls = re.findall(r"https://www\.marthastewart\.tv/[^<\s]+/videos/[a-z0-9]+", sm or "")
    seen, out = set(), []
    for u in urls:
        if f"/videos/{show_prefix}" not in u or u in seen:
            continue
        seen.add(u)
        out.append(u + "-hi-res")
    return out[:limit] if limit else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--prefix", default="msl", help="video-code prefix to include (msl, mss, ...)")
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--cookie", default="", help="marthastewart.tv session cookie for gated pages")
    ap.add_argument("--out", default=os.path.join(HERE, "marthastewart_segments.json"))
    args = ap.parse_args()

    global COOKIE
    if args.cookie:
        COOKIE = args.cookie

    urls = video_urls(None if args.all else args.limit, args.prefix)
    print(f"Fetching {len(urls)} video pages …", file=sys.stderr)
    rows = []
    for i, u in enumerate(urls, 1):
        row = parse_video(u)
        if row and row["segments"]:
            rows.append(row)
        if i % 10 == 0:
            print(f"  {i}/{len(urls)}", file=sys.stderr)
        time.sleep(args.delay)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    seg = sum(len(r["segments"]) for r in rows)
    biz = sum(len(r["businesses"]) for r in rows)
    gue = sum(len(r["guests"]) for r in rows)
    print(f"\nDone: {len(rows)} episodes, {seg} segments, {biz} businesses, {gue} guests -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
