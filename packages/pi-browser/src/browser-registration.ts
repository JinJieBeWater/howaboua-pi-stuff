import type { defineTool, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Type } from "typebox";
import { browserHelp } from "./browser/help.js";
import { BrowserRoutes, loadBrowserRoutes } from "./browser/routes.js";
import type { BrowserRuntime } from "./browser/runtime.js";
import { registerBrowserCommand } from "./browser/settings.js";
import {
	createBrowserTool,
	prepareBrowserInput,
} from "./browser-tool-definition.js";

const CODE_MODE_PACKAGE = "@howaboua/pi-codex-conversion";
const CODE_MODE_MODULE = `${CODE_MODE_PACKAGE}/code-mode`;

export default async function browserExtension(
	pi: ExtensionAPI,
	sdk: { defineTool: typeof defineTool; Type: typeof Type },
): Promise<void> {
	let configError: string | undefined;
	let routes: BrowserRoutes;
	try {
		routes = loadBrowserRoutes();
	} catch (error) {
		routes = new BrowserRoutes();
		configError = error instanceof Error ? error.message : String(error);
	}
	let runtimePromise: Promise<BrowserRuntime> | undefined;
	const lifetime = new AbortController();
	const runtime: Pick<BrowserRuntime, "hosts" | "execute"> = {
		hosts: routes.names,
		async execute(request, options = {}) {
			const signal = options.signal
				? AbortSignal.any([options.signal, lifetime.signal])
				: lifetime.signal;
			signal.throwIfAborted();
			if ("help" in request) return browserHelp(routes.names);
			const backend = await (runtimePromise ??= import(
				"./browser/runtime.js"
			).then(({ BrowserRuntime }) => new BrowserRuntime(routes)));
			signal.throwIfAborted();
			return backend.execute(request, options);
		},
	};
	let gpt = false;
	const tool = createBrowserTool(sdk, runtime, () => gpt);
	registerBrowserCommand(pi);
	pi.registerTool(tool);
	try {
		const { registerGptPromptMode } = await import(
			"@howaboua/pi-codex-conversion/prompt-mode"
		);
		registerGptPromptMode(pi, (active) => {
			gpt = active;
			return [tool];
		});
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!("code" in error) ||
			![
				"ERR_MODULE_NOT_FOUND",
				"MODULE_NOT_FOUND",
				"ERR_PACKAGE_PATH_NOT_EXPORTED",
			].includes(String(error.code)) ||
			!error.message.includes(CODE_MODE_PACKAGE)
		)
			throw error;
	}

	const registration = await registerBrowserInCodeMode(pi, tool, sdk);
	pi.on("session_shutdown", async () => {
		lifetime.abort(new Error("Browser runtime closed"));
		registration?.unregister();
		const backend = await runtimePromise;
		await backend?.close();
	});
	if (configError) {
		pi.on("session_start", (_event, ctx) => {
			ctx.ui.notify(`${configError}. Run /browser to repair it.`, "warning");
		});
	}
}

async function registerBrowserInCodeMode(
	pi: ExtensionAPI,
	tool: ReturnType<typeof createBrowserTool>,
	sdk: { Type: typeof Type },
) {
	try {
		const { adaptToolForCodeMode, registerCodeModeExtensionTools } =
			await import("@howaboua/pi-codex-conversion/code-mode");
		return registerCodeModeExtensionTools(pi, () => [
			adaptToolForCodeMode(
				{
					...tool,
					parameters: sdk.Type.Object({}, { additionalProperties: true }),
				},
				{
					prepareInput: prepareBrowserInput,
					discovery: "help",
					resultValue: (result) => result.details,
				},
			),
		]);
	} catch (error) {
		if (isMissingCodeModeExtension(error)) return undefined;
		if (isOutdatedCodeModeExtension(error)) {
			throw new Error(
				"Update " +
					CODE_MODE_PACKAGE +
					" to 3.0.24 or newer to use Pi Browser with it",
				{ cause: error },
			);
		}
		throw error;
	}
}

function isMissingCodeModeExtension(error: unknown): boolean {
	if (
		!error ||
		typeof error !== "object" ||
		!("code" in error) ||
		!("message" in error) ||
		typeof error.message !== "string"
	) {
		return false;
	}
	if (
		error.code !== "ERR_MODULE_NOT_FOUND" &&
		error.code !== "MODULE_NOT_FOUND"
	) {
		return false;
	}
	const missing = error.message.match(
		/Cannot find (?:package|module) ['"]([^'"]+)['"]/,
	)?.[1];
	return missing === CODE_MODE_PACKAGE || missing === CODE_MODE_MODULE;
}

function isOutdatedCodeModeExtension(error: unknown): boolean {
	if (
		!error ||
		typeof error !== "object" ||
		!("code" in error) ||
		!("message" in error) ||
		typeof error.message !== "string"
	)
		return false;
	return (
		(error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" ||
			error.code === "ERR_UNSUPPORTED_DIR_IMPORT") &&
		(error.message.includes(CODE_MODE_MODULE) ||
			(error.message.includes("Package subpath './code-mode'") &&
				error.message.includes(CODE_MODE_PACKAGE)))
	);
}
