#!/usr/bin/env bun

import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const entries = {
	"pi-shepherdr": ["index.ts"],
	"pi-notes-compaction": ["src/index.ts", "src/context-sharing.ts"],
};
const name = process.argv[2];
if (!Object.hasOwn(entries, name)) {
	throw new Error("Expected pi-shepherdr or pi-notes-compaction");
}
const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../packages",
	name,
);
const outdir = resolve(packageRoot, "dist");
await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: entries[name].map((entry) => resolve(packageRoot, entry)),
	outdir,
	target: "node",
	format: "esm",
	packages: "external",
	external: ["bun:sqlite"],
	splitting: true,
	naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
	plugins: [
		{
			name: "source-relative-resources",
			setup(build) {
				build.onLoad({ filter: /\.(?:ts|mjs)$/ }, async ({ path }) => {
					const source = await Bun.file(path).text();
					if (!source.includes("import.meta.url")) return;
					const sourcePath = relative(outdir, path).split(sep).join("/");
					// Keep resource URLs anchored to the shipped source, not the bundle.
					const url = `new URL(${JSON.stringify(sourcePath)}, import.meta.url).href`;
					return {
						contents: source.replaceAll("import.meta.url", `(${url})`),
						loader: path.endsWith(".ts") ? "ts" : "js",
					};
				});
			},
		},
	],
});
if (!result.success) throw new AggregateError(result.logs, "Bundle failed");

const scanner = new Bun.Transpiler({ loader: "js" });
for (const output of result.outputs) {
	const imports = scanner.scanImports(await output.text());
	assert.ok(
		!imports.some(
			({ kind, path }) =>
				(kind === "import-statement" || kind === "dynamic-import") &&
				(path === "bun" || path.startsWith("bun:")),
		),
		"Node bundles must not import Bun runtime modules",
	);
}
