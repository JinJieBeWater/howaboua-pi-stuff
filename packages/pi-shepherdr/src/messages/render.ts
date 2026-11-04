import {
	type ExtensionAPI,
	getMarkdownTheme,
	keyHint,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Box,
	type Component,
	Markdown,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import {
	AGENT_EVENT_MESSAGE_TYPE,
	type AgentEventDetails,
	eventDetails,
} from "./event-details.js";

const COLLAPSED_RESPONSE_LINES = 16;

/** Limits rendered lines; wrapping decides a response's height, not its source. */
class CollapsedResponse implements Component {
	private readonly markdown: Markdown;
	private readonly theme: Theme;

	constructor(markdown: Markdown, theme: Theme) {
		this.markdown = markdown;
		this.theme = theme;
	}

	render(width: number): string[] {
		const lines = this.markdown.render(width);
		if (lines.length <= COLLAPSED_RESPONSE_LINES) return lines;
		const hidden = lines.length - COLLAPSED_RESPONSE_LINES;
		return [
			...lines.slice(0, COLLAPSED_RESPONSE_LINES),
			`${this.theme.fg("muted", `... (${hidden} more lines,`)} ${keyHint("app.tools.expand", "to expand")}${this.theme.fg("muted", ")")}`,
		];
	}

	invalidate(): void {
		this.markdown.invalidate();
	}
}

export function registerAgentEventRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer<AgentEventDetails>(
		AGENT_EVENT_MESSAGE_TYPE,
		(message, { expanded, outputPad }, theme) => {
			const details = eventDetails(message.details);
			if (!details) {
				const box = new Box(outputPad, 1, (value) =>
					theme.bg("customMessageBg", value),
				);
				box.addChild(
					new Text(
						typeof message.content === "string"
							? message.content
							: "Herdr agent event unavailable",
						0,
						0,
					),
				);
				return box;
			}
			const blocked = details?.state === "blocked";
			const failed = details?.state === "failed";
			const notification = details.state === "extension-message";
			const machine =
				details.machine === "local"
					? ""
					: `${details.machineLabel ?? details.machine} / `;
			const title =
				theme.fg(
					blocked || failed ? "error" : notification ? "warning" : "success",
					`${blocked || notification ? "●" : failed ? "✗" : "✓"} ${machine}${details.name ?? details.paneId} · ${notification ? "extension message pending" : details.state}`,
				) + (details.name ? theme.fg("dim", ` · ${details.paneId}`) : "");
			const location = [details?.workspace, details?.tab]
				.filter(Boolean)
				.join(" / ");
			const metadata = [location, details?.cwd].filter(Boolean).join(" · ");
			const box = new Box(outputPad, 1, (value) =>
				theme.bg("customMessageBg", value),
			);
			box.addChild(new Text(title, 0, 0));
			if (expanded && metadata)
				box.addChild(new Text(theme.fg("dim", metadata), 0, 0));
			let hasBody = false;
			const section = (component: Component) => {
				if (expanded || hasBody) box.addChild(new Spacer(1));
				hasBody = true;
				box.addChild(component);
			};
			if (blocked || notification) {
				// Open by default: this is the question someone has to answer.
				for (const message of details.extensionMessages ?? [])
					section(new Markdown(message.message, 0, 0, getMarkdownTheme()));
				if (details.blockedOn || !details.extensionMessages?.length)
					section(
						new Text(
							theme.fg(
								"warning",
								details.blockedOn ??
									(notification
										? "Extension message pending"
										: "Agent needs input or approval"),
							),
							0,
							0,
						),
					);
			}
			if (expanded && details?.task) {
				section(new Text(theme.fg("muted", "Task"), 0, 0));
				box.addChild(new Markdown(details.task, 0, 0, getMarkdownTheme()));
			}
			if (details?.response) {
				const response = new Markdown(
					details.response,
					0,
					0,
					getMarkdownTheme(),
				);
				if (expanded) {
					section(new Text(theme.fg("muted", "Response"), 0, 0));
					box.addChild(response);
				} else section(new CollapsedResponse(response, theme));
			}
			return box;
		},
	);
}
