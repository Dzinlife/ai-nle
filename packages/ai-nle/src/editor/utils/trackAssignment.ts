import { TimelineElement } from "@/dsl/types";

/**
 * 主轨道索引（固定为 0，显示在最底部）
 */
export const MAIN_TRACK_INDEX = 0;

/**
 * 检查两个时间范围是否重叠
 */
export function isTimeOverlapping(
	start1: number,
	end1: number,
	start2: number,
	end2: number,
): boolean {
	const epsilon = 1e-4;
	return start1 < end2 - epsilon && end1 > start2 + epsilon;
}

/**
 * 检查元素是否与轨道上的其他元素重叠
 * @param element 要检查的元素
 * @param trackIndex 目标轨道
 * @param elements 所有元素
 * @param assignments 当前轨道分配
 * @param excludeId 排除的元素ID（通常是正在移动的元素自身）
 */
export function hasOverlapOnTrack(
	start: number,
	end: number,
	trackIndex: number,
	elements: TimelineElement[],
	assignments: Map<string, number>,
	excludeId?: string,
): boolean {
	for (const el of elements) {
		if (el.id === excludeId) continue;
		const elTrack = assignments.get(el.id);
		if (elTrack !== trackIndex) continue;

		if (isTimeOverlapping(start, end, el.timeline.start, el.timeline.end)) {
			return true;
		}
	}
	return false;
}

/**
 * 检查元素是否与轨道上的其他元素重叠（基于存储的 trackIndex）
 * 此函数直接使用元素的 timeline.trackIndex，避免 assignTracks 的级联重新分配问题
 *
 * @param start 开始时间
 * @param end 结束时间
 * @param trackIndex 目标轨道
 * @param elements 所有元素
 * @param excludeId 排除的元素ID
 */
export function hasOverlapOnStoredTrack(
	start: number,
	end: number,
	trackIndex: number,
	elements: TimelineElement[],
	excludeId?: string,
): boolean {
	for (const el of elements) {
		if (el.id === excludeId) continue;
		const elStoredTrack = el.timeline.trackIndex ?? 0;
		if (elStoredTrack !== trackIndex) continue;

		if (isTimeOverlapping(start, end, el.timeline.start, el.timeline.end)) {
			return true;
		}
	}
	return false;
}

/**
 * 从指定轨道向上查找可用轨道（基于存储的 trackIndex）
 *
 * @param start 开始时间
 * @param end 结束时间
 * @param targetTrack 目标轨道
 * @param elements 所有元素
 * @param excludeId 排除的元素ID
 * @param maxTrack 最大轨道索引
 * @returns 可用的轨道索引，如果没有则返回 maxTrack + 1
 */
export function findAvailableStoredTrack(
	start: number,
	end: number,
	targetTrack: number,
	elements: TimelineElement[],
	excludeId: string,
	maxTrack: number,
): number {
	for (let track = targetTrack; track <= maxTrack; track++) {
		if (!hasOverlapOnStoredTrack(start, end, track, elements, excludeId)) {
			return track;
		}
	}
	// 所有现有轨道都有重叠
	return maxTrack + 1;
}

/**
 * 为元素找到合适的轨道位置
 * 如果目标轨道有重叠，向上寻找直到找到空闲位置或创建新轨道
 *
 * @param start 元素开始时间
 * @param end 元素结束时间
 * @param targetTrack 目标轨道（用户拖拽到的位置）
 * @param elements 所有元素
 * @param assignments 当前轨道分配
 * @param excludeId 排除的元素ID
 * @param trackCount 当前轨道总数
 * @returns 最终放置的轨道索引
 */
export function findAvailableTrack(
	start: number,
	end: number,
	targetTrack: number,
	elements: TimelineElement[],
	assignments: Map<string, number>,
	excludeId: string,
	trackCount: number,
): number {
	// 从目标轨道开始向上寻找
	for (let track = targetTrack; track < trackCount + 1; track++) {
		if (!hasOverlapOnTrack(start, end, track, elements, assignments, excludeId)) {
			return track;
		}
	}
	// 如果所有现有轨道都有重叠，创建新轨道
	return trackCount;
}

