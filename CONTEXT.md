# Squawk — Pinned Vocabulary

Minted 2026-08-06 during the spec grilling. Use these terms exactly; do not coin synonyms.

- **Squawk** — the product: a Chrome extension for marking up live pages and screenshotting the result for AI coding-agent feedback. From aviation: a _squawk_ is the defect note a pilot files for the ground crew.
- **Session** — the live annotation state on one tab, from injection to teardown. Never persisted.
- **Overlay** — the single full-document SVG element that renders all annotations. A pure projection of the session model.
- **Palette** — the floating, draggable toolbar (tools, colors, widths, actions).
- **Stroke style** — the Session's selected solid, dashed, or dotted border/path pattern. Stroke Annotations snapshot it at creation; changing the Palette never restyles existing ink.
- **Fill style** — the Session's selected `none` or fully opaque `solid` interior for the next drawn rectangle or ellipse. Drawn shapes snapshot it at creation; Picker rectangles are always unfilled, and changing the Palette never restyles existing ink.
- **Annotation** — one immutable record in the session model: `rect`, `ellipse`, `arrow`, `pen`, `text`, or `label`.
- **Text box** — the normalized document-coordinate area established by a Text-tool drag: fixed wrap width plus dragged minimum height; its derived display height grows downward as wrapped lines require.
- **Label** — the selector tag annotation (`button#submit`) the element-picker drops at a picked box's top-left corner.
- **Armed tool** — the tool that currently owns pointer input on the Overlay. Exactly one of interact/select/rect/ellipse/arrow/pen/text/picker/eraser.
- **Interact mode** — the default, pass-through state: Overlay is `pointer-events: none`, and the page behaves as if Squawk were absent.
- **Select tool** — the dedicated Annotation-manipulation tool. It owns Overlay pointer input without changing Interact mode and permits exactly zero or one persistent Selection target.
- **Selection target** — the one movable unit owned by Select: one ordinary Annotation or one Picker pair. Every Annotation carries a stable `selectionTargetId`.
- **Picker pair** — the rectangle and Label created by one element-picker click. They retain distinct Annotation ids but share one Selection target and always move together.
- **Move draft** — transient Session state for one active translation: owning pointer, Selection target, original Annotation payloads, and current document-coordinate delta.
- **Op** — one history-stack entry (`add`, `delete`, `clear`, `move`); the unit of undo. One gesture = one Op, including a picker commit or Selection-target drag.
- **Esc ladder** — Esc's precedence: cancel/commit an in-progress gesture → deselect a persistent Selection target → drop the armed tool to Interact → tear down the Session.
- **Teardown** — removing the shadow-root host and all listeners, restoring the page exactly.
- **The gauntlet** — the closing manual test sweep across GitHub, a Tailwind SPA, a long dark-mode article, and a sticky-header page (slice S6).
