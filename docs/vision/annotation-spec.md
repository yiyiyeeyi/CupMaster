# Spout-tip annotation specification

Status: Task 9A frozen feasibility specification
Accessed: 2026-09-17

## Unit and class

The annotation unit is one selected video frame with immutable `capture_session_id`, `video_id`, `frame_timestamp_ms`, camera angle band, kettle ID, and scene ID.

The only positive object class is:

```text
gooseneck_spout
```

A gooseneck spout is the narrow curved neck terminating in the outlet of a pour-over kettle. Kettle bodies, handles, hands, water streams, drippers, and ordinary kitchen objects are not instances of this class.

## Detection annotation

For each visible spout instance, record image-pixel coordinates:

```text
bbox:
  x_min
  y_min
  x_max
  y_max
```

The box tightly encloses the **visible spout / narrow neck region**, including the physical outlet. Do not include the entire kettle body merely because it is connected. If the neck merges into a visible body, stop at the visually meaningful transition from narrow neck to body. This provides local context while preventing the body's size and frequent off-frame position from dominating localization.

Rules:

- clip a partially off-frame spout box to the image boundary and set the relevant condition flag;
- include visible water only when it overlaps the physical metal/glass outline; do not expand the box down the stream;
- include a hand only where it occludes the spout; do not expand the box around the hand;
- do not infer or box a fully invisible spout;
- negative images have no object row/shape, not a dummy zero-area box.

## Required keypoint

```text
keypoint[0] = spout_tip
```

`spout_tip` is **the center of the physical terminal opening from which water exits**. It is not “the sharpest point,” the end of a highlight, the end of the water stream, the nearest point to the dripper, or a bounding-box corner.

Placement rules:

- when the opening is elliptical, place the point at the apparent center of that opening;
- when the opening has a thick rim, use the center of the aperture, not the outer rim;
- when water is flowing but the rim remains locatable, annotate the physical aperture beneath/behind the stream and mark partial occlusion;
- when only the neck centerline is visible and the terminal opening cannot be located within the uncertainty rule below, mark `not_visible` rather than extrapolating;
- keep the point within or on the visible-spout bbox. A violation is a QA error unless the box itself is corrected.

## Optional audit keypoint

`spout_neck_base` is not part of the first training schema. On the designated audit subset only, it means the center of the neck cross-section at the visually identifiable transition between the narrow curved neck and the kettle body. If that transition is off-frame, hidden, or gradual enough that no repeatable cross-section exists, mark it `not_visible`; never guess along the curve.

Promote this keypoint only after the Task 9B agreement audit. If promoted, orientation is computed by the geometry layer as:

```text
orientation_vector = spout_tip - spout_neck_base
```

## Visibility states and training mapping

| CupMaster state | Definition | Annotator action | YOLO-style visibility mapping |
| --- | --- | --- | --- |
| `visible` | aperture boundary is directly locatable | place point | `v=2` |
| `partially_occluded` | aperture is partly hidden by water, hand, steam, frame edge, or blur, but its center is locatable within the uncertainty rule | place point and condition flags | `v=1` |
| `not_visible` | aperture center cannot be located without extrapolation | no usable point; retain metadata only if the frame is kept | `v=0`, coordinates `0,0` for formats requiring coordinates |

Before export, verify the chosen trainer's exact visibility-loss semantics. The mapping above follows the common COCO/Ultralytics convention documented for optional keypoint visibility; it must not be silently reinterpreted by a converter.

## Ambiguity disposition

Use an uncertainty guide equal to 2% of the annotated dripper diameter when a dripper calibration is available; otherwise use 8 pixels at the normalized review resolution. This is a labeling consistency guide, not a model KPI.

| Condition | Disposition |
| --- | --- |
| Mild motion blur; aperture center remains inside the uncertainty guide | Annotate; `partially_occluded`; flag `motion_blur` |
| Severe blur; annotator would need to extrapolate beyond the guide | Keep only if valuable as a negative/failure frame; keypoint `not_visible`; otherwise skip |
| Water covers part of the rim but physical opening is locatable | Annotate; `partially_occluded`; flag `water_occlusion` |
| Water/reflection makes opening boundary unresolvable | keypoint `not_visible`; do not mark stream endpoint |
| Hand covers part of the tip but center is locatable | Annotate; `partially_occluded`; flag `hand_occlusion` |
| Hand fully covers aperture | keypoint `not_visible`; keep bbox only if enough spout is visible and the format supports it |
| Tip exits frame but part of neck remains | bbox clipped; keypoint `not_visible`; flag `tip_out_of_frame` |
| Tip is exactly on frame boundary and locatable | Annotate on boundary; `partially_occluded`; flag `tip_on_frame_edge` |
| Reflection creates a second apparent edge | Annotate only the physical aperture supported by adjacent frames; if still unresolved, `not_visible` |
| Steam reduces contrast but point is repeatable within the guide | Annotate; visibility according to directness; flag `steam` |
| Two kettles/spouts visible | annotate each real visible instance; mark the actively pouring instance in metadata, not as a different class |
| Non-gooseneck object resembles a spout | no positive annotation; retain as a hard negative |

Annotators may inspect immediately adjacent frames to identify the same physical opening, but they must place the point on evidence in the target frame, not copy a trajectory through an invisible frame.

## Negative-frame rules

Include and explicitly tag frames containing dripper only, hand only, coffee bed only, kettle body with no visible spout, non-gooseneck kitchen objects, and empty setups. They contain no `gooseneck_spout` annotation. A frame with a fully hidden spout may be used as a negative only if no visible neck evidence remains; otherwise preserve it as an ignored/visibility-zero positive according to trainer capability.

## Coordinate systems

Annotations and model output use original image pixels. Normalized label formats divide x by image width and y by image height only during export.

The future geometry layer uses the aligned dripper:

```text
dripper_center_px = (cx, cy)
dripper_radius_px = R
canonical_tip = ((tip_x - cx) / R, (tip_y - cy) / R)
```

Thus the dripper center is `(0, 0)`, the rim radius is `1.0`, and an image-space point may become `(0.3, -0.2)`. Optional polar output is `r = sqrt(x² + y²)` and `theta = atan2(y, x)` with image-y convention explicitly converted by the geometry layer. The model never emits recipe/canonical coordinates directly.

## Annotation QA

- Double-annotate at least 10% of positives, stratified by material and ambiguity.
- Resolve disagreements against the physical-aperture definition, not by averaging blindly.
- Report inter-annotator Euclidean distance normalized by dripper radius and visibility-state agreement.
- Validate bbox ordering, in-frame bounds, tip-in-box, class IDs, manifest references, and absence of cross-split duplicate/near-duplicate frames.
- Review every `not_visible` and skipped frame in a short adjudication pass so difficult positives are not silently removed.
- Preserve raw annotations and deterministic export scripts; do not edit generated trainer labels by hand.

## Source basis

- [Ultralytics pose dataset format](https://docs.ultralytics.com/datasets/pose/) — accessed 2026-09-17; documentation/code AGPL-3.0; used only to understand bbox/keypoint/visibility fields.
- [COCO keypoint evaluation format](https://cocodataset.org/#format-data) — accessed 2026-09-17; dataset terms are separate; used as the visibility-convention precedent.
- [SPILL repository](https://github.com/Louadria/SPILL) — accessed 2026-09-17; code MIT, dataset/weights separately unverified; used as a semantic-keypoint architecture precedent only.
