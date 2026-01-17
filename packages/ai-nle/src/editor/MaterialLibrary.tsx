/**
 * 素材库组件
 * 用于展示可拖拽的素材（图片、视频等）
 */

import { useDrag } from "@use-gesture/react";
import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	calculateAutoScrollSpeed,
	useDragStore,
	type DragGhostInfo,
	type DropTargetInfo,
	type MaterialDragData,
} from "./drag";
import {
	getTrackHitFromHeights,
	getTrackYFromHeights,
} from "./utils/trackAssignment";

// ============================================================================
// 类型定义
// ============================================================================

interface MaterialItem {
	id: string;
	type: "image" | "video";
	name: string;
	uri: string;
	thumbnailUrl: string;
	width?: number;
	height?: number;
	duration?: number;
}

interface MaterialCardProps {
	item: MaterialItem;
	onTimelineDrop?: (item: MaterialItem, trackIndex: number, time: number) => void;
	onPreviewDrop?: (item: MaterialItem, canvasX: number, canvasY: number) => void;
}

// ============================================================================
// 素材卡片组件
// ============================================================================

const MaterialCard: React.FC<MaterialCardProps> = ({ item, onTimelineDrop, onPreviewDrop }) => {
	const cardRef = useRef<HTMLDivElement>(null);
	const {
		startDrag,
		updateGhost,
		updateDropTarget,
		endDrag,
		isDragging,
		ghostInfo,
		dragSource,
		setAutoScrollSpeedX,
		setAutoScrollSpeedY,
		stopAutoScroll,
	} = useDragStore();

	// 记录初始鼠标偏移
	const initialOffsetRef = useRef({ x: 0, y: 0 });

	// 检测时间线拖拽目标
	const detectDropTarget = (
		mouseX: number,
		mouseY: number,
	): DropTargetInfo | null => {
		// 首先检查预览画布
		const previewZone = document.querySelector<HTMLElement>(
			"[data-preview-drop-zone]",
		);
		if (previewZone) {
			const rect = previewZone.getBoundingClientRect();
			if (
				mouseY >= rect.top &&
				mouseY <= rect.bottom &&
				mouseX >= rect.left &&
				mouseX <= rect.right
			) {
				// 获取画布参数
				const zoomLevel = parseFloat(previewZone.dataset.zoomLevel || "1");
				const offsetX = parseFloat(previewZone.dataset.offsetX || "0");
				const offsetY = parseFloat(previewZone.dataset.offsetY || "0");
				const pictureWidth = parseFloat(previewZone.dataset.pictureWidth || "1920");
				const pictureHeight = parseFloat(previewZone.dataset.pictureHeight || "1080");

				// 计算画布坐标（左上角坐标系，0 到 pictureWidth/Height）
				const topLeftX = (mouseX - rect.left - offsetX) / zoomLevel;
				const topLeftY = (mouseY - rect.top - offsetY) / zoomLevel;

				// 检查是否在画布范围内
				const isInBounds =
					topLeftX >= 0 &&
					topLeftX <= pictureWidth &&
					topLeftY >= 0 &&
					topLeftY <= pictureHeight;

				// 转换为中心坐标系（centerX/centerY 相对于画布中心）
				const canvasX = topLeftX - pictureWidth / 2;
				const canvasY = topLeftY - pictureHeight / 2;

				return {
					zone: "preview",
					canvasX,
					canvasY,
					canDrop: isInBounds,
				};
			}
		}

		// 查找主轨道区域
		const mainZone = document.querySelector<HTMLElement>(
			'[data-track-drop-zone="main"]',
		);
		// 查找其他轨道区域
		const otherZone = document.querySelector<HTMLElement>(
			'[data-track-drop-zone="other"]',
		);

		// 检查主轨道
		if (mainZone) {
			const rect = mainZone.getBoundingClientRect();
			if (
				mouseY >= rect.top &&
				mouseY <= rect.bottom &&
				mouseX >= rect.left &&
				mouseX <= rect.right
			) {
				// 计算时间位置（需要获取 ratio 和 scrollLeft）
				const contentArea = mainZone.querySelector<HTMLElement>(
					'[data-track-content-area="main"]',
				);
				if (contentArea) {
					const contentRect = contentArea.getBoundingClientRect();
					const scrollLeft = useDragStore.getState().timelineScrollLeft;
					const ratio = 50; // TODO: 从配置获取
					const time = Math.max(
						0,
						(mouseX - contentRect.left + scrollLeft) / ratio,
					);

					return {
						zone: "timeline",
						trackIndex: 0,
						time,
						canDrop: true,
					};
				}
			}
		}

		// 检查其他轨道
		if (otherZone) {
			const rect = otherZone.getBoundingClientRect();
			const otherTrackCount = parseInt(
				otherZone.dataset.trackCount || "0",
				10,
			);
			const trackHeight = parseInt(otherZone.dataset.trackHeight || "60", 10);
			const trackHeights = parseTrackHeights(otherZone.dataset.trackHeights);

			if (
				mouseY >= rect.top &&
				mouseY <= rect.bottom &&
				mouseX >= rect.left &&
				mouseX <= rect.right &&
				otherTrackCount > 0
			) {
				const contentArea = otherZone.querySelector<HTMLElement>(
					'[data-track-content-area="other"]',
				);
				if (contentArea) {
					const contentRect = contentArea.getBoundingClientRect();
					const contentRelativeY = mouseY - contentRect.top;
					let targetTrackIndex: number | null = null;
					if (trackHeights.length > 0) {
						const hit = getTrackHitFromHeights(
							contentRelativeY,
							trackHeights,
							otherTrackCount,
						);
						if (hit) {
							targetTrackIndex = Math.max(
								1,
								Math.min(otherTrackCount, hit.trackIndex),
							);
						}
					}
					if (targetTrackIndex === null) {
						const trackFromTop = Math.floor(contentRelativeY / trackHeight);
						targetTrackIndex = Math.max(
							1,
							Math.min(otherTrackCount, otherTrackCount - trackFromTop),
						);
					}

					const scrollLeft = useDragStore.getState().timelineScrollLeft;
					const ratio = 50;
					const time = Math.max(
						0,
						(mouseX - contentRect.left + scrollLeft) / ratio,
					);

					return {
						zone: "timeline",
						trackIndex: targetTrackIndex,
						time,
						canDrop: true,
					};
				}
			}
		}

		return null;
	};

	const bindDrag = useDrag(
		({ xy, first, last, event }) => {
			if (first) {
				event?.preventDefault();
				event?.stopPropagation();

				// 计算鼠标相对于卡片的偏移
				if (cardRef.current) {
					const rect = cardRef.current.getBoundingClientRect();
					initialOffsetRef.current = {
						x: xy[0] - rect.left,
						y: xy[1] - rect.top,
					};
				}

				// 创建拖拽数据
				const dragData: MaterialDragData = {
					type: item.type,
					uri: item.uri,
					name: item.name,
					thumbnailUrl: item.thumbnailUrl,
					width: item.width,
					height: item.height,
					duration: item.duration,
				};

				// 创建 Ghost 信息
				const ghost: DragGhostInfo = {
					screenX: xy[0] - initialOffsetRef.current.x,
					screenY: xy[1] - initialOffsetRef.current.y,
					width: 120,
					height: 80,
					thumbnailUrl: item.thumbnailUrl,
					label: item.name,
				};

				startDrag("material-library", dragData, ghost);
			} else if (last) {
				stopAutoScroll();

				// 检查是否放置在有效目标上
				const currentDropTarget = useDragStore.getState().dropTarget;
				if (currentDropTarget?.canDrop) {
					if (
						currentDropTarget.zone === "timeline" &&
						currentDropTarget.time !== undefined &&
						currentDropTarget.trackIndex !== undefined
					) {
						onTimelineDrop?.(item, currentDropTarget.trackIndex, currentDropTarget.time);
					} else if (
						currentDropTarget.zone === "preview" &&
						currentDropTarget.canvasX !== undefined &&
						currentDropTarget.canvasY !== undefined
					) {
						onPreviewDrop?.(item, currentDropTarget.canvasX, currentDropTarget.canvasY);
					}
				}

				endDrag();
			} else {
				// 更新 Ghost 位置
				updateGhost({
					screenX: xy[0] - initialOffsetRef.current.x,
					screenY: xy[1] - initialOffsetRef.current.y,
				});

				// 检测拖拽目标
				const dropTarget = detectDropTarget(xy[0], xy[1]);
				updateDropTarget(dropTarget);

				// 自动滚动检测
				const scrollArea = document.querySelector<HTMLElement>(
					"[data-timeline-scroll-area]",
				);
				if (scrollArea) {
					const scrollRect = scrollArea.getBoundingClientRect();
					const speedX = calculateAutoScrollSpeed(
						xy[0],
						scrollRect.left,
						scrollRect.right,
					);
					setAutoScrollSpeedX(speedX);
				}

				const verticalScrollArea = document.querySelector<HTMLElement>(
					"[data-vertical-scroll-area]",
				);
				if (verticalScrollArea) {
					const verticalRect = verticalScrollArea.getBoundingClientRect();
					const speedY = calculateAutoScrollSpeed(
						xy[1],
						verticalRect.top,
						verticalRect.bottom,
					);
					setAutoScrollSpeedY(speedY);
				}
			}
		},
		{ filterTaps: true },
	);

	const isBeingDragged =
		isDragging && dragSource === "material-library" && ghostInfo !== null;

	return (
		<div
			ref={cardRef}
			{...bindDrag()}
			className={`relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing transition-opacity ${
				isBeingDragged ? "opacity-50" : "opacity-100"
			}`}
			style={{ touchAction: "none" }}
		>
			<img
				src={item.thumbnailUrl}
				alt={item.name}
				className="w-full h-20 object-cover"
				draggable={false}
			/>
			<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
				<div className="text-xs text-white truncate">{item.name}</div>
			</div>
			{item.type === "video" && item.duration && (
				<div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
					{formatDuration(item.duration)}
				</div>
			)}
		</div>
	);
};

