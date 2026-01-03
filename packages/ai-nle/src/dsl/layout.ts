import { LayoutMeta } from "./types";

export const parseUnit = (value?: number | string | "auto"): number => {
	if (value === undefined || value === null) {
		return 0;
	}

	if (typeof value === "number") {
		return value;
	}
	if (value === "auto") {
		return 0;
	}
	return parseFloat(value);
};

export const converMetaLayoutToCanvasLayout = (
	metaLayout: LayoutMeta,
): { x: number; y: number; width: number; height: number } => {
	const { left, top, width, height } = metaLayout;

	return {
		x: parseUnit(left),
		y: parseUnit(top),
		width: parseUnit(width),
		height: parseUnit(height),
	};
};
