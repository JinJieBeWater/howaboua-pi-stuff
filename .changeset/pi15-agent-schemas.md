---
"@howaboua/pi-shepherdr": patch
---

- Remote machines now keep Shepherdr's helper installed per version, so each remote check sends about 1 KB instead of resending about 100 KB. Remote monitoring ignores this machine's local terminal events, stops slow remote list checks with the caller, and backs off reconnects up to 30 seconds.
- `reply` now returns once the answer is delivered, so a long-running worker no longer holds the controller; its result arrives as a background report. Set `blocking: true` to wait for it.
- Agent guidance now uses compact tool-prefixed wording.
