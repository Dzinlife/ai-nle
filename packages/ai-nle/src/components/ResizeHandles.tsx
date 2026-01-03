import React, { useCallback, useRef, useState } from "react";
import { Circle as KonvaCircle } from "react-konva";
import Konva from "konva";

export type ResizeHandlePosition =
	| "top-left"
	| "top-center"
	| "top-right"
	| "right-center"
	| "bottom-right"
	| "bottom-center"
	| "bottom-left"
	| "left-center";

interface ResizeHandlesProps {
	x: number;
	y: number;
	width: number;
	height: number;
	onResize: (
		position: ResizeHandlePosition,
		deltaX: number,
		deltaY: number,
		startX: number,
		startY: number,
		startWidth: number,
		startHeight: number,
	) => void;
	onResizeStart?: () => void;
	onResizeEnd?: () => void;
	handleSize?: number;
	handleColor?: string;
	handleStrokeColor?: string;
}

const ResizeHandles: React.FC<ResizeHandlesProps> = ({
	x,
	y,
	width,
	height,
	onResize,
	onResizeStart,
	onResizeEnd,
	handleSize = 8,
	handleColor = "#ffffff",
	handleStrokeColor = "#3b82f6",
}) => {
	const [resizingPosition, setResizingPosition] =
		useState<ResizeHandlePosition | null>(null);
	const startPosRef = useRef<{ x: number; y: number } | null>(null);
	const startSizeRef = useRef<{ width: number; height: number } | null>(null);

	const handlePositions: Array<{
		position: ResizeHandlePosition;
		x: number;
		y: number;
		cursor: string;
	}> = [
		{ position: "top-left", x: 0, y: 0, cursor: "nw-resize" },
		{ position: "top-center", x: width / 2, y: 0, cursor: "n-resize" },
		{ position: "top-right", x: width, y: 0, cursor: "ne-resize" },
		{ position: "right-center", x: width, y: height / 2, cursor: "e-resize" },
		{
			position: "bottom-right",
			x: width,
			y: height,
			cursor: "se-resize",
		},
		{
			position: "bottom-center",
			x: width / 2,
			y: height,
			cursor: "s-resize",
		},
		{ position: "bottom-left", x: 0, y: height, cursor: "sw-resize" },
		{ position: "left-center", x: 0, y: height / 2, cursor: "w-resize" },
	];

	const handleDragStart = useCallback(
		(position: ResizeHandlePosition, e: Konva.KonvaEventObject<DragEvent>) => {
			const node = e.target;
			const stage = node.getStage();
			if (!stage) return;

			const pointerPos = stage.getPointerPosition();
			if (!pointerPos) return;

			setResizingPosition(position);
			startPosRef.current = { x: pointerPos.x, y: pointerPos.y };
			startSizeRef.current = { width, height };
			onResizeStart?.();
		},
		[width, height, onResizeStart],
	);

	const handleDragMove = useCallback(
		(
			position: ResizeHandlePosition,
			e: Konva.KonvaEventObject<DragEvent>,
		) => {
			if (!startPosRef.current || !startSizeRef.current) return;

			const node = e.target;
			const stage = node.getStage();
			if (!stage) return;

			const pointerPos = stage.getPointerPosition();
			if (!pointerPos) return;

			const deltaX = pointerPos.x - startPosRef.current.x;
			const deltaY = pointerPos.y - startPosRef.current.y;

			onResize(
				position,
				deltaX,
				deltaY,
				x,
				y,
				startSizeRef.current.width,
				startSizeRef.current.height,
			);
		},
		[x, y, onResize],
	);

	const handleDragEnd = useCallback(() => {
		setResizingPosition(null);
		startPosRef.current = null;
		startSizeRef.current = null;
		onResizeEnd?.();
	}, [onResizeEnd]);

	return (
		<>
			{handlePositions.map(({ position, x: handleX, y: handleY, cursor }) => (
				<KonvaCircle
					key={position}
					x={x + handleX}
					y={y + handleY}
					radius={handleSize}
					fill={handleColor}
					stroke={handleStrokeColor}
					strokeWidth={2}
					draggable
					cursor={cursor}
					onDragStart={(e) => handleDragStart(position, e)}
					onDragMove={(e) => handleDragMove(position, e)}
					onDragEnd={handleDragEnd}
					hitStrokeWidth={10}
				/>
			))}
		</>
	);
};

export default ResizeHandles;
