---
"@howaboua/pi-shepherdr": patch
---

Requires Pi 1.5 or newer.

- `spawn` and `assign` now return after task submission by default. Set `blocking: true` to wait for the result. A profile's `blocking` setting still overrides `spawn`.
- Remote machines now keep Shepherdr's helper installed per version, so each remote check sends about 1 KB instead of resending about 100 KB. Remote monitoring ignores this machine's local terminal events, stops slow remote list checks with the caller, and backs off reconnects up to 30 seconds.
- `reply` now returns once the answer is delivered, so a long-running worker no longer holds the controller; its result arrives as a background report. Set `blocking: true` to wait for it.
- Extension updates now use Pi's native changelog notices and `collapseChangelog` setting. Custom suppression is removed.
- Attached Notes reads keep alias paths and read-only warnings consistent across native, Code and Notebook results.
- Agent guidance now uses compact tool-prefixed wording.
- Agent snapshots and rollover briefings retain initial scope and the latest instruction instead of accumulating every message. Full messages remain in session history.
- Unchanged agent snapshots are no longer written repeatedly.
- Closed workers no longer trigger a misleading notices-unavailable reconnect warning.