/**
 * 基于元素的 timeline.trackIndex 进行轨道分配
 * 如果没有指定 trackIndex，默认放到主轨道（如果有重叠则向上）
 *
 * @param elements 所有时间线元素
 * @returns Map<elementId, trackIndex>
 */
export function assignTracks(
	elements: TimelineElement[],
): Map<string, number> {
	if (elements.length === 0) {
		return new Map();
	}

	const assignments = new Map<string, number>();

	// 按 trackIndex 排序处理（有明确轨道的优先）
	// 没有 trackIndex 的元素放到后面处理
	const sorted = [...elements].sort((a, b) => {
		const aTrack = a.timeline.trackIndex ?? -1;
		const bTrack = b.timeline.trackIndex ?? -1;
		if (aTrack === -1 && bTrack === -1) {
			// 都没有指定轨道，按 start 时间排序
			return a.timeline.start - b.timeline.start;
		}
		if (aTrack === -1) return 1; // a 没有指定，放后面
		if (bTrack === -1) return -1; // b 没有指定，放后面
		return aTrack - bTrack;
	});

	// 当前最大轨道索引
	let maxTrack = MAIN_TRACK_INDEX;

	for (const element of sorted) {
		const { start, end, trackIndex } = element.timeline;
		const targetTrack = trackIndex ?? MAIN_TRACK_INDEX;

		// 找到合适的轨道（如果目标轨道有重叠则向上寻找）
		const finalTrack = findAvailableTrack(
			start,
			end,
			targetTrack,
			elements,
			assignments,
			element.id,
			maxTrack + 1,
		);

		assignments.set(element.id, finalTrack);
		maxTrack = Math.max(maxTrack, finalTrack);
	}

	return assignments;
}

/**
 * 计算需要的轨道总数（至少1个主轨道）
 * @param assignments 轨道分配结果
 * @returns 轨道数量
 */
export function getTrackCount(assignments: Map<string, number>): number {
	if (assignments.size === 0) {
		return 1; // 至少有主轨道
	}
	return Math.max(...assignments.values()) + 1;
}

/**
 * 规范化轨道分配，移除空轨道（主轨道除外）
 * 当某个轨道没有元素时，将上方轨道的元素下移
 *
 * @param assignments 当前轨道分配
 * @returns 规范化后的轨道分配
 */
export function normalizeTrackAssignments(
	assignments: Map<string, number>,
): Map<string, number> {
	if (assignments.size === 0) {
		return new Map();
	}

	// 收集所有使用中的轨道索引
	const usedTracks = new Set<number>();
	for (const track of assignments.values()) {
		usedTracks.add(track);
	}

	// 主轨道始终存在
	usedTracks.add(MAIN_TRACK_INDEX);

	// 排序轨道索引
	const sortedTracks = [...usedTracks].sort((a, b) => a - b);

	// 创建旧轨道到新轨道的映射
	const trackMapping = new Map<number, number>();
	sortedTracks.forEach((oldTrack, newTrack) => {
		trackMapping.set(oldTrack, newTrack);
	});

	// 应用映射
	const normalized = new Map<string, number>();
	for (const [elementId, oldTrack] of assignments.entries()) {
		const newTrack = trackMapping.get(oldTrack) ?? oldTrack;
		normalized.set(elementId, newTrack);
	}

	return normalized;
}

/**
 * 根据 Y 坐标计算目标轨道索引
 * 注意：轨道 0（主轨道）在底部，轨道号越大位置越靠上
 *
 * @param y 拖拽位置 Y 坐标
 * @param trackHeight 每个轨道高度
 * @param totalTracks 轨道总数
 * @returns 目标轨道索引
 */
