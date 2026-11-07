import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { CoreClient, CoreRequestOptions } from "./client.js";
import { type CoreObject, object } from "./protocol.js";

export interface CoreMachine {
	id: string;
	name: string;
	host: string;
	session: string;
	state: string;
}

export async function coreMachines(client: CoreClient): Promise<CoreMachine[]> {
	const machines = object(await client.request("machine.list"))["machines"];
	if (!Array.isArray(machines))
		throw new Error("Core returned no machine catalog");
	return machines.map((value) => {
		const machine = object(value);
		for (const field of ["id", "name", "host", "state"])
			if (typeof machine[field] !== "string" || !machine[field])
				throw new Error("Core returned an invalid machine identity");
		return {
			id: machine["id"] as string,
			name: machine["name"] as string,
			host: machine["host"] as string,
			state: machine["state"] as string,
			session:
				typeof machine["session"] === "string" ? machine["session"] : "default",
		};
	});
}

// Installed flat, so shepherdr-context's relative imports resolve unchanged.
const HELPER_FILES = [
	"./remote-helper.mjs",
	"./context-relay.mjs",
	"./pi-executable.mjs",
	"../remote/shepherdr-peer.mjs",
	"../remote/shepherdr-session.mjs",
	"../remote/shepherdr-session-watch.mjs",
	"../remote/shepherdr-checkpoints.mjs",
	"../remote/shepherdr-context.mjs",
];
const MODULES = {
	pi: "./pi-executable.mjs",
	relay: "./context-relay.mjs",
	peer: "./shepherdr-peer.mjs",
	session: "./shepherdr-session.mjs",
	watch: "./shepherdr-session-watch.mjs",
	context: "./shepherdr-context.mjs",
};
const MISSING = "SHEPHERDR_HELPER_MISSING";
const ROOT = `join(homedir(), ".cache", "pi-shepherdr", "helpers")`;
// shortcut: old hash directories are never pruned (~50 KB each); prune if versions pile up.
const INSTALL = `import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { hash, files } = JSON.parse(Buffer.concat(chunks).toString());
const root = ${ROOT};
await mkdir(root, { recursive: true, mode: 0o700 });
const staging = await mkdtemp(join(root, ".staging-"));
try {
	for (const [name, source] of Object.entries(files))
		await writeFile(join(staging, name), source, { mode: 0o600 });
	try {
		await rename(staging, join(root, hash));
	} catch (error) {
		if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
	}
} finally {
	await rm(staging, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify({ ok: true, result: true }) + "\\n");`;
const boot = (hash: string) => `import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const helper = join(${ROOT}, ${JSON.stringify(hash)}, "remote-helper.mjs");
try {
	await access(helper);
} catch {
	for await (const _ of process.stdin);
	process.stdout.write(JSON.stringify({ ok: false, code: "${MISSING}" }) + "\\n");
	process.exit(0);
}
await import(pathToFileURL(helper).href);`;

let bundle:
	| Promise<{ hash: string; files: Record<string, string> }>
	| undefined;
async function helperBundle() {
	const entries = await Promise.all(
		HELPER_FILES.map(
			async (path) =>
				[
					basename(path),
					await readFile(new URL(path, import.meta.url), "utf8"),
				] as const,
		),
	);
	return {
		hash: createHash("sha256")
			.update(JSON.stringify(entries))
			.digest("hex")
			.slice(0, 32),
		files: Object.fromEntries(entries),
	};
}

/**
 * One bounded remote process; never retries a possibly delivered operation.
 * The helper is installed once per content hash; only a missing install is retried.
 */
export async function remoteExec(
	client: CoreClient,
	machine: CoreMachine,
	input: CoreObject,
	options: CoreRequestOptions = {},
): Promise<unknown> {
	const { hash, files } = await (bundle ??= helperBundle());
	// Read-only lookups end remotely with the caller; delivery ops keep their full bound.
	const timeout =
		input["op"] === "watch"
			? 20
			: (input["op"] === "list" || input["op"] === "identity") &&
					options.timeoutMs
				? Math.min(90, Math.ceil(options.timeoutMs / 1000))
				: 90;
	const payload = {
		...input,
		coreId: machine.id,
		session: machine.session,
		modules: MODULES,
	};
	let receipt = await exec(
		client,
		machine,
		boot(hash),
		payload,
		timeout,
		options,
	);
	if (receipt["code"] === MISSING) {
		const installed = await exec(
			client,
			machine,
			INSTALL,
			{ hash, files },
			90,
			options,
		);
		if (installed["ok"] !== true)
			throw new Error("Remote helper install failed");
		receipt = await exec(
			client,
			machine,
			boot(hash),
			payload,
			timeout,
			options,
		);
	}
	if (receipt["ok"] !== true)
		throw Object.assign(
			new Error(
				typeof receipt["error"] === "string"
					? receipt["error"]
					: "Remote operation failed",
			),
			{ code: receipt["code"] },
		);
	return receipt["result"];
}

async function exec(
	client: CoreClient,
	machine: CoreMachine,
	source: string,
	input: object,
	timeout: number,
	options: CoreRequestOptions,
): Promise<CoreObject> {
	const result = object(
		await client.request(
			"machine.exec",
			{
				on: machine.id,
				argv: ["node", "--input-type=module", "-e", source],
				timeout,
				input: Buffer.from(JSON.stringify(input)).toString("base64"),
			},
			{ timeoutMs: 100_000, ...options },
		),
	);
	if (
		result["timed_out"] ||
		result["truncated"] ||
		result["code"] !== 0 ||
		typeof result["stdout"] !== "string"
	)
		throw new Error(
			"Remote operation did not finish; inspect the target before retrying and verify Node.js and hc are available in the selected Core's PATH",
		);
	return object(JSON.parse(Buffer.from(result["stdout"], "base64").toString()));
}
