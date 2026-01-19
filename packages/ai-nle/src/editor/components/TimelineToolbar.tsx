import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { exportCanvasAsImage } from "@/dsl/export";
import { cn } from "@/lib/utils";
import { usePreview } from "../contexts/PreviewProvider";
import {
	useAttachments,
	useMainTrackMagnet,
	usePlaybackControl,
	useSnap,
	useTimelineScale,
} from "../contexts/TimelineContext";

const TimelineToolbar: React.FC<{ className?: string }> = ({ className }) => {
	const { isPlaying, togglePlay } = usePlaybackControl();
	const { canvasRef } = usePreview();
	const [isExporting, setIsExporting] = useState(false);
	const { snapEnabled, setSnapEnabled } = useSnap();
	const { autoAttach, setAutoAttach } = useAttachments();
	const { mainTrackMagnetEnabled, setMainTrackMagnetEnabled } =
		useMainTrackMagnet();
	const { timelineScale, setTimelineScale } = useTimelineScale();

	// 全局空格键播放/暂停
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space" && !e.repeat) {
				// 避免在输入框中触发
				if (
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLTextAreaElement
				) {
					return;
				}
				e.preventDefault();
				togglePlay();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [togglePlay]);

	const handleExport = useCallback(async () => {
		if (isExporting) return;

		setIsExporting(true);
		try {
			await exportCanvasAsImage(canvasRef.current, {
				format: "png",
				waitForReady: true,
			});
		} finally {
			setIsExporting(false);
		}
	}, [canvasRef, isExporting]);

	const handleScaleChange = useCallback(
		(value: number | readonly number[]) => {
			const nextValue = Array.isArray(value) ? value[0] : value;
			if (!Number.isFinite(nextValue)) return;
			setTimelineScale(nextValue);
		},
		[setTimelineScale],
	);

	return (
		<div className={cn("flex items-center gap-3 px-4", className)}>
			<button
				onClick={togglePlay}
				className="w-8 h-8 flex items-center justify-center rounded bg-neutral-700 hover:bg-neutral-600 text-white"
			>
				{isPlaying ? "⏸" : "▶"}
			</button>
			{/* 开关按钮组 */}
			<div className="flex items-center gap-2 ml-4">
				<button
					onClick={() => setSnapEnabled(!snapEnabled)}
					className={cn(
						"px-2 py-1 text-xs rounded transition-colors",
						snapEnabled
							? "bg-green-600 text-white"
							: "bg-neutral-700 text-neutral-400 hover:bg-neutral-600",
					)}
					title="水平吸附"
				>
					吸附
				</button>
				<button
					onClick={() => setAutoAttach(!autoAttach)}
					className={cn(
						"px-2 py-1 text-xs rounded transition-colors",
						autoAttach
							? "bg-green-600 text-white"
							: "bg-neutral-700 text-neutral-400 hover:bg-neutral-600",
					)}
					title="主轴联动"
				>
					联动
				</button>
				<button
					onClick={() => setMainTrackMagnetEnabled(!mainTrackMagnetEnabled)}
					className={cn(
						"px-2 py-1 text-xs rounded transition-colors",
						mainTrackMagnetEnabled
							? "bg-green-600 text-white"
							: "bg-neutral-700 text-neutral-400 hover:bg-neutral-600",
					)}
					title="主轨道磁吸"
				>
					主轨磁吸
				</button>
			</div>
			<div className="flex items-center gap-2">
				<Slider
					id="timeline-scale"
					min={0.01}
					max={10}
					step={0.1}
					value={[timelineScale]}
					onValueChange={handleScaleChange}
					className="w-16"
				/>
			</div>
			<div className="flex-1" />
			<button
				onClick={handleExport}
				disabled={isExporting}
				className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white"
			>
				{isExporting ? "Exporting..." : "Export"}
			</button>
		</div>
	);
};

export default TimelineToolbar;
