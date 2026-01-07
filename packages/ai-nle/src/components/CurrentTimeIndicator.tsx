import React, { useCallback, useEffect, useRef } from "react";
import {
	useTimelineStore,
	useTimelineSubscription,
} from "../editor/TimelineContext";

interface CurrentTimeIndicatorProps {
	leftColumnWidth: number;
	ratio: number;
	scrollLeftRef: React.MutableRefObject<number>;
}

const CurrentTimeIndicator: React.FC<CurrentTimeIndicatorProps> = ({
	leftColumnWidth,
	ratio,
	scrollLeftRef,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const store = useTimelineStore();

	// 绘制函数
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// 获取画布的实际显示尺寸
		const rect = canvas.parentElement?.getBoundingClientRect();
		if (!rect) return;

		const dpr = window.devicePixelRatio || 1;
		const displayWidth = rect.width;
		const displayHeight = rect.height;

		// 清空画布（使用实际像素尺寸）
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// 获取当前时间和滚动位置
		const currentTime = store.getCurrentTime();
		const scrollLeft = scrollLeftRef.current;

		// 计算时间线的 x 位置（使用显示坐标）
		const x = leftColumnWidth + currentTime * ratio - scrollLeft;

		// 绘制红色竖线（使用显示坐标，context 已经 scale 过了）
		ctx.strokeStyle = "#ef4444"; // red-500
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, displayHeight);
		ctx.stroke();
	}, [leftColumnWidth, ratio, scrollLeftRef, store]);

	// 订阅时间变化
	useTimelineSubscription(draw);

	// 监听滚动位置变化（通过 requestAnimationFrame 定期检查）
	useEffect(() => {
		let animationFrameId: number;
		let lastScrollLeft = scrollLeftRef.current;

		const checkScroll = () => {
			const currentScrollLeft = scrollLeftRef.current;
			if (currentScrollLeft !== lastScrollLeft) {
				lastScrollLeft = currentScrollLeft;
				draw();
			}
			animationFrameId = requestAnimationFrame(checkScroll);
		};

		animationFrameId = requestAnimationFrame(checkScroll);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [draw]);

	// 初始化画布大小
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const resizeObserver = new ResizeObserver(() => {
			const rect = canvas.parentElement?.getBoundingClientRect();
			if (rect) {
				const dpr = window.devicePixelRatio || 1;
				canvas.width = rect.width * dpr;
				canvas.height = rect.height * dpr;
				canvas.style.width = `${rect.width}px`;
				canvas.style.height = `${rect.height}px`;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					// 重置 transform 并应用 scale
					ctx.setTransform(1, 0, 0, 1, 0, 0);
					ctx.scale(dpr, dpr);
				}
				draw();
			}
		});

		const container = canvas.parentElement;
		if (container) {
			resizeObserver.observe(container);
		}

		return () => {
			resizeObserver.disconnect();
		};
	}, [draw]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute top-0 left-0 w-full h-full pointer-events-none"
			style={{ zIndex: 15 }}
		/>
	);
};

export default CurrentTimeIndicator;
