#!/usr/bin/env python3
"""Task 9C-5.16 frozen versus partial fine-tuning study.

Private data stays local. The script has an explicit session allowlist and
continues the exact corrected frozen checkpoints with a predeclared, modest
final-stage adaptation schedule.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large


SEED = 20260929
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13, 15, 16, 17, 18, 19))
TARGET_SESSIONS = tuple(f"session-{value:03d}" for value in (15, 16, 17, 18, 19))
FORBIDDEN_SESSIONS = {"session-014", *(f"session-{value:03d}" for value in range(5, 11))}
SPLIT_INDEX = 13
HEAD_LR = 2e-4
BACKBONE_LR = 1e-5
WEIGHT_DECAY = 1e-4
BATCH_SIZE = 16
DEFAULT_EPOCHS = 10


def load_module(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    return parser.parse_args()


def count_parameters(module: nn.Module) -> int:
    return sum(parameter.numel() for parameter in module.parameters())


def subset(items: list[Any], ids: set[str]) -> tuple[list[Any], list[int]]:
    indices = [index for index, item in enumerate(items) if item.frame["frameId"] in ids]
    return [items[index] for index in indices], indices


def tensor_subset(values: torch.Tensor, indices: list[int]) -> torch.Tensor:
    return values[torch.tensor(indices, dtype=torch.long)]


def extract_prefix(prefix: nn.Module, examples: list[Any]) -> torch.Tensor:
    outputs = []
    loader = DataLoader(torch.stack([example.tensor for example in examples]), batch_size=BATCH_SIZE)
    prefix.eval()
    with torch.inference_mode():
        for tensors in loader:
            outputs.append(prefix(tensors))
    return torch.cat(outputs)


def make_targets(heatmap: Any, examples: list[Any]) -> tuple[torch.Tensor, torch.Tensor]:
    presence = torch.tensor([example.presence for example in examples], dtype=torch.float32)
    heatmaps = torch.stack([
        heatmap.gaussian_heatmap(example.point_target)
        if example.presence else torch.zeros(heatmap.HEATMAP_SIZE, heatmap.HEATMAP_SIZE)
        for example in examples
    ])
    return presence, heatmaps


def load_initial_head(heatmap: Any, path: Path) -> nn.Module:
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    head = heatmap.PresenceHeatmapHead(960)
    head.load_state_dict(checkpoint["stateDict"])
    return head


def train_partial(
    baseline: Any, heatmap: Any, initial_tail: nn.Module, initial_head_path: Path,
    prefix_features: torch.Tensor, examples: list[Any], epochs: int, seed: int,
    checkpoint_path: Path,
) -> tuple[nn.Module, nn.Module, dict[str, Any]]:
    tail = copy.deepcopy(initial_tail)
    head = load_initial_head(heatmap, initial_head_path)
    if checkpoint_path.is_file():
        saved = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        tail.load_state_dict(saved["tailStateDict"])
        head.load_state_dict(saved["headStateDict"])
        tail.eval()
        head.eval()
        return tail, head, {
            "loaded": True, "epochs": saved["epochs"], "seed": saved["seed"],
            "elapsedSeconds": saved["elapsedSeconds"], "checkpoint": str(checkpoint_path),
            "checkpointSha256": baseline.sha256_file(checkpoint_path),
        }

    presence, heatmaps = make_targets(heatmap, examples)
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(
        TensorDataset(prefix_features, presence, heatmaps), batch_size=BATCH_SIZE,
        shuffle=True, generator=generator,
    )
    torch.manual_seed(seed)
    optimizer = torch.optim.AdamW([
        {"params": tail.parameters(), "lr": BACKBONE_LR},
        {"params": head.parameters(), "lr": HEAD_LR},
    ], weight_decay=WEIGHT_DECAY)
    history = []
    started = time.perf_counter()
    for epoch in range(1, epochs + 1):
        tail.train()
        head.train()
        totals, presences, localizations = [], [], []
        for batch_features, batch_presence, batch_heatmaps in loader:
            optimizer.zero_grad(set_to_none=True)
            presence_logits, heatmap_logits = head(tail(batch_features))
            loss, presence_loss, localization_loss = heatmap.separate_loss(
                presence_logits, heatmap_logits, batch_presence, batch_heatmaps,
            )
            loss.backward()
            optimizer.step()
            totals.append(float(loss.detach()))
            presences.append(float(presence_loss.detach()))
            localizations.append(float(localization_loss.detach()))
        history.append({
            "epoch": epoch, "totalLoss": statistics.fmean(totals),
            "presenceBce": statistics.fmean(presences),
            "positiveOnlyHeatmapCrossEntropy": statistics.fmean(localizations),
        })
    elapsed = time.perf_counter() - started
    tail.eval()
    head.eval()
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "tailStateDict": copy.deepcopy(tail.state_dict()),
        "headStateDict": copy.deepcopy(head.state_dict()),
        "epochs": epochs, "seed": seed, "elapsedSeconds": elapsed,
        "backboneLearningRate": BACKBONE_LR, "headLearningRate": HEAD_LR,
    }, checkpoint_path)
    return tail, head, {
        "loaded": False, "epochs": epochs, "seed": seed, "elapsedSeconds": elapsed,
        "history": history, "checkpoint": str(checkpoint_path),
        "checkpointSha256": baseline.sha256_file(checkpoint_path),
    }


def evaluate(
    baseline: Any, heatmap: Any, manual: Any, annotations: dict[str, dict[str, Any]],
    tail: nn.Module, head: nn.Module, prefix_features: torch.Tensor, examples: list[Any],
) -> tuple[list[dict[str, Any]], torch.Tensor]:
    presence_outputs, heatmap_outputs, spatial_outputs = [], [], []
    tail.eval()
    head.eval()
    with torch.inference_mode():
        for start in range(0, len(examples), BATCH_SIZE):
            spatial = tail(prefix_features[start:start + BATCH_SIZE])
            presence_logits, heatmap_logits = head(spatial)
            spatial_outputs.append(spatial)
            presence_outputs.append(presence_logits)
            heatmap_outputs.append(heatmap_logits)
    _, records = heatmap.evaluate_fold(
        baseline, manual, examples, annotations,
        torch.cat(presence_outputs), torch.cat(heatmap_outputs),
    )
    return records, torch.cat(spatial_outputs)


def tip_quality(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [record for record in records if record["positive"]]
    errors = [float(record["argmax"]["normalizedError"]) for record in positives]
    ordered = sorted(errors)
    p90 = ordered[min(len(ordered) - 1, math.ceil(0.9 * len(ordered)) - 1)] if ordered else None
    return {
        "count": len(errors), "mean": statistics.fmean(errors) if errors else None,
        "median": statistics.median(errors) if errors else None, "p90": p90,
        "max": max(errors) if errors else None,
        "proportionAtOrBelow": {
            str(limit): sum(error <= limit for error in errors) / len(errors) if errors else None
            for limit in (0.02, 0.06, 0.20)
        },
        "presenceGatedProportionAtOrBelow": {
            str(limit): sum(
                record["presenceAccepted"] and float(record["argmax"]["normalizedError"]) <= limit
                for record in positives
            ) / len(positives) if positives else None
            for limit in (0.02, 0.06, 0.20)
        },
    }


def add_tip_quality(summary: dict[str, Any], records: list[dict[str, Any]]) -> None:
    summary["tipQuality"] = tip_quality(records)
    for session, value in summary["bySession"].items():
        value["tipQuality"] = tip_quality([record for record in records if record["session"] == session])


def difficult_domain_summary(
    records: list[dict[str, Any]], annotations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    groups = {
        "darkReflective": {"dark", "reflective"},
        "whiteHighlight": {"white", "highlight"},
        "lowContrast": {"lowContrast"},
        "shortVisible": {"shortVisible"},
    }
    output = {}
    for name, tags in groups.items():
        selected = []
        for record in records:
            hints = set(annotations[record["frameId"]].get("selectionMetadata", {}).get("appearanceHints", []))
            if record["positive"] and hints & tags:
                selected.append(record)
        output[name] = {
            "count": len(selected),
            "recall": sum(record["presenceAccepted"] for record in selected) / len(selected) if selected else None,
            "tipQuality": tip_quality(selected),
        }
    return output


def representation_metrics(features: torch.Tensor, examples: list[Any]) -> dict[str, Any]:
    pooled = features.mean(dim=(2, 3))
    normalized = torch.nn.functional.normalize(pooled, dim=1)
    similarities = normalized @ normalized.T
    similarities.fill_diagonal_(-2)
    nearest = similarities.argmax(dim=1).tolist()
    labels = [bool(example.presence) for example in examples]
    sessions = [example.frame["sessionId"] for example in examples]
    cross_session = sum(sessions[index] != sessions[other] for index, other in enumerate(nearest)) / len(nearest)
    same_label_cross_session = sum(
        sessions[index] != sessions[other] and labels[index] == labels[other]
        for index, other in enumerate(nearest)
    ) / len(nearest)
    within_class, between_class = [], []
    for left in range(len(examples)):
        for right in range(left + 1, len(examples)):
            if sessions[left] == sessions[right]:
                continue
            distance = 1 - float(similarities[left, right])
            (within_class if labels[left] == labels[right] else between_class).append(distance)
    centered = pooled - pooled.mean(dim=0, keepdim=True)
    _, _, vectors = torch.pca_lowrank(centered, q=2, center=False)
    projection = centered @ vectors[:, :2]
    return {
        "crossSessionNearestNeighborRate": cross_session,
        "sameLabelCrossSessionNearestNeighborRate": same_label_cross_session,
        "crossSessionWithinClassCosineDistance": statistics.fmean(within_class),
        "crossSessionBetweenClassCosineDistance": statistics.fmean(between_class),
        "classSeparationMargin": statistics.fmean(between_class) - statistics.fmean(within_class),
        "projection": [
            {"frameId": example.frame["frameId"], "session": example.frame["sessionId"],
             "positive": bool(example.presence), "x": float(point[0]), "y": float(point[1])}
            for example, point in zip(examples, projection, strict=True)
        ],
    }


def benchmark_full_finetune(
    heatmap: Any, examples: list[Any], total_steps: int,
) -> dict[str, Any]:
    model = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2).features
    head = heatmap.PresenceHeatmapHead(960)
    tensors = torch.stack([example.tensor for example in examples[:4]])
    presence, heatmaps = make_targets(heatmap, examples[:4])
    optimizer = torch.optim.AdamW(
        list(model.parameters()) + list(head.parameters()), lr=BACKBONE_LR, weight_decay=WEIGHT_DECAY,
    )
    started = time.perf_counter()
    optimizer.zero_grad(set_to_none=True)
    presence_logits, heatmap_logits = head(model(tensors))
    loss, _, _ = heatmap.separate_loss(presence_logits, heatmap_logits, presence, heatmaps)
    loss.backward()
    optimizer.step()
    elapsed = time.perf_counter() - started
    # Scale the measured batch-4 step conservatively to the actual batch-16 schedule.
    estimated_seconds = elapsed * 4 * total_steps
    return {
        "benchmarkBatchSize": 4, "measuredStepSeconds": elapsed,
        "plannedBatch16Steps": total_steps, "estimatedTotalSeconds": estimated_seconds,
        "estimatedTotalHours": estimated_seconds / 3600,
        "decision": "omitted_as_cpu_impractical" if estimated_seconds > 7200 else "practical",
    }


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    scripts = repo_root / "scripts/vision"
    baseline = load_module(scripts / "task9c2-baseline.py", "task9c2_for_task9c5_16")
    data_module = load_module(scripts / "task9c5-3-targeted-retraining.py", "task9c5_3_for_task9c5_16")
    manual = load_module(scripts / "task9c5-5-manual-roi-localization.py", "task9c5_5_for_task9c5_16")
    heatmap = load_module(scripts / "task9c5-7-presence-heatmap.py", "task9c5_7_for_task9c5_16")
    bbox = load_module(scripts / "task9c5-8-standalone-spout.py", "task9c5_8_for_task9c5_16")
    targeted = load_module(scripts / "task9c5-13-targeted-retraining.py", "task9c5_13_for_task9c5_16")
    diagnostic = load_module(scripts / "task9c5-15-presence-diagnostic.py", "task9c5_15_for_task9c5_16")
    baseline.set_determinism()

    corrected = work_root / "datasets/task-9c5-11/annotations/task-9c5-11-targeted-v1.corrected.normalized.json"
    frames, annotations, dataset = targeted.load_pool(repo_root, work_root, data_module, corrected)
    if set(frame["sessionId"] for frame in frames) != set(SESSIONS):
        raise RuntimeError("Unexpected development session set")
    if any(frame["sessionId"] in FORBIDDEN_SESSIONS for frame in frames):
        raise RuntimeError("Forbidden session entered study")
    frozen_results = json.loads((work_root / "eval/task-9c5-15/results.json").read_text(encoding="utf-8"))
    frozen_task15_predictions = json.loads((
        work_root / "eval/task-9c5-15/predictions.json"
    ).read_text(encoding="utf-8"))
    frozen_loso_payload = json.loads((
        work_root / "eval/task-9c5-14b/predictions.json"
    ).read_text(encoding="utf-8"))
    frozen_loso_records = [
        record for session in SESSIONS
        for record in frozen_loso_payload["targeted"][session]["presenceTip"]
    ]
    split = frozen_results["split"]

    train_examples = targeted.build_examples(
        baseline, manual, bbox, data_module, repo_root, work_root, frames, annotations,
        targeted.AUGMENTATIONS,
    )
    eval_examples = targeted.build_examples(
        baseline, manual, bbox, data_module, repo_root, work_root, frames, annotations, ("identity",),
    )
    pretrained = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2).features
    prefix = nn.Sequential(*list(pretrained.children())[:SPLIT_INDEX]).eval()
    initial_tail = nn.Sequential(*list(pretrained.children())[SPLIT_INDEX:]).eval()
    for parameter in prefix.parameters():
        parameter.requires_grad = False
    print("Extracting reusable frozen-prefix features", flush=True)
    train_prefix = extract_prefix(prefix, train_examples)
    eval_prefix = extract_prefix(prefix, eval_examples)

    model_root = work_root / "models/task-9c5-16"
    eval_root = work_root / "eval/task-9c5-16"
    eval_root.mkdir(parents=True, exist_ok=True)
    all_ids = {frame["frameId"] for frame in frames}
    training: dict[str, Any] = {}

    print("Partial fine-tune: train-fit", flush=True)
    tail, head, info = train_partial(
        baseline, heatmap, initial_tail,
        work_root / "models/task-9c5-15/train-fit/presence-heatmap.pt",
        train_prefix, train_examples, args.epochs, SEED,
        model_root / "train-fit/partial.pt",
    )
    training["trainFit"] = info
    partial_train_fit, partial_train_fit_features = evaluate(
        baseline, heatmap, manual, annotations, tail, head, eval_prefix, eval_examples,
    )

    in_train_ids = set(split["trainFrameIds"])
    in_test_ids = set(split["testFrameIds"])
    in_train_examples, in_train_indices = subset(train_examples, in_train_ids)
    in_eval_examples, in_eval_indices = subset(eval_examples, in_test_ids)
    print("Partial fine-tune: in-domain", flush=True)
    in_tail, in_head, info = train_partial(
        baseline, heatmap, initial_tail,
        work_root / "models/task-9c5-15/in-domain/presence-heatmap.pt",
        tensor_subset(train_prefix, in_train_indices), in_train_examples,
        args.epochs, SEED, model_root / "in-domain/partial.pt",
    )
    training["inDomain"] = info
    partial_in_domain, _ = evaluate(
        baseline, heatmap, manual, annotations, in_tail, in_head,
        tensor_subset(eval_prefix, in_eval_indices), in_eval_examples,
    )

    loso_records = []
    for fold_index, heldout in enumerate(SESSIONS):
        train_ids = {frame["frameId"] for frame in frames if frame["sessionId"] != heldout}
        eval_ids = {frame["frameId"] for frame in frames if frame["sessionId"] == heldout}
        fold_train, fold_train_indices = subset(train_examples, train_ids)
        fold_eval, fold_eval_indices = subset(eval_examples, eval_ids)
        print(f"Partial fine-tune LOSO {heldout} ({fold_index + 1}/{len(SESSIONS)})", flush=True)
        fold_tail, fold_head, info = train_partial(
            baseline, heatmap, initial_tail,
            work_root / f"models/task-9c5-14b/targeted/{heldout}/presence-heatmap.pt",
            tensor_subset(train_prefix, fold_train_indices), fold_train,
            args.epochs, SEED + 100 + fold_index * 10,
            model_root / f"loso/{heldout}/partial.pt",
        )
        training[heldout] = info
        records, _ = evaluate(
            baseline, heatmap, manual, annotations, fold_tail, fold_head,
            tensor_subset(eval_prefix, fold_eval_indices), fold_eval,
        )
        loso_records.extend(records)
    if {record["frameId"] for record in loso_records} != all_ids:
        raise RuntimeError("Partial LOSO predictions do not cover exact eligible pool")

    partial = {
        "trainFit": diagnostic.summarize(partial_train_fit, annotations, SESSIONS),
        "inDomain": diagnostic.summarize(partial_in_domain, annotations, TARGET_SESSIONS),
        "loso": diagnostic.summarize(loso_records, annotations, SESSIONS),
    }
    add_tip_quality(partial["trainFit"], partial_train_fit)
    add_tip_quality(partial["inDomain"], partial_in_domain)
    add_tip_quality(partial["loso"], loso_records)
    partial["loso"]["difficultDomains"] = difficult_domain_summary(loso_records, annotations)

    frozen = {
        "trainFit": frozen_results["trainFit"], "inDomain": frozen_results["inDomain"],
        "loso": frozen_results["losoReference"],
    }
    add_tip_quality(frozen["trainFit"], frozen_task15_predictions["trainFit"])
    add_tip_quality(frozen["inDomain"], frozen_task15_predictions["inDomain"])
    add_tip_quality(frozen["loso"], frozen_loso_records)
    frozen["loso"]["difficultDomains"] = difficult_domain_summary(frozen_loso_records, annotations)

    with torch.inference_mode():
        frozen_eval_features = initial_tail(eval_prefix)
    representation = {
        "frozen": representation_metrics(frozen_eval_features, eval_examples),
        "partialTrainFit": representation_metrics(partial_train_fit_features, eval_examples),
    }
    projection = {
        key: value.pop("projection") for key, value in representation.items()
    }

    total_steps = math.ceil(len(train_examples) / BATCH_SIZE) * args.epochs
    total_steps += math.ceil(len(in_train_examples) / BATCH_SIZE) * args.epochs
    for heldout in SESSIONS:
        fold_count = sum(frame["sessionId"] != heldout for frame in frames) * len(targeted.AUGMENTATIONS)
        total_steps += math.ceil(fold_count / BATCH_SIZE) * args.epochs
    full_benchmark = benchmark_full_finetune(heatmap, train_examples, total_steps)

    head_parameters = count_parameters(heatmap.PresenceHeatmapHead(960))
    prefix_parameters = count_parameters(prefix)
    tail_parameters = count_parameters(initial_tail)
    output = {
        "status": "complete",
        "configuration": {
            "architecture": "MobileNetV3-large ImageNet-1K V2 + separate presence/heatmap head",
            "partialUnfrozenBlocks": list(range(SPLIT_INDEX, 17)),
            "epochs": args.epochs, "backboneLearningRate": BACKBONE_LR,
            "headLearningRate": HEAD_LR, "weightDecay": WEIGHT_DECAY,
            "presenceThreshold": 0.5, "manualSearchPreset": "balanced",
            "checkpointPolicy": "paired continuation from exact frozen fixed-final checkpoint; fixed final epoch",
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "parameters": {
            "backbone": prefix_parameters + tail_parameters, "head": head_parameters,
            "total": prefix_parameters + tail_parameters + head_parameters,
            "frozenTrainable": head_parameters,
            "partialTrainable": tail_parameters + head_parameters,
            "fullTrainable": prefix_parameters + tail_parameters + head_parameters,
        },
        "dataset": dataset, "split": split,
        "frozen": frozen,
        "partial": partial, "training": training,
        "trainingElapsedSeconds": sum(value["elapsedSeconds"] for value in training.values()),
        "fullFineTuneDiagnostic": full_benchmark,
        "representation": representation,
    }
    (eval_root / "results.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    (eval_root / "predictions.json").write_text(json.dumps({
        "partial": {"trainFit": partial_train_fit, "inDomain": partial_in_domain, "loso": loso_records},
    }, indent=2), encoding="utf-8")
    (eval_root / "projection.json").write_text(json.dumps(projection, indent=2), encoding="utf-8")
    print(json.dumps({
        "results": str(eval_root / "results.json"),
        "partialTrainFit": partial["trainFit"]["overall"],
        "partialInDomain": partial["inDomain"]["overall"],
        "partialLoso": partial["loso"]["overall"],
        "elapsedSeconds": output["trainingElapsedSeconds"],
        "fullFineTune": full_benchmark,
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()
