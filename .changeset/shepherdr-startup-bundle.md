---
"@howaboua/pi-shepherdr": patch
---

- Reduce startup module loading while preserving agent monitoring and shared boards.
- Reuse each connected machine's remote helper and back off monitor reconnects up to 30 seconds.
- Delegate independent implementation scopes automatically while handling small or tightly coupled work directly.
- In Herdr Core, replace the per-agent status list with a one-line summary that names blocked agents and shows machines only when one is disconnected.
- Failed `agents` calls now show their error instead of a green "done".
- Settled `agents` calls collapse to one line, and `list` and `find` show how many agents they returned.
- Agent event cards are shorter: long responses collapse to 16 lines, while paths and tasks move to the expanded view.
- Blocked agent cards show the pending question without expanding.
- Claude models can answer blocked agents with direct `agents reply` calls. JSON-shaped messages no longer fail with "message is required".
- Agents that fail to start now report their last screen, so a prompt that stalled startup is visible after the terminal closes.
- `reply` now returns once the answer is delivered, so a long-running worker no longer holds the controller; its result arrives as a background report. Set `blocking: true` to wait for it.