// ============================================================================
// 辅助函数
// ============================================================================

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function parseTrackHeights(value?: string): number[] {
	if (!value) return [];
	return value
		.split(",")
		.map((part) => parseInt(part, 10))
		.filter((height) => Number.isFinite(height) && height > 0);
}

// ============================================================================
// Ghost 渲染组件
// ============================================================================

const DragGhost: React.FC = () => {
	const { isDragging, ghostInfo, dragSource } = useDragStore();

	if (!isDragging || !ghostInfo) return null;

	// 素材库拖拽的 Ghost
	if (dragSource === "material-library") {
		return createPortal(
			<div
				className="fixed pointer-events-none z-[9999]"
				style={{
					left: ghostInfo.screenX,
					top: ghostInfo.screenY,
					width: ghostInfo.width,
					height: ghostInfo.height,
				}}
			>
				{ghostInfo.thumbnailUrl && (
					<img
						src={ghostInfo.thumbnailUrl}
						alt=""
						className="w-full h-full object-cover rounded-md opacity-80"
					/>
				)}
				<div className="absolute inset-0 border-2 border-blue-500 rounded-md shadow-lg shadow-blue-500/30" />
				{ghostInfo.label && (
					<div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-white bg-black/60 rounded px-1 py-0.5 truncate">
						{ghostInfo.label}
					</div>
				)}
			</div>,
			document.body,
		);
	}

	// 时间线元素拖拽的 Ghost（使用克隆的 HTML）
	if (dragSource === "timeline" && ghostInfo.clonedHtml) {
		return createPortal(
			<div
				className="fixed pointer-events-none z-[9999]"
				style={{
					left: ghostInfo.screenX,
					top: ghostInfo.screenY,
					width: ghostInfo.width,
					height: ghostInfo.height,
				}}
			>
				<div
					className="absolute inset-0 opacity-60"
					dangerouslySetInnerHTML={{ __html: ghostInfo.clonedHtml }}
				/>
				<div className="absolute inset-0 border-2 border-blue-500 rounded-md shadow-lg shadow-blue-500/30" />
			</div>,
			document.body,
		);
	}

	return null;
};

