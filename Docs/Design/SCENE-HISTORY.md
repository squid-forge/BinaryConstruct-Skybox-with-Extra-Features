# Scene history and ordering

SceneHistory stores bounded immutable snapshots and redo states. The editor retains 80 scene transactions; updates to the same layer field within 600 ms coalesce, preserving the original baseline of a slider/numeric edit. A new edit after undo clears redo. Selection changes are not edits; restored selection is clamped to the recovered layer count.

App commits layer edits, visibility, stacking, creation/deletion, structural ordering, final viewport drag placement and scene imports through one history boundary. Restore cancels pending render debounces, restores state and rebuilds the scene. Keyboard undo/redo is suspended during export/HDR preview; focused text/Script editors keep native text undo. Numeric/range controls use scene history shortcuts.

Asset snapshots store version tokens, not copies of uploaded image bytes in every scene snapshot. Each token references a list of immutable SpriteAsset objects. Undoing upload/removal/replacement or a project import recreates active object URLs from retained data and invalidates stale textures. Tokens outside past/current/future history are pruned after a new commit. This bounds checkpoint count, not total bytes of large unique images retained by those checkpoints.

The eye action beside the layer lock edits the visibility flag; the duplicate Properties checkbox was removed for clarity. HTML layer dragging uses an application/x-skybox-layer payload and a visible drop outline; the source item is removed and inserted at the target index. External sprite/file drags use separate payloads. Up/down controls remain available for keyboard-friendly ordering. Ordering changes pass through normal history and lens recapture, so visual composition follows the new sequence.

Scene history is session-only. It does not record camera movement, grid/export preferences or temporary PCG workbench parameter edits. Baked assets and their sky placement are tracked. Saved projects remain the durable checkpoint format.
