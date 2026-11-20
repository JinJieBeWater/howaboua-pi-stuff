import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startBrowser } from "../src/browser/launcher.js";
import { BrowserCdpSession } from "../src/cdp/session.js";

async function reserveFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createNetServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to allocate ephemeral port"));
				return;
			}
			const { port } = address;
			server.close((error) => (error ? reject(error) : resolve(port)));
		});
	});
}

async function waitForFile(path: string, timeoutMs = 5_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const content = await readFile(path, "utf8");
			if (content.trim()) return content;
		} catch {
			// Wait until spawned browser records its PID and argv.
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out waiting for ${path}`);
}

function stopPid(pid: number): void {
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		// Process already exited.
	}
}

async function writeFakeChromeExecutable(
	dir: string,
	recordPath: string,
): Promise<string> {
	const scriptPath = join(dir, "fake-chrome.mjs");
	const script = `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const portArg = args.find((arg) => arg.startsWith("--remote-debugging-port="));
const hostArg = args.find((arg) => arg.startsWith("--remote-debugging-address="));
const port = Number(portArg?.split("=")[1] ?? 0);
const host = hostArg?.split("=")[1] ?? "127.0.0.1";

function encodeTextFrame(text) {
	const payload = Buffer.from(text, "utf8");
	if (payload.length < 126) {
		return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
	}
	const header = Buffer.alloc(4);
	header[0] = 0x81;
	header[1] = 126;
	header.writeUInt16BE(payload.length, 2);
	return Buffer.concat([header, payload]);
}

function decodeFrames(chunk) {
	const messages = [];
	let offset = 0;
	while (offset + 2 <= chunk.length) {
		const opcode = chunk[offset] & 0x0f;
		const masked = (chunk[offset + 1] & 0x80) !== 0;
		let length = chunk[offset + 1] & 0x7f;
		let cursor = offset + 2;
		if (length === 126) {
			length = chunk.readUInt16BE(cursor);
			cursor += 2;
		}
		const mask = masked ? chunk.subarray(cursor, cursor + 4) : null;
		if (masked) cursor += 4;
		const data = Buffer.from(chunk.subarray(cursor, cursor + length));
		if (mask) {
			for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
		}
		if (opcode === 0x8) {
			messages.push({ close: true });
		} else if (opcode === 0x1) {
			messages.push({ text: data.toString("utf8") });
		}
		offset = cursor + length;
	}
	return messages;
}

const server = createServer((req, res) => {
	if (req.url === "/json/version") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({
			Browser: "Chrome/156.0.0.0",
			webSocketDebuggerUrl: \`ws://\${host}:\${port}/devtools/browser/test-browser\`,
		}));
		return;
	}
	res.writeHead(404);
	res.end();
});

server.on("upgrade", (req, socket) => {
	const key = req.headers["sec-websocket-key"];
	const accept = createHash("sha1")
		.update(\`\${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11\`)
		.digest("base64");
	socket.write(
		"HTTP/1.1 101 Switching Protocols\\r\\n" +
			"Upgrade: websocket\\r\\n" +
			"Connection: Upgrade\\r\\n" +
			\`Sec-WebSocket-Accept: \${accept}\\r\\n\\r\\n\`,
	);
	socket.on("data", (chunk) => {
		for (const frame of decodeFrames(chunk)) {
			if (frame.close) {
				socket.end();
				return;
			}
			if (!frame.text) continue;
			const msg = JSON.parse(frame.text);
			if (msg.method === "Target.getTargets") {
				socket.write(
					encodeTextFrame(
						JSON.stringify({ id: msg.id, result: { targetInfos: [] } }),
					),
				);
			} else {
				socket.write(encodeTextFrame(JSON.stringify({ id: msg.id, result: {} })));
			}
		}
	});
});

server.listen(port, host, () => {
	writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ pid: process.pid, args }));
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;
	await writeFile(scriptPath, script, "utf8");
	await chmod(scriptPath, 0o755);
	return scriptPath;
}

async function withEnv(
	overrides: Record<string, string | undefined>,
	fn: () => Promise<void>,
): Promise<void> {
	const previous = new Map<string, string | undefined>();
	for (const [key, value] of Object.entries(overrides)) {
		previous.set(key, process.env[key]);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		await fn();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

test(
	"startBrowser spawns dedicated Chrome on darwin with configured flags",
	{ skip: process.platform !== "darwin" },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-browser-launcher-"));
		const recordPath = join(dir, "launched.json");
		const userDataDir = join(dir, "profile");
		let spawnedPid: number | undefined;
		try {
			const executable = await writeFakeChromeExecutable(dir, recordPath);
			const port = await reserveFreePort();
			await withEnv(
				{
					CDP_BROWSER: executable,
					CDP_HOST: "127.0.0.1",
					CDP_PORT: String(port),
					CDP_USER_DATA_DIR: userDataDir,
					CDP_PROFILE_DIRECTORY: undefined,
				},
				async () => {
					const message = await startBrowser(AbortSignal.timeout(5_000));
					assert.equal(
						message,
						`Started dedicated Chrome with CDP at 127.0.0.1:${port}`,
					);
				},
			);
			const recorded = JSON.parse(await waitForFile(recordPath)) as {
				pid: number;
				args: string[];
			};
			spawnedPid = recorded.pid;
			assert.deepEqual(recorded.args, [
				"--remote-debugging-address=127.0.0.1",
				`--remote-debugging-port=${port}`,
				`--user-data-dir=${userDataDir}`,
				"--profile-directory=Default",
				"--no-first-run",
				"--no-default-browser-check",
				"--no-startup-window",
			]);
		} finally {
			if (spawnedPid !== undefined) stopPid(spawnedPid);
			await rm(dir, { recursive: true, force: true });
		}
	},
);

test(
	"startBrowser fails fast on darwin when executable does not exist",
	{ skip: process.platform !== "darwin" },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-browser-missing-"));
		try {
			const port = await reserveFreePort();
			const missingBinary = join(dir, "missing-chrome");
			await withEnv(
				{
					CDP_BROWSER: missingBinary,
					CDP_HOST: "127.0.0.1",
					CDP_PORT: String(port),
				},
				async () => {
					await assert.rejects(
						startBrowser(AbortSignal.timeout(2_000)),
						/missing-chrome|not found|ENOENT/i,
					);
				},
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	},
);

test(
	"startBrowser returns already-running message without spawning when CDP port is live",
	{ skip: process.platform !== "darwin" },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-browser-live-"));
		const server = createServer((req, res) => {
			if (req.url === "/json/version") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/live",
					}),
				);
				return;
			}
			res.writeHead(404);
			res.end();
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		try {
			const { port } = server.address() as { port: number };
			await withEnv(
				{
					CDP_BROWSER: join(dir, "should-not-be-invoked"),
					CDP_HOST: "127.0.0.1",
					CDP_PORT: String(port),
				},
				async () => {
					const message = await startBrowser(AbortSignal.timeout(2_000));
					assert.equal(
						message,
						`Browser already running with CDP at 127.0.0.1:${port}`,
					);
				},
			);
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(dir, { recursive: true, force: true });
		}
	},
);

test(
	"BrowserCdpSession auto-launches Chrome on darwin when pages() finds no CDP endpoint",
	{ skip: process.platform !== "darwin" },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-browser-autostart-"));
		const recordPath = join(dir, "launched.json");
		const userDataDir = join(dir, "profile");
		const ownershipDir = join(dir, "tabs");
		await mkdir(ownershipDir, { recursive: true });
		let spawnedPid: number | undefined;
		let session: BrowserCdpSession | undefined;
		try {
			const executable = await writeFakeChromeExecutable(dir, recordPath);
			const port = await reserveFreePort();
			await withEnv(
				{
					CDP_BROWSER: executable,
					CDP_HOST: "127.0.0.1",
					CDP_PORT: String(port),
					CDP_PORT_FILE: join(dir, "nonexistent-DevToolsActivePort"),
					CDP_USER_DATA_DIR: userDataDir,
				},
				async () => {
					session = new BrowserCdpSession("test-owner", ownershipDir);
					const pages = await session.pages(AbortSignal.timeout(5_000));
					assert.deepEqual(pages, []);
				},
			);
			const recorded = JSON.parse(await waitForFile(recordPath)) as {
				pid: number;
			};
			spawnedPid = recorded.pid;
		} finally {
			await session?.close();
			if (spawnedPid !== undefined) stopPid(spawnedPid);
			await rm(dir, { recursive: true, force: true });
		}
	},
);