// ============================================================================
// Drop 指示器组件（用于素材库拖拽到时间线）
// ============================================================================

const MaterialDropIndicator: React.FC = () => {
	const { isDragging, dragSource, dropTarget } = useDragStore();

	if (!isDragging || dragSource !== "material-library" || !dropTarget) {
		return null;
	}

	if (dropTarget.zone !== "timeline" || !dropTarget.canDrop) {
		return null;
	}

	// 查找目标区域的 DOM 元素
	const trackIndex = dropTarget.trackIndex ?? 0;
	const time = dropTarget.time ?? 0;
	const ratio = 50; // TODO: 从配置获取
	const defaultDuration = 5; // 默认 5 秒
	const elementWidth = defaultDuration * ratio;

	let targetZone: HTMLElement | null = null;
	let screenX = 0;
	let screenY = 0;
	let indicatorHeight = 40;

	if (trackIndex === 0) {
		targetZone = document.querySelector<HTMLElement>(
			'[data-track-drop-zone="main"]',
		);
		if (targetZone) {
			const contentArea = targetZone.querySelector<HTMLElement>(
				'[data-track-content-area="main"]',
			);
			if (contentArea) {
				const contentRect = contentArea.getBoundingClientRect();
				const scrollLeft = useDragStore.getState().timelineScrollLeft;
				screenX = contentRect.left + time * ratio - scrollLeft;
				screenY = contentRect.top;
				indicatorHeight = contentRect.height || indicatorHeight;
			}
		}
	} else {
		targetZone = document.querySelector<HTMLElement>(
			'[data-track-drop-zone="other"]',
		);
		if (targetZone) {
			const contentArea = targetZone.querySelector<HTMLElement>(
				'[data-track-content-area="other"]',
			);
			const otherTrackCount = parseInt(
				targetZone.dataset.trackCount || "0",
				10,
			);
			const trackHeights = parseTrackHeights(targetZone.dataset.trackHeights);
			const fallbackTrackHeight = parseInt(
				targetZone.dataset.trackHeight || "60",
				10,
			);
			if (contentArea) {
				const contentRect = contentArea.getBoundingClientRect();
				const scrollLeft = useDragStore.getState().timelineScrollLeft;
				const trackFromTop = otherTrackCount - trackIndex;
				const trackHeightForIndex =
					trackHeights.length > 0
						? trackHeights[
								Math.max(
									0,
									Math.min(trackHeights.length - 1, trackFromTop),
								)
						  ]
						: fallbackTrackHeight;
				const trackY =
					trackHeights.length > 0
						? getTrackYFromHeights(trackIndex, trackHeights, otherTrackCount)
						: (otherTrackCount - trackIndex) * fallbackTrackHeight;
				screenX = contentRect.left + time * ratio - scrollLeft;
				screenY = contentRect.top + trackY;
				indicatorHeight = trackHeightForIndex;
			}
		}
	}

	if (!targetZone) return null;

	return createPortal(
		<div
			className="fixed bg-green-500/20 border-2 border-green-500 border-dashed z-[9998] pointer-events-none rounded-md box-border"
			style={{
				left: screenX,
				top: screenY,
				width: elementWidth,
				height: indicatorHeight,
			}}
		/>,
		document.body,
	);
};

