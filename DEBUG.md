## Observations
- savelog.log only contains [save-full][dump] events for decrypt_pair and load_string_plain.
- Event counts from current log:
  - decrypt_pair: 472
  - load_string_plain: 1172
  - save_string_plain: 1
  - playerprefs_setstring: 2
  - decrypt2_input: 0
  - decrypt2_output: 0
  - load_from_folder_enter: 0
  - full_snapshot: 0
- Script is configured to emit full_snapshot only in PlayerPrefs_Save hook.
- Script is configured to emit decrypt2_input/decrypt2_output only in SaveManagement_Decrypt2 hook.

## Hypotheses
### H1 (ROOT): Current run follows local PlayerPrefs key-by-key load path, not cloud-folder full package path
- Supports: load_string_plain/decrypt_pair are high-volume, decrypt2/load_from_folder are zero.
- Conflicts: none in current log.
- Test: trigger cloud import/load-from-folder path; if hook works, load_from_folder_enter + decrypt2_* should appear.

### H2: full_snapshot not emitted because no save flush happened
- Supports: full_snapshot is emitted only from PlayerPrefs_Save hook.
- Conflicts: none.
- Test: perform operation that forces PlayerPrefs.Save and check full_snapshot appears.

### H3: User is still running an older built script
- Supports: new tags added in script exist, but current log has none.
- Conflicts: older/newer versions cannot be proven from this log alone.
- Test: check startup lines for hook registration output and verify script timestamp loaded by frida.

## Conclusion
Root cause is behavior-path mismatch: the current gameplay session is reading save entries from PlayerPrefs per key (song+difficulty), so output is naturally one line per key. The full-package events require CloudSaveManager_LoadFromFolder -> SaveManagement_Decrypt2 path, which did not execute in this run.

## Observations (cloud sync version display)
- cloud_sync_version_bypass_bridge.ts previously wrote version text into CloudSaveInfoDisplay.syncTime.
- Runtime logs showed SetInfo hook executed, but no readable version string appeared on screen.
- delta_t_display_bridge.ts uses cloned UI Text overlays with parent attach + offset, which is visually robust across scene/UI refreshes.

## Hypotheses (cloud sync version display)
### H1 (ROOT): syncTime text is not a reliable visible anchor in current popup lifecycle
- Supports: field write succeeded in hook logs, but visual result was absent.
- Conflicts: none observed.
- Test: switch to a dedicated cloned Text overlay attached near SelectSavePopup subtitle.

### H2: role mapping works but target text is clipped/overwritten by layout
- Supports: old path used direct in-place string replacement on existing field.
- Conflicts: none.
- Test: render into independent overlay node and set smaller font + Y offset.

## Conclusion (cloud sync version display)
Root cause is display-anchor instability (using syncTime in-place). Replaced with dedicated on-screen overlay text cloned from SelectSavePopup subtitle; now local/cloud versions are updated through the overlay path.

## Observations (repeat injection crash)
- Runtime error: unexpected instruction at save-compare branch, expected b.hi but got nop.
- This indicates the same process had already been patched once, and script was injected again.

## Hypotheses (repeat injection crash)
### H1 (ROOT): branch patch logic is non-idempotent
- Supports: first run changes b.hi to nop; second run still strictly expects b.hi and crashes.
- Conflicts: none.
- Test: allow both original and already-patched mnemonics in installSyncVersionBypass.

## Conclusion (repeat injection crash)
Root cause is non-idempotent instruction expectation. Updated installSyncVersionBypass to accept already-patched mnemonics (nop/branch) and only patch when instruction is still in original form.
