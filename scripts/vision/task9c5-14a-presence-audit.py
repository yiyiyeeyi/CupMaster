#!/usr/bin/env python3
"""Build the private Task 9C-5.14A presence-semantics audit package.

The classifications are the result of human-readable visual inspection. This
script verifies their identities against the normalized annotations and creates
a review sheet only for possible mislabels. It never edits source annotations.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


POSSIBLE_MISLABELS = {
    "session-016-t002000": "Clearly identifiable circular physical outlet at the upper image edge; bbox and tip are absent.",
    "session-019-t000000": "Reflective physical outlet is identifiable at the top edge with water off; bbox and tip are absent.",
    "session-019-t000500": "Reflective physical outlet is clearly identifiable at the top edge with water off; bbox and tip are absent.",
}

TRUE_NEGATIVE_CONTENT = {
    "session-015-t123500": "hand, wet bed, and reflections; no identifiable outlet",
    "session-016-t096000": "foam/wet bed and reflections; outlet absent",
    "session-016-t124000": "foam/wet bed and reflections; outlet absent",
    "session-016-t150000": "wet bed and reflections; outlet absent",
    "session-016-t028000": "rim, wet bed, foam, and reflections; outlet absent",
    "session-016-t066000": "rim, wet bed, foam, and reflections; outlet absent",
    "session-016-t132000": "rim, wet bed, foam, and reflections; outlet absent",
    "session-016-t164000": "hand/kettle body and wet bed; physical outlet absent",
    "session-016-t174000": "hand and server; no spout outlet",
    "session-017-t002000": "hand and whisk/tool over dry bed; no spout outlet",
    "session-017-t022000": "foam/wet bed and reflections; no spout outlet",
    "session-017-t000000": "hand and whisk/tool; no spout outlet",
    "session-017-t012000": "hand, rim, wet bed, and foam; no spout outlet",
    "session-017-t016000": "hand, rim, wet bed, and reflections; no spout outlet",
    "session-017-t024000": "rim, wet bed, foam, and reflections; no spout outlet",
    "session-017-t032000": "hand and server; no spout outlet",
    "session-018-t014000": "hand, rim, and wet bed; no spout outlet",
    "session-018-t026000": "rim, wet bed, foam, and reflections; no spout outlet",
    "session-018-t042000": "rim, wet bed, foam, and reflections; no spout outlet",
    "session-018-t068000": "hand, rim, wet bed, and reflections; no spout outlet",
    "session-018-t072000": "hand and server; no spout outlet",
    "session-019-t013000": "rim, wet bed, foam, and reflections; no spout outlet",
    "session-019-t025000": "rim, wet bed, foam, and reflections; no spout outlet",
    "session-019-t042000": "rim, wet bed, and reflections; no spout outlet",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    return parser.parse_args()


def render_review_sheet(records: list[dict[str, Any]], image_root: Path, destination: Path) -> None:
    width = 420
    label_height = 92
    cards = []
    font = ImageFont.load_default(size=16)
    for record in records:
        image = Image.open(image_root / record["filename"]).convert("RGB")
        scale = width / image.width
        resized = image.resize((width, round(image.height * scale)), Image.Resampling.LANCZOS)
        card = Image.new("RGB", (width, resized.height + label_height), "white")
        card.paste(resized, (0, 0))
        draw = ImageDraw.Draw(card)
        draw.multiline_text(
            (8, resized.height + 8),
            f"{record['frameId']}\ncurrent: intentional_negative | bbox: no | tip: no\nrecommended: human redraw bbox + tip",
            fill="black", font=font, spacing=4,
        )
        cards.append(card)
    sheet = Image.new("RGB", (width * len(cards), max(card.height for card in cards)), "#222222")
    for index, card in enumerate(cards):
        sheet.paste(card, (index * width, 0))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=92)


def main() -> None:
    args = parse_args()
    dataset_root = args.work_root.resolve() / "datasets/task-9c5-11"
    normalized_path = dataset_root / "annotations/task-9c5-11-targeted-v0.normalized.json"
    normalized = json.loads(normalized_path.read_text(encoding="utf-8"))
    negatives = [item for item in normalized["annotations"] if not item["objects"]]
    expected = set(POSSIBLE_MISLABELS) | set(TRUE_NEGATIVE_CONTENT)
    actual = {item["frameId"] for item in negatives}
    if len(negatives) != 27 or actual != expected:
        raise RuntimeError("Negative annotation identities changed; visual audit must be repeated")

    records = []
    for item in negatives:
        frame_id = item["frameId"]
        possible = frame_id in POSSIBLE_MISLABELS
        records.append({
            "frameId": frame_id,
            "filename": item["filename"],
            "sessionId": item["sessionId"],
            "timestampMs": item["timestampMs"],
            "classification": "POSSIBLE_MISLABEL" if possible else "TRUE_NEGATIVE",
            "currentKind": item["kind"],
            "tipPresent": False,
            "bboxPresent": False,
            "waterOnHint": item["selectionMetadata"]["waterOnHint"],
            "observedContent": POSSIBLE_MISLABELS.get(frame_id, TRUE_NEGATIVE_CONTENT.get(frame_id)),
            "recommendedHumanAction": "Review and draw one gooseneck_spout bbox plus one spout_tip" if possible else "No correction",
        })

    output_root = args.work_root.resolve() / "eval/task-9c5-14a"
    output_root.mkdir(parents=True, exist_ok=True)
    summary = {
        "status": "audit_complete_no_annotations_modified",
        "semantics": "physical identifiable spout/outlet visibility independent of water flow",
        "counts": {"total": 27, "trueNegative": 24, "possibleMislabel": 3, "ambiguous": 0},
        "records": records,
        "session014Accessed": False,
        "externalBenchmarkAccessed": False,
        "trainingPerformed": False,
    }
    (output_root / "negative-audit.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    review = [record for record in records if record["classification"] == "POSSIBLE_MISLABEL"]
    (output_root / "review-list.json").write_text(json.dumps(review, indent=2), encoding="utf-8")
    render_review_sheet(review, dataset_root / "annotation/images", output_root / "possible-mislabels-contact-sheet.jpg")
    print(json.dumps(summary["counts"], indent=2))


if __name__ == "__main__":
    main()
