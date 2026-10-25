# Export and editing follow-ups

Resolved on October 25: streaming image-export archives use ZIP64, tested with a real 4097-MiB entry and an entry beyond the 4-GiB offset boundary. Direct-folder output can bypass OPFS temporary-storage quota in supporting browsers. See the current export guide and package-fix verification results.

Remaining work:

- Project-save bundles and the library/reference in-memory rendering path still use ZIP32. Large image exports should use streaming; a separate project-save streaming migration remains possible future work.
- Full 16K exports still depend on GPU, browser, disk space and destination filesystem. Native-resolution crop verification does not prove every complete scene can export at 16K.
- Scene undo/redo shipped in E18, including asset additions/removal/replacement and imports. Optional future work: persisted history, camera history and temporary PCG workbench parameter undo.
- Device/driver last-bit HDR precision remains tracked in gpu-export-precision.md.
