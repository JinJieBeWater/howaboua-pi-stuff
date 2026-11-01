import { Container, Image, Spacer, Text } from "@earendil-works/pi-tui";

interface ImageContentLike {
	type: "image";
	data: string;
	mimeType: string;
}

type ToolContentLike = { type: string; text?: string | undefined } | ImageContentLike;

function isImageContent(item: ToolContentLike): item is ImageContentLike {
	return item.type === "image" && "data" in item && typeof item.data === "string" && "mimeType" in item && typeof item.mimeType === "string";
}

export function renderTextWithImages(
	text: string,
	content: ToolContentLike[],
	theme: { fg(role: string, text: string): string },
	options: { paddingX?: number | undefined } = {},
): Text | Container {
	const images = content.filter(isImageContent);
	if (!images.length) return new Text(text, options.paddingX ?? 0, 0);

	const box = new Container();
	if (text) box.addChild(new Text(text, options.paddingX ?? 0, 0));
	for (const [index, image] of images.entries()) {
		if (text || index > 0) box.addChild(new Spacer(1));
		box.addChild(new Image(image.data, image.mimeType, { fallbackColor: (value) => theme.fg("dim", value) }, { maxWidthCells: 60 }));
	}
	return box;
}
