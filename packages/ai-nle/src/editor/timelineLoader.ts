import type {
	RenderMeta,
	TimelineElement,
	TimelineMeta,
	TrackRole,
	TransformMeta,
} from "../dsl/types";
import { framesToTimecode, timecodeToFrames } from "@/utils/timecode";

/**
 * 时间线 JSON 格式定义
 */
export interface TimelineJSON {
	version: string;
	fps: number;
	canvas: {
		width: number;
		height: number;
	};
	elements: TimelineElement[];
}

export interface TimelineData {
	fps: number;
	canvas: { width: number; height: number };
	elements: TimelineElement[];
}

/**
 * 从 JSON 字符串加载时间线
 */
export function loadTimelineFromJSON(jsonString: string): TimelineData {
	try {
		const data: TimelineJSON = JSON.parse(jsonString);
		return validateTimeline(data);
	} catch (error) {
		console.error("Failed to parse timeline JSON:", error);
		throw new Error(
			`Invalid timeline JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * 从 JSON 对象加载时间线
 */
export function loadTimelineFromObject(data: TimelineJSON): TimelineData {
	return validateTimeline(data);
}

/**
 * 将时间线元素导出为 JSON 字符串
 */
export function saveTimelineToJSON(
	elements: TimelineElement[],
	fps: number,
	canvasSize: { width: number; height: number } = { width: 1920, height: 1080 },
): string {
	const timeline: TimelineJSON = {
		version: "1.0",
		fps,
		canvas: canvasSize,
		elements: elements.map((el) => ensureTimecodes(el, fps)),
	};
	return JSON.stringify(timeline, null, 2);
}

/**
 * 将时间线元素导出为 JSON 对象
 */
export function saveTimelineToObject(
	elements: TimelineElement[],
	fps: number,
	canvasSize: { width: number; height: number } = { width: 1920, height: 1080 },
): TimelineJSON {
	return {
		version: "1.0",
		fps,
		canvas: canvasSize,
		elements: elements.map((el) => ensureTimecodes(el, fps)),
	};
}

/**
 * 验证时间线数据
 */
function validateTimeline(data: TimelineJSON): TimelineData {
	if (!data.version) {
		throw new Error("Timeline JSON missing version field");
	}

	if (!Number.isInteger(data.fps) || data.fps <= 0) {
		throw new Error("Timeline JSON missing or invalid fps");
	}

	if (
		!data.canvas ||
		typeof data.canvas.width !== "number" ||
		typeof data.canvas.height !== "number"
	) {
		throw new Error("Timeline JSON missing or invalid canvas size");
	}

	if (!Array.isArray(data.elements)) {
		throw new Error("Timeline JSON elements must be an array");
	}

	return {
		fps: data.fps,
		canvas: data.canvas,
		elements: data.elements.map((el, index) =>
			validateElement(el, index, data.fps),
		),
	};
}

/**
 * 验证单个元素
 */
function validateElement(el: any, index: number, fps: number): TimelineElement {
	const path = `elements[${index}]`;

	if (!el.id || typeof el.id !== "string") {
		throw new Error(`${path}: missing or invalid 'id' field`);
	}

	if (!el.type || typeof el.type !== "string") {
		throw new Error(`${path}: missing or invalid 'type' field`);
	}

	if (!el.name || typeof el.name !== "string") {
		throw new Error(`${path}: missing or invalid 'name' field`);
	}

	// 验证 transform
	const transform = validateTransform(el.transform, `${path}.transform`);

	// 验证 timeline
	const timeline = validateTimelineProps(el.timeline, `${path}.timeline`, fps);

	// 验证 render (可选)
	const render = validateRender(el.render || {}, `${path}.render`);

	// props 可以是任意对象
	const props = el.props || {};

	const clip = el.clip;

	return {
		id: el.id,
		type: el.type,
		name: el.name,
		transform,
		timeline,
		render,
		props,
		clip,
	};
}

/**
 * 验证 transform 属性
 */
function validateTransform(transform: any, path: string): TransformMeta {
	if (!transform || typeof transform !== "object") {
		throw new Error(`${path}: must be an object`);
	}

	if (typeof transform.centerX !== "number") {
		throw new Error(`${path}.centerX: must be a number`);
	}

	if (typeof transform.centerY !== "number") {
		throw new Error(`${path}.centerY: must be a number`);
	}

	if (typeof transform.width !== "number" || transform.width <= 0) {
		throw new Error(`${path}.width: must be a positive number`);
	}

	if (typeof transform.height !== "number" || transform.height <= 0) {
		throw new Error(`${path}.height: must be a positive number`);
	}

	if (typeof transform.rotation !== "number") {
		throw new Error(`${path}.rotation: must be a number (radians)`);
	}

	return {
		centerX: transform.centerX,
		centerY: transform.centerY,
		width: transform.width,
		height: transform.height,
		rotation: transform.rotation,
	};
}

/**
 * 验证 timeline 属性
 */
function validateTimelineProps(
	timeline: any,
	path: string,
	fps: number,
): TimelineMeta {
	if (!timeline || typeof timeline !== "object") {
		throw new Error(`${path}: must be an object`);
	}

	if (!Number.isInteger(timeline.start) || timeline.start < 0) {
		throw new Error(`${path}.start: must be a non-negative integer`);
	}

	if (!Number.isInteger(timeline.end) || timeline.end <= timeline.start) {
		throw new Error(`${path}.end: must be greater than start`);
	}

	if (typeof timeline.startTimecode !== "string") {
		throw new Error(`${path}.startTimecode: must be a string`);
	}

	if (typeof timeline.endTimecode !== "string") {
		throw new Error(`${path}.endTimecode: must be a string`);
	}

	const expectedStart = timecodeToFrames(timeline.startTimecode, fps);
	const expectedEnd = timecodeToFrames(timeline.endTimecode, fps);
	if (expectedStart !== timeline.start) {
		throw new Error(`${path}.startTimecode does not match start frame`);
	}
	if (expectedEnd !== timeline.end) {
		throw new Error(`${path}.endTimecode does not match end frame`);
	}

	if (timeline.trackIndex !== undefined) {
		if (typeof timeline.trackIndex !== "number" || timeline.trackIndex < 0) {
			throw new Error(`${path}.trackIndex: must be a non-negative number`);
		}
	}

	let role: TrackRole | undefined;
	if (timeline.role !== undefined) {
		if (typeof timeline.role !== "string") {
			throw new Error(`${path}.role: must be a string`);
		}
		const normalizedRole = timeline.role;
		if (
			normalizedRole !== "clip" &&
			normalizedRole !== "overlay" &&
			normalizedRole !== "effect" &&
			normalizedRole !== "audio"
		) {
			throw new Error(
				`${path}.role: must be one of clip | overlay | effect | audio`,
			);
		}
		role = normalizedRole as TrackRole;
	}

	return {
		start: timeline.start,
		end: timeline.end,
		startTimecode: timeline.startTimecode,
		endTimecode: timeline.endTimecode,
		...(timeline.trackIndex !== undefined
			? { trackIndex: timeline.trackIndex }
			: {}),
		...(role ? { role } : {}),
	};
}

function ensureTimecodes(
	element: TimelineElement,
	fps: number,
): TimelineElement {
	const startTimecode = framesToTimecode(element.timeline.start, fps);
	const endTimecode = framesToTimecode(element.timeline.end, fps);
	if (
		element.timeline.startTimecode === startTimecode &&
		element.timeline.endTimecode === endTimecode
	) {
		return element;
	}
	return {
		...element,
		timeline: {
			...element.timeline,
			startTimecode,
			endTimecode,
		},
	};
}

/**
 * 验证 render 属性
 */
function validateRender(render: any, path: string): RenderMeta {
	if (!render || typeof render !== "object") {
		return {};
	}

	const result: RenderMeta = {};

	if (render.zIndex !== undefined) {
		if (typeof render.zIndex !== "number") {
			throw new Error(`${path}.zIndex: must be a number`);
		}
		result.zIndex = render.zIndex;
	}

	if (render.visible !== undefined) {
		if (typeof render.visible !== "boolean") {
			throw new Error(`${path}.visible: must be a boolean`);
		}
		result.visible = render.visible;
	}

	if (render.opacity !== undefined) {
		if (
			typeof render.opacity !== "number" ||
			render.opacity < 0 ||
			render.opacity > 1
		) {
			throw new Error(`${path}.opacity: must be a number between 0 and 1`);
		}
		result.opacity = render.opacity;
	}

	return result;
}

/**
 * 辅助函数：将旧的 left/top 坐标（左上角坐标系）转换为新的 center 坐标（画布中心坐标系）
 * @param layout 旧的布局信息（左上角坐标系）
 * @param pictureSize 画布尺寸，用于坐标系转换
 */
export function convertLegacyLayoutToTransform(
	layout: {
		left: number;
		top: number;
		width: number;
		height: number;
		rotate?: string;
	},
	pictureSize: { width: number; height: number } = {
		width: 1920,
		height: 1080,
	},
): TransformMeta {
	// 从左上角坐标系转换到画布中心坐标系
	// 元素中心相对于画布左上角的坐标
	const centerXFromTopLeft = layout.left + layout.width / 2;
	const centerYFromTopLeft = layout.top + layout.height / 2;

	// 转换为相对于画布中心的坐标
	const centerX = centerXFromTopLeft - pictureSize.width / 2;
	const centerY = centerYFromTopLeft - pictureSize.height / 2;

	// 解析旋转角度（从 "45deg" 转换为弧度）
	let rotation = 0;
	if (layout.rotate) {
		const match = layout.rotate.match(/^([-\d.]+)deg$/);
		if (match) {
			const degrees = parseFloat(match[1]);
			rotation = (degrees * Math.PI) / 180;
		}
	}

	return {
		centerX,
		centerY,
		width: layout.width,
		height: layout.height,
		rotation,
	};
}

/**
 * 辅助函数：将新的 center 坐标（画布中心坐标系）转换为旧的 left/top 坐标（左上角坐标系，用于向后兼容）
 * @param transform 变换属性（画布中心坐标系）
 * @param pictureSize 画布尺寸，用于坐标系转换
 */
export function convertTransformToLegacyLayout(
	transform: TransformMeta,
	pictureSize: { width: number; height: number } = {
		width: 1920,
		height: 1080,
	},
): {
	left: number;
	top: number;
	width: number;
	height: number;
	rotate: string;
} {
	// 从画布中心坐标系转换到左上角坐标系
	// 元素中心相对于画布左上角的坐标
	const centerXFromTopLeft = transform.centerX + pictureSize.width / 2;
	const centerYFromTopLeft = transform.centerY + pictureSize.height / 2;

	// 计算左上角坐标
	const left = centerXFromTopLeft - transform.width / 2;
	const top = centerYFromTopLeft - transform.height / 2;
	const degrees = (transform.rotation * 180) / Math.PI;

	return {
		left,
		top,
		width: transform.width,
		height: transform.height,
		rotate: `${degrees}deg`,
	};
}