export function getTrackFromY(
	y: number,
	trackHeight: number,
	totalTracks: number,
): number {
	// Y 坐标从上到下增加
	// 轨道从上到下是：最高轨道 -> ... -> 轨道1 -> 主轨道(0)
	// 所以需要反转：y=0 对应最高轨道，y=max 对应主轨道
	const trackFromTop = Math.floor(y / trackHeight);
	const track = Math.max(0, totalTracks - 1 - trackFromTop);
	return track;
}

/**
 * 根据轨道索引计算 Y 坐标（用于渲染）
 * 注意：轨道 0（主轨道）在底部
 *
 * @param trackIndex 轨道索引
 * @param trackHeight 每个轨道高度
 * @param totalTracks 轨道总数
 * @returns Y 坐标
 */
export function getYFromTrack(
	trackIndex: number,
	trackHeight: number,
	totalTracks: number,
): number {
	// 轨道 0 在底部，轨道号越大位置越靠上
	return (totalTracks - 1 - trackIndex) * trackHeight;
}

/**
 * 间隙检测阈值（像素）- 轨道边缘多少像素范围内视为间隙
 */
export const GAP_THRESHOLD = 12;

/**
 * 拖拽目标类型
 */
export type DropTargetType = "track" | "gap";

export interface DropTarget {
	type: DropTargetType;
	trackIndex: number; // 对于 track 类型：目标轨道；对于 gap 类型：间隙上方的轨道
}

/**
 * 根据 Y 坐标判断拖拽目标（轨道或间隙）
 *
 * @param y 拖拽位置 Y 坐标（相对于时间线容器顶部）
 * @param trackHeight 每个轨道高度
 * @param totalTracks 轨道总数
 * @returns 拖拽目标信息
 */
export function getDropTarget(
	y: number,
	trackHeight: number,
	totalTracks: number,
): DropTarget {
	// Y 坐标从上到下增加
	// 轨道从上到下是：最高轨道(n-1) -> ... -> 轨道1 -> 主轨道(0)

	// 计算在哪个轨道区域内
	const trackFromTop = Math.floor(y / trackHeight);
	const positionInTrack = y % trackHeight;

	// 检测是否在轨道的上边缘（间隙区域）
	const isInUpperGap = positionInTrack < GAP_THRESHOLD;
	// 检测是否在轨道的下边缘（间隙区域）
	const isInLowerGap = positionInTrack > trackHeight - GAP_THRESHOLD;

	// 转换为轨道索引（从底部开始计数）
	const trackIndex = Math.max(0, totalTracks - 1 - trackFromTop);

	if (isInUpperGap && trackFromTop > 0) {
		// 在轨道上边缘 - 这是当前轨道和上方轨道之间的间隙
		// 间隙位于 trackIndex 和 trackIndex + 1 之间
		return {
			type: "gap",
			trackIndex: trackIndex + 1, // 新轨道将插入到这个位置
		};
	}

	if (isInLowerGap && trackIndex > 0) {
		// 在轨道下边缘 - 这是当前轨道和下方轨道之间的间隙
		// 间隙位于 trackIndex - 1 和 trackIndex 之间
		return {
			type: "gap",
			trackIndex: trackIndex, // 新轨道将插入到这个位置
		};
	}

	// 在轨道中间区域
	return {
		type: "track",
		trackIndex,
	};
}

/**
 * 插入新轨道：将指定位置及以上的所有轨道向上移动
 *
 * @param insertAt 插入位置（新轨道的索引）
 * @param assignments 当前轨道分配
 * @returns 更新后的轨道分配
 */
export function insertTrackAt(
	insertAt: number,
	assignments: Map<string, number>,
): Map<string, number> {
	const result = new Map<string, number>();

	for (const [elementId, track] of assignments.entries()) {
		if (track >= insertAt) {
			// 在插入位置或以上的轨道向上移动一位
			result.set(elementId, track + 1);
		} else {
			result.set(elementId, track);
		}
	}

	return result;
}
