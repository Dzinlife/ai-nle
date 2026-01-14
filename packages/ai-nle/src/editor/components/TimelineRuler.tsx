import React, { useEffect, useRef } from "react";

interface TimelineRulerProps {
	scrollLeft: number;
	ratio: number;
	width: number;
	height?: number;
	fps?: number;
	paddingLeft?: number;
	className?: string;
}

const TimelineRuler: React.FC<TimelineRulerProps> = ({
	scrollLeft,
	ratio,
	width,
	height = 24,
	fps = 30, // mock fps
	paddingLeft = 0,
	className,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// 设置 canvas 尺寸（考虑 DPR）
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);

		// 清除画布
		ctx.clearRect(0, 0, width, height);

		// 配置绘制样式
		ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
		ctx.font = "11px monospace";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";

		// 根据 ratio 计算主刻度间隔（秒），必须是 5 的整数倍
		const { interval, useFrames } = calculateInterval(ratio, fps);

		// 计算可见范围（秒），考虑 paddingLeft
		const startTimeSec = (scrollLeft - paddingLeft) / ratio;
		const endTimeSec = (scrollLeft - paddingLeft + width) / ratio;

		if (useFrames) {
			// 帧模式：整数秒必须显示，帧刻度在整数秒之间显示
			const frameInterval = interval; // 帧间隔（秒）
			const startSec = Math.floor(startTimeSec);
			const endSec = Math.ceil(endTimeSec);

			for (let sec = Math.max(0, startSec - 1); sec <= endSec + 1; sec++) {
				// 绘制整数秒刻度
				const secX = sec * ratio - scrollLeft + paddingLeft;
				if (secX >= -50 && secX <= width + 50) {
					ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
					ctx.beginPath();
					ctx.moveTo(secX, height - 15);
					ctx.lineTo(secX, height);
					ctx.stroke();

					// 整数秒显示 mm:ss
					const label = formatTimeSeconds(sec);
					ctx.fillText(label, secX + 5, height / 2 + 2);
				}

				// 绘制该秒内的帧刻度
				const framesPerSecond = Math.round(1 / frameInterval);
				for (let f = 1; f < framesPerSecond; f++) {
					const frameTime = sec + f * frameInterval;
					const frameX = frameTime * ratio - scrollLeft + paddingLeft;

					if (frameX >= 0 && frameX <= width) {
						ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
						ctx.beginPath();
						ctx.moveTo(frameX, height - 4);
						ctx.lineTo(frameX, height);
						ctx.stroke();

						// 显示帧数
						const frameNum = Math.round(f * frameInterval * fps);
						const textWidth = ctx.measureText(`${frameNum}f`).width;
						ctx.fillText(
							`${frameNum}f`,
							frameX - textWidth / 2,
							height / 2 + 2,
						);
					}
				}
			}
		} else {
			// 秒模式
			const startTime = Math.floor(startTimeSec / interval) * interval;
			const endTime = Math.ceil(endTimeSec / interval) * interval + interval;

			// 绘制主刻度
			for (
				let time = Math.max(0, startTime);
				time <= endTime;
				time += interval
			) {
				const x = time * ratio - scrollLeft + paddingLeft;

				if (x < -50 || x > width + 50) continue;

				// 绘制主刻度线
				ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
				ctx.beginPath();
				ctx.moveTo(x, height - 15);
				ctx.lineTo(x, height);
				ctx.stroke();

				// 绘制时间文字（在刻度线右方）
				const label = formatTimeSeconds(time);
				ctx.fillText(label, x + 5, height / 2 + 2);
			}

			// 绘制次刻度（在主刻度之间）
			const minorInterval = interval / 5;
			if (minorInterval * ratio >= 8) {
				ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
				for (
					let time = Math.max(0, startTime);
					time <= endTime;
					time += minorInterval
				) {
					if (Math.abs(time % interval) < 0.001) continue;

					const x = time * ratio - scrollLeft + paddingLeft;
					if (x < 0 || x > width) continue;

					ctx.beginPath();
					ctx.moveTo(x, height - 5);
					ctx.lineTo(x, height);
					ctx.stroke();
				}
			}
		}
	}, [scrollLeft, ratio, width, height, fps, paddingLeft, dpr]);

	return (
		<canvas
			ref={canvasRef}
			className={className}
			style={{
				width,
				height,
			}}
		/>
	);
};

// 根据 ratio 计算合适的刻度间隔
function calculateInterval(
	ratio: number,
	fps: number,
): { interval: number; useFrames: boolean } {
	// ratio 是每秒对应的像素数
	// 目标：主刻度之间间隔 200-300 像素左右

	const targetPixelGap = 250;
	const rawInterval = targetPixelGap / ratio; // 秒

	// 可选的间隔值（5的整数倍，或帧级别）
	const frameInterval = 1 / fps;
	const intervals = [
		frameInterval * 5, // 5帧
		frameInterval * 10, // 10帧
		frameInterval * 15, // 15帧 (0.5s at 30fps)
		1, // 1秒
		5, // 5秒
		10, // 10秒
		15, // 15秒
		30, // 30秒
		60, // 1分钟
		300, // 5分钟
		600, // 10分钟
		900, // 15分钟
		1800, // 30分钟
		3600, // 1小时
	];

	// 找到最接近目标的间隔
	let bestInterval = intervals[0];
	let bestDiff = Math.abs(intervals[0] - rawInterval);

	for (const interval of intervals) {
		const diff = Math.abs(interval - rawInterval);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestInterval = interval;
		}
	}

	// 判断是否使用帧单位
	const useFrames = bestInterval < 1;

	return { interval: bestInterval, useFrames };
}

// 格式化秒数为 mm:ss 或 hh:mm:ss
function formatTimeSeconds(seconds: number): string {
	const totalSeconds = Math.round(seconds);
	const secs = totalSeconds % 60;
	const mins = Math.floor(totalSeconds / 60) % 60;
	const hours = Math.floor(totalSeconds / 3600);

	if (hours > 0) {
		return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default TimelineRuler;
