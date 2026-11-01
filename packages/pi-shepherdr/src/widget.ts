import { basename } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { activityStatus } from "./activity.js";
import type {
	AgentStatus,
	MachineStatus,
	ScopedMonitoredAgent,
} from "./types.js";

const WIDGET_ID = "herdr-agents";
const MAX_VISIBLE_AGENTS = 8;

function statusAppearance(status: AgentStatus | "offline"): {
	icon: string;
	tone: "dim" | "error" | "success" | "warning";
} {
	switch (status) {
		case "working":
			return { icon: "◉", tone: "warning" };
		case "blocked":
			return { icon: "●", tone: "error" };
		case "done":
			return { icon: "✓", tone: "success" };
		case "idle":
			return { icon: "○", tone: "dim" };
		case "offline":
			return { icon: "?", tone: "error" };
		default:
			return { icon: "?", tone: "dim" };
	}
}

function agentLine(
	ctx: ExtensionContext,
	agent: ScopedMonitoredAgent,
	machines: Map<string, MachineStatus>,
): string {
	const theme = ctx.ui.theme;
	const status = activityStatus(agent.activity);
	const machine = machines.get(agent.machine);
	const connected = machine?.status === "connected";
	const appearance = connected
		? machine.monitoringIssue
			? ({ icon: "?", tone: "warning" } as const)
			: statusAppearance(status)
		: ({ icon: "?", tone: "error" } as const);
	const name = `${machine?.label ?? agent.machine} / ${agent.name ?? agent.paneId}`;
	const location = agent.cwd ? basename(agent.cwd) : agent.paneId;
	return [
		theme.fg("muted", "│"),
		theme.fg(appearance.tone, appearance.icon),
		theme.fg("accent", name),
		theme.fg(
			appearance.tone,
			connected
				? `${status}${machine.monitoringIssue ? " (last seen)" : ""}`
				: "offline",
		),
		theme.fg("dim", `· ${location}`),
	].join(" ");
}

function agentSummary(
	ctx: ExtensionContext,
	agents: ScopedMonitoredAgent[],
	machines: MachineStatus[],
): string {
	const theme = ctx.ui.theme;
	const machinesByName = new Map(
		machines.map((machine) => [machine.id, machine]),
	);
	const counts = new Map<AgentStatus | "offline", number>([
		["blocked", 0],
		["offline", 0],
		["working", 0],
		["done", 0],
		["idle", 0],
		["unknown", 0],
	]);
	for (const agent of agents) {
		const machine = machinesByName.get(agent.machine);
		const status =
			machine?.status !== "connected"
				? "offline"
				: machine.monitoringIssue
					? "unknown"
					: activityStatus(agent.activity);
		counts.set(status, (counts.get(status) ?? 0) + 1);
	}
	const summary = [theme.fg("accent", `herdr agents ${agents.length}`)];
	for (const [status, count] of counts) {
		if (!count) continue;
		const { icon, tone } = statusAppearance(status);
		summary.push(theme.fg(tone, `${icon} ${count} ${status}`));
	}
	summary.push(
		theme.fg(
			"dim",
			`${machines.filter((machine) => machine.status === "connected").length}/${machines.length} machines`,
		),
	);
	return summary.join(theme.fg("dim", " · "));
}

export function renderAgentWidget(
	ctx: ExtensionContext | undefined,
	agents: ScopedMonitoredAgent[],
	machines: MachineStatus[],
): void {
	if (!ctx?.hasUI) return;
	if (agents.length === 0) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}
	const theme = ctx.ui.theme;
	const core = Boolean(process.env["HC_TERMINAL_SOCKET"]);
	let lines: string[];
	if (core) {
		lines = [agentSummary(ctx, agents, machines)];
	} else {
		const ordered = [...agents].sort(
			(left, right) =>
				statusOrder(activityStatus(left.activity)) -
					statusOrder(activityStatus(right.activity)) ||
				(left.name ?? left.paneId).localeCompare(right.name ?? right.paneId),
		);
		const machinesByName = new Map(
			machines.map((machine) => [machine.id, machine]),
		);
		lines = [
			`${theme.fg("accent", "╭─ herdr agents")} ${theme.fg("dim", `${agents.length} · ${machines.filter((machine) => machine.status === "connected").length}/${machines.length} machines`)}`,
			...ordered
				.slice(0, MAX_VISIBLE_AGENTS)
				.map((agent) => agentLine(ctx, agent, machinesByName)),
		];
		if (ordered.length > MAX_VISIBLE_AGENTS) {
			lines.push(
				`${theme.fg("muted", "│")} ${theme.fg("dim", `+${ordered.length - MAX_VISIBLE_AGENTS} more`)}`,
			);
		}
	}
	for (const machine of machines) {
		if (!machine.monitoringIssue) continue;
		const status =
			machine.monitoringIssue.state === "degraded"
				? "incomplete"
				: "unavailable";
		const recovery = machine.local ? "retrying" : "/herdr → Status";
		lines.push(
			`${core ? "" : `${theme.fg("muted", "│")} `}${theme.fg("warning", `${machine.id} monitoring ${status} · ${recovery}`)}`,
		);
	}
	if (!core) lines.push(theme.fg("muted", "╰─"));
	ctx.ui.setWidget(WIDGET_ID, lines, { placement: "aboveEditor" });
}

function statusOrder(status: AgentStatus): number {
	return ["blocked", "working", "done", "idle", "unknown"].indexOf(status);
}
