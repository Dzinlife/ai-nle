import { TimelineElement } from "@/dsl/types";

/**
 * 层叠关联关系
 * - parentId: 父元素（底层元素）
 * - childId: 子元素（叠在父元素上方的元素）
 */
export interface AttachmentRelation {
	parentId: string;
	childId: string;
}

/**
 * 检查子元素是否完全包含在父元素的时间范围内
 */
function isTimeContained(
	parent: TimelineElement,
	child: TimelineElement,
): boolean {
	return (
		parent.timeline.start <= child.timeline.start &&
		parent.timeline.end >= child.timeline.end
	);
}

/**
 * 获取元素的 zIndex（默认为 0）
 */
function getZIndex(element: TimelineElement): number {
	return element.render?.zIndex ?? 0;
}

/**
 * 查找所有层叠关联关系
 *
 * 关联条件：
 * 1. 父元素的时间范围完全包含子元素
 * 2. 父元素的 zIndex 比子元素低
 * 3. 只关联最近的父元素（zIndex 最接近的）
 *
 * @param elements 所有时间线元素
 * @returns 父元素 ID -> 子元素 ID 列表 的映射
 */
export function findAttachments(
	elements: TimelineElement[],
): Map<string, string[]> {
	const result = new Map<string, string[]>();

	if (elements.length < 2) {
		return result;
	}

	// 按 zIndex 排序（从低到高）
	const sortedByZIndex = [...elements].sort(
		(a, b) => getZIndex(a) - getZIndex(b),
	);

	// 为每个元素找到其父元素（zIndex 更低且时间包含它的元素中 zIndex 最高的）
	for (let i = 1; i < sortedByZIndex.length; i++) {
		const child = sortedByZIndex[i];
		const childZIndex = getZIndex(child);

		// 从 zIndex 比 child 低的元素中，找到时间包含 child 且 zIndex 最高的
		let bestParent: TimelineElement | null = null;
		let bestParentZIndex = -Infinity;

		for (let j = i - 1; j >= 0; j--) {
			const candidate = sortedByZIndex[j];
			const candidateZIndex = getZIndex(candidate);

			// zIndex 必须比 child 低
			if (candidateZIndex >= childZIndex) continue;

			// 时间必须包含 child
			if (!isTimeContained(candidate, child)) continue;

			// 选择 zIndex 最高的（最近的父元素）
			if (candidateZIndex > bestParentZIndex) {
				bestParent = candidate;
				bestParentZIndex = candidateZIndex;
			}
		}

		if (bestParent) {
			const existing = result.get(bestParent.id) ?? [];
			existing.push(child.id);
			result.set(bestParent.id, existing);
		}
	}

	return result;
}

/**
 * 获取某个元素的所有子元素 ID
 */
export function getChildIds(
	attachments: Map<string, string[]>,
	parentId: string,
): string[] {
	return attachments.get(parentId) ?? [];
}

/**
 * 检查一个元素是否是另一个元素的子元素
 */
export function isChildOf(
	attachments: Map<string, string[]>,
	childId: string,
	parentId: string,
): boolean {
	const children = attachments.get(parentId);
	return children?.includes(childId) ?? false;
}

/**
 * 获取元素的父元素 ID（如果有）
 */
export function getParentId(
	attachments: Map<string, string[]>,
	childId: string,
): string | null {
	for (const [parentId, children] of attachments.entries()) {
		if (children.includes(childId)) {
			return parentId;
		}
	}
	return null;
}
