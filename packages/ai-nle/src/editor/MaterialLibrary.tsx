/**
 * 素材库组件
 * 用于展示可拖拽的素材（图片、视频等）
 */

import React, { useState } from "react";
import { framesToTimecode } from "@/utils/timecode";
import { useFps } from "./contexts/TimelineContext";
import MaterialDragOverlay from "./drag/MaterialDragOverlay";
import {
	type MaterialDndContext,
	type MaterialDndItem,
	useMaterialDnd,
	useMaterialDndContext,
} from "./drag/materialDnd";

// ============================================================================
// 类型定义
// ============================================================================

type MaterialItem = MaterialDndItem & { thumbnailUrl: string };

interface MaterialCardProps {
	item: MaterialItem;
	onTimelineDrop?: (
		item: MaterialItem,
		trackIndex: number,
		time: number,
		dropTargetType?: "track" | "gap",
	) => void;
	onPreviewDrop?: (
		item: MaterialItem,
		canvasX: number,
		canvasY: number,
	) => void;
	dndContext: MaterialDndContext;
}

// ============================================================================
// 素材卡片组件
// ============================================================================

const MaterialCard: React.FC<MaterialCardProps> = ({
	item,
	onTimelineDrop,
	onPreviewDrop,
	dndContext,
}) => {
	const { fps } = useFps();
	const { bindDrag, dragRef, isBeingDragged } = useMaterialDnd({
		item,
		context: dndContext,
		onTimelineDrop,
		onPreviewDrop,
	});

	return (
		<div
			ref={dragRef as React.RefObject<HTMLDivElement>}
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
			<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2">
				<div className="text-xs text-white truncate">{item.name}</div>
			</div>
			{item.type === "video" && item.duration && (
				<div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
					{formatDuration(item.duration, fps)}
				</div>
			)}
		</div>
	);
};

// ============================================================================
// 辅助函数
// ============================================================================

function formatDuration(frames: number, fps: number): string {
	return framesToTimecode(frames, fps);
}

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
	{
		id: "material-transition-1",
		type: "transition",
		name: "淡入淡出",
		uri: "transition://fade",
		thumbnailUrl:
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='80'><rect width='200' height='80' fill='%236363f1'/><path d='M0 0 L200 80 M0 80 L200 0' stroke='%23ffffff' stroke-width='6' opacity='0.7'/><text x='100' y='50' font-size='26' fill='%23ffffff' text-anchor='middle' font-family='Arial'>T</text></svg>",
		duration: 15,
	},
];

interface MaterialLibraryProps {
	className?: string;
	onTimelineDrop?: (
		item: MaterialItem,
		trackIndex: number,
		time: number,
		dropTargetType?: "track" | "gap",
	) => void;
	onPreviewDrop?: (
		item: MaterialItem,
		canvasX: number,
		canvasY: number,
	) => void;
}

const MaterialLibrary: React.FC<MaterialLibraryProps> = ({
	className,
	onTimelineDrop,
	onPreviewDrop,
}) => {
	const [isOpen, setIsOpen] = useState(true);
	const dndContext = useMaterialDndContext();

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
					<span className="text-neutral-400 text-xs">{isOpen ? "▼" : "▶"}</span>
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
								dndContext={dndContext}
							/>
						))}
					</div>
				)}
			</div>

			<MaterialDragOverlay />
		</>
	);
};

export default MaterialLibrary;
export type { MaterialItem };
