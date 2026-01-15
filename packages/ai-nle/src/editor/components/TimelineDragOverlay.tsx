import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { DragGhostState } from "../contexts/TimelineContext";
import { DEFAULT_ELEMENT_HEIGHT } from "../timeline/trackConfig";
import { ExtendedDropTarget } from "../timeline/types";

interface TimelineDragOverlayProps {
	activeDropTarget: ExtendedDropTarget | null;
	dragGhosts: DragGhostState[];
	ratio: number;
	scrollLeft: number;
	otherTrackCount: number;
	trackHeight: number;
	timelinePaddingLeft?: number;
}

const TimelineDragOverlay: React.FC<TimelineDragOverlayProps> = ({
	activeDropTarget,
	dragGhosts,
	ratio,
	scrollLeft,
	otherTrackCount,
	trackHeight,
	timelinePaddingLeft = 0,
}) => {
	const dropIndicatorPortal = useMemo(() => {
		if (!activeDropTarget) return null;

		const elementWidth =
			(activeDropTarget.end - activeDropTarget.start) * ratio;

		let targetZone: HTMLElement | null = null;
		let screenX = 0;
		let screenY = 0;

		if (activeDropTarget.finalTrackIndex === 0) {
			targetZone = document.querySelector<HTMLElement>(
				'[data-track-drop-zone="main"]',
			);
			if (targetZone) {
				const contentArea = targetZone.querySelector<HTMLElement>(
					'[data-track-content-area="main"]',
				);
				if (contentArea) {
					const contentRect = contentArea.getBoundingClientRect();
					screenX =
						contentRect.left + activeDropTarget.start * ratio - scrollLeft;
					screenY = contentRect.top;
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
				if (contentArea) {
					const contentRect = contentArea.getBoundingClientRect();

					if (activeDropTarget.type === "gap") {
						const gapY =
							(otherTrackCount - activeDropTarget.trackIndex + 1) * trackHeight;
						screenX = contentRect.left - timelinePaddingLeft;
						screenY = contentRect.top + gapY - 3.5;

						const indicator = (
							<div
								className="fixed h-px bg-green-500 z-9998 pointer-events-none rounded-full shadow-lg shadow-green-500/50"
								style={{
									left: screenX,
									top: screenY,
									width: contentRect.width + timelinePaddingLeft,
								}}
							/>
						);
						return createPortal(indicator, document.body);
					}

					const trackY =
						(otherTrackCount - activeDropTarget.finalTrackIndex) * trackHeight;
					screenX =
						contentRect.left + activeDropTarget.start * ratio - scrollLeft;
					screenY = contentRect.top + trackY;
				}
			}
		}

		if (!targetZone) return null;

		const indicator = (
			<div
				className="fixed bg-blue-500/20 border-2 border-blue-500 border-dashed z-9998 pointer-events-none rounded-md box-border"
				style={{
					left: screenX,
					top: screenY,
					width: elementWidth,
					height: DEFAULT_ELEMENT_HEIGHT,
				}}
			/>
		);

		return createPortal(indicator, document.body);
	}, [activeDropTarget, ratio, scrollLeft, otherTrackCount, trackHeight]);

	const ghostElement = useMemo(() => {
		if (!dragGhosts.length) return null;

		const ghosts = dragGhosts.map((ghost) => (
			<div
				key={ghost.elementId}
				className="fixed pointer-events-none"
				style={{
					left: ghost.screenX,
					top: ghost.screenY,
					width: ghost.width,
					height: ghost.height,
					zIndex: 9999,
				}}
			>
				<div
					className="absolute inset-0 opacity-60"
					dangerouslySetInnerHTML={{ __html: ghost.clonedHtml }}
				/>
				<div className="absolute inset-0 border-2 border-blue-500 rounded-md shadow-lg shadow-blue-500/30" />
			</div>
		));

		return createPortal(ghosts, document.body);
	}, [dragGhosts]);

	return (
		<>
			{ghostElement}
			{dropIndicatorPortal}
		</>
	);
};

export default TimelineDragOverlay;
