---
"@howaboua/pi-shepherdr": patch
---

- Reduce startup module loading while preserving agent monitoring and shared boards.
- Failed `agents` calls now show their error instead of a green "done".
- Claude models can answer blocked agents with direct `agents reply` calls. JSON-shaped messages no longer fail with "message is required".
- Agents that fail to start now report their last screen, so a prompt that stalled startup is visible after the terminal closes.
- Pi now uses the matching `hc` command for targets and operations `agents` doesn't support, such as other agents' terminals.
