/**
 * 轨道配置系统
 * 定义不同类型轨道的属性和兼容性规则
 */

import { TrackCategory, TrackConfig, TrackInstance } from "./types";

// ============================================================================
// 默认轨道配置
// ============================================================================

/**
 * 默认轨道高度
 */
export const DEFAULT_TRACK_HEIGHT = 60;

/**
 * 轨道内容与边界的统一间隙
 */
export const TRACK_CONTENT_GAP = 6;

/**
 * 元素默认高度
 */
export const DEFAULT_ELEMENT_HEIGHT = DEFAULT_TRACK_HEIGHT - TRACK_CONTENT_GAP;

export function getElementHeightForTrack(trackHeight: number): number {
	return Math.max(0, trackHeight - TRACK_CONTENT_GAP);
}

/**
 * 间隙检测阈值（像素）
 */
export const GAP_THRESHOLD = 12;

/**
 * 显著垂直移动阈值（轨道高度的比例）
 */
export const SIGNIFICANT_VERTICAL_MOVE_RATIO = 0.5;

/**
 * 各类别轨道的默认配置
 */
export const DEFAULT_TRACK_CONFIGS: Record<TrackCategory, TrackConfig> = {
	main: {
		category: "main",
		height: 64,
		compatibleWith: ["main"], // 主轨道只能放主要内容
		canCreateNew: false, // 主轨道不能创建新的
		minTracks: 1,
		maxTracks: 1,
	},
	overlay: {
		category: "overlay",
		height: 32,
		compatibleWith: ["overlay"], // 贴纸、水印等可以共存
		canCreateNew: true,
		minTracks: 0,
		maxTracks: -1,
	},
	subtitle: {
		category: "subtitle",
		height: 32,
		compatibleWith: ["subtitle"],
		canCreateNew: true,
		minTracks: 0,
		maxTracks: -1,
	},
	filter: {
		category: "filter",
		height: 32,
		compatibleWith: ["filter"],
		canCreateNew: true,
		minTracks: 0,
		maxTracks: -1,
	},
	transition: {
		category: "transition",
		height: 32,
		compatibleWith: ["transition"],
		canCreateNew: true,
		minTracks: 0,
		maxTracks: 1, // 转场一般只有一个轨道
	},
	audio: {
		category: "audio",
		height: 32,
		compatibleWith: ["audio"],
		canCreateNew: true,
		minTracks: 0,
		maxTracks: -1,
	},
};

// ============================================================================
// 元素类型到轨道类别的映射
// ============================================================================

/**
 * 元素类型到轨道类别的默认映射
 * 可以通过 registerElementCategory 扩展
 */
const elementCategoryMap = new Map<string, TrackCategory>([
	// 主要内容
	["Clip", "main"],
	["Image", "main"],
	["CloudBackground", "main"],
	// 叠加层
	["Lottie", "overlay"],
	["BackdropZoom", "overlay"],
	// 滤镜
	["ColorFilterLayer", "filter"],
	// 更多类型可以通过 registerElementCategory 添加
]);

/**
 * 注册元素类型的轨道类别
 */
export function registerElementCategory(
	elementType: string,
	category: TrackCategory,
): void {
	elementCategoryMap.set(elementType, category);
}

/**
 * 获取元素类型的轨道类别
 */
export function getElementCategory(elementType: string): TrackCategory {
	return elementCategoryMap.get(elementType) ?? "overlay"; // 默认为叠加层
}

/**
 * 获取轨道配置
 */
export function getTrackConfig(category: TrackCategory): TrackConfig {
	return DEFAULT_TRACK_CONFIGS[category] ?? DEFAULT_TRACK_CONFIGS.overlay;
}

// ============================================================================
// 轨道兼容性检查
// ============================================================================

/**
 * 检查元素是否可以放置在指定类别的轨道上
 */
export function canElementBeOnTrack(
	elementType: string,
	trackCategory: TrackCategory,
): boolean {
	const elementCategory = getElementCategory(elementType);
	const trackConfig = getTrackConfig(trackCategory);
	return trackConfig.compatibleWith.includes(elementCategory);
}

/**
 * 检查两个元素是否可以共存于同一轨道
 */
export function canElementsCoexist(
	elementType1: string,
	elementType2: string,
): boolean {
	const category1 = getElementCategory(elementType1);
	const category2 = getElementCategory(elementType2);
	const config1 = getTrackConfig(category1);
	return config1.compatibleWith.includes(category2);
}

// ============================================================================
// 轨道布局计算
// ============================================================================

/**
 * 轨道布局配置
 */
export interface TrackLayoutConfig {
	/** 各类别的轨道配置覆盖 */
	trackConfigs?: Partial<Record<TrackCategory, Partial<TrackConfig>>>;
	/** 轨道间距 */
	trackGap?: number;
}

/**
 * 计算轨道实例列表
 * 根据元素列表和配置，生成运行时的轨道布局
 */
export function calculateTrackLayout(
	trackIndices: Map<string, number>,
	_elementTypes: Map<string, string>,
	config?: TrackLayoutConfig,
): TrackInstance[] {
	// 暂时使用简化版本，所有轨道使用相同高度
	// 未来可以根据元素类型计算不同高度
	const tracks: TrackInstance[] = [];
	const maxTrackIndex = Math.max(0, ...trackIndices.values());

	let currentY = 0;
	for (let i = maxTrackIndex; i >= 0; i--) {
		// 从上到下排列，高索引在上
		const category: TrackCategory = i === 0 ? "main" : "overlay";
		const trackConfig = getTrackConfig(category);
		const height =
			config?.trackConfigs?.[category]?.height ?? trackConfig.height;

		tracks.push({
			id: `track-${i}`,
			index: i,
			category,
			config: { ...trackConfig, height },
			y: currentY,
		});

		currentY += height + (config?.trackGap ?? 0);
	}

	return tracks;
}

/**
 * 根据 Y 坐标获取轨道索引
 */
export function getTrackIndexFromY(
	y: number,
	trackHeight: number,
	totalTracks: number,
): number {
	const trackFromTop = Math.floor(y / trackHeight);
	return Math.max(0, totalTracks - 1 - trackFromTop);
}

/**
 * 根据轨道索引获取 Y 坐标
 */
export function getYFromTrackIndex(
	trackIndex: number,
	trackHeight: number,
	totalTracks: number,
): number {
	return (totalTracks - 1 - trackIndex) * trackHeight;
}
