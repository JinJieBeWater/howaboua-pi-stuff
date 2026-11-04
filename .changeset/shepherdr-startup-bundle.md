---
"@howaboua/pi-shepherdr": patch
---

- Reduce startup module loading while preserving agent monitoring and shared boards.
- In Herdr Core, replace the per-agent status list with a one-line summary that names blocked agents and shows machines only when one is disconnected.
- Keep only the first and latest instruction for supervised agents, so session files and rollover briefings stop growing with every message.
- Failed `agents` calls now show their error instead of a green "done".
- Settled `agents` calls collapse to one line, and `list` and `find` show how many agents they returned.
- Agent event cards are shorter: long responses collapse to 16 lines, while paths and tasks move to the expanded view.
- Blocked agent cards show the pending question without expanding.
