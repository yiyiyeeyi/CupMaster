# Pour path annotation tool

Open `index.html` in a modern browser, choose a local video file, and annotate the dripper center, radius, and landing point of the water stream. The file is read locally in the browser; it is never uploaded. Use `[` and `]` or the step buttons to move by 0.1 seconds. Mark separate pours with different step IDs and start times. Exported JSON contains normalized `{ t, x, y }` points only.

The coordinate origin is the dripper center. One unit equals the filter radius; right and down are positive. `t` is seconds from the start time of that step. Leave gaps unmarked when water is not flowing. The exporter can smooth adjacent points while preserving gaps longer than 0.25 seconds.

## Video source and use

For the current 4:6-method teaching trace, the source is the local screen recording supplied by yiyi on 2026-11-05 (`螢幕錄製 2026-11-05 195623.mp4`). The recording shows a Tetsu Kasuya-branded tutorial; the original source URL was not supplied. Permission to redistribute the video was not granted. The recording, audio, frames, subtitles, logos, and screenshots stay outside Git. The committed artifact is limited to manually traced normalized path coordinates for an internal educational illustration of the 4:6 pour sequence. This repository does not claim rights to the source recording.

For every additional video, add its source, date, permission status, intended use, and trace JSON filename here before committing its path data.
