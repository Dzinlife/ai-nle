import { useCallback, useEffect, useState } from "react";
import { exportCanvasAsImage } from "@/dsl/export";
import { cn } from "@/lib/utils";
import { usePreview } from "../contexts/PreviewProvider";
import { useAttachments, useCurrentTime, usePlaybackControl, useSnap } from "../contexts/TimelineContext";

// 格式化时间为 MM:SS:mmm（输入单位为秒）
const formatTime = (seconds: number) => {
	const totalSeconds = Math.floor(seconds);
	const minutes = Math.floor(totalSeconds / 60);
	const secs = totalSeconds % 60;
	const milliseconds = Math.floor((seconds % 1) * 1000);
	return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${milliseconds.toString().padStart(3, "0")}`;
};

const TimelineToolbar: React.FC<{ className?: string }> = ({ className }) => {
	const { currentTime } = useCurrentTime();
	const { isPlaying, togglePlay } = usePlaybackControl();
	const { canvasRef } = usePreview();
	const [isExporting, setIsExporting] = useState(false);
	const { snapEnabled, setSnapEnabled } = useSnap();
	const { autoAttach, setAutoAttach } = useAttachments();

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

	return (
		<div className={cn("flex items-center gap-3 px-4", className)}>
			<button
				onClick={togglePlay}
				className="w-8 h-8 flex items-center justify-center rounded bg-neutral-700 hover:bg-neutral-600 text-white"
			>
				{isPlaying ? "⏸" : "▶"}
			</button>
			<span className="font-mono text-sm text-neutral-300">
				{formatTime(currentTime)}
			</span>
			{/* 开关按钮组 */}
			<div className="flex items-center gap-2 ml-4">
				<button
					onClick={() => setSnapEnabled(!snapEnabled)}
					className={cn(
						"px-2 py-1 text-xs rounded transition-colors",
						snapEnabled
							? "bg-green-600 text-white"
							: "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
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
							: "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
					)}
					title="主轴联动"
				>
					联动
				</button>
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
