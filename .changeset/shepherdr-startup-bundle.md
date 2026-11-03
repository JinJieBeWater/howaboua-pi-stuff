---
"@howaboua/pi-shepherdr": patch
---

- Reduce startup module loading while preserving agent monitoring and shared boards.
- In Herdr Core, replace the per-agent status list with a compact summary of agent states and machine connections.
- Keep only the first and latest instruction for supervised agents, so session files and rollover briefings stop growing with every message.