// ============================================================================
// 素材库面板组件
// ============================================================================

// 示例素材数据
const DEMO_MATERIALS: MaterialItem[] = [
	{
		id: "material-1",
		type: "image",
		name: "示例图片",
		uri: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
		thumbnailUrl:
			"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200",
		width: 1920,
		height: 1080,
	},
	{
		id: "material-2",
		type: "image",
		name: "风景照片",
		uri: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800",
		thumbnailUrl:
			"https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200",
		width: 1920,
		height: 1280,
	},
];

interface MaterialLibraryProps {
	className?: string;
	onTimelineDrop?: (item: MaterialItem, trackIndex: number, time: number) => void;
	onPreviewDrop?: (item: MaterialItem, canvasX: number, canvasY: number) => void;
}

const MaterialLibrary: React.FC<MaterialLibraryProps> = ({
	className,
	onTimelineDrop,
	onPreviewDrop,
}) => {
	const [isOpen, setIsOpen] = useState(true);

	return (
		<>
			{/* 素材库面板 */}
			<div
				className={`absolute top-16 left-4 z-100 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl ${className ?? ""}`}
				style={{ width: 200 }}
			>
				{/* 标题栏 */}
				<div
					className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-pointer"
					onClick={() => setIsOpen(!isOpen)}
				>
					<span className="text-sm font-medium text-white">素材库</span>
					<span className="text-neutral-400 text-xs">
						{isOpen ? "▼" : "▶"}
					</span>
				</div>

				{/* 内容区 */}
				{isOpen && (
					<div className="p-2 space-y-2 max-h-80 overflow-y-auto">
						{DEMO_MATERIALS.map((item) => (
							<MaterialCard
								key={item.id}
								item={item}
								onTimelineDrop={onTimelineDrop}
								onPreviewDrop={onPreviewDrop}
							/>
						))}
					</div>
				)}
			</div>

			{/* 全局 Ghost 渲染 */}
			<DragGhost />
			{/* 素材库拖拽的 Drop 指示器 */}
			<MaterialDropIndicator />
		</>
	);
};

export default MaterialLibrary;
export type { MaterialItem };
