import React from "react";
import type { SkImage, SkPicture, SkRect, SkSize } from "react-skia-lite";
import { Skia, Group as SkiaGroup, SkiaSGRoot } from "react-skia-lite";
import type { OffscreenRenderContextValue } from "@/editor/OffscreenRenderContext";
import { OffscreenRenderContext } from "@/editor/OffscreenRenderContext";
import { TimelineContext } from "@/editor/TimelineContext";

/**
 * 离屏渲染部分元素（不包含背景色）
 *
 * 参考实现: packages/react-skia-lite/src/renderer/Offscreen.tsx
 *
 * 注意: 由于 SkiaSGRoot 是内部模块，这里使用动态导入。
 * 如果需要更好的类型支持，可以考虑将 Offscreen.tsx 导出到公共 API。
 *
 * @param skiaReactElements - 要渲染的 React 元素数组（不包含 Fill 背景色）
 * @param size - 渲染尺寸（可选，如果不提供则使用 canvas 尺寸）
 * @param bounds - 渲染边界（可选）
 * @param currentTime - 时间点（可选，默认为 0，用于视频组件显示对应帧）
 * @returns Promise<SkPicture> - 渲染后的 Picture 对象
 *
 * 使用示例:
 * ```tsx
 * // 准备要渲染的元素（不包含 Fill 背景色）
 * const elementsToRender = renderElements.map((el) => {
 *   const { x, y, width, height, rotate } = converMetaLayoutToCanvasLayout(
 *     el.props,
 *     canvasConvertOptions.picture,
 *     canvasConvertOptions.canvas,
 *   );
 *   return (
 *     <SkiaGroup key={el.props.id}>
 *       <el.type
 *         {...el.props}
 *         __renderLayout={{ x, y, w: width, h: height, r: rotate }}
 *       />
 *     </SkiaGroup>
 *   );
 * });
 *
 * // 离屏渲染为 Picture（指定时间点为 5 秒）
 * const picture = await renderElementsOffscreen(elementsToRender, {
 *   width: canvasWidth,
 *   height: canvasHeight,
 * }, undefined, 5);
 *
 * // 或者渲染为 Image（指定时间点为 10 秒）
 * const image = await renderElementsOffscreenAsImage(elementsToRender, {
 *   width: canvasWidth,
 *   height: canvasHeight,
 * }, 10);
 * ```
 */
export async function renderElementsOffscreen(
	skiaReactElements: React.ReactElement[],
	size?: SkSize,
	bounds?: SkRect,
	currentTime: number = 0,
): Promise<SkPicture> {
	// 创建一个 SkiaSGRoot 实例用于离屏渲染
	// nativeId = -1 表示离屏渲染，不会绑定到视图
	const root = new SkiaSGRoot(Skia, -1);

	// 收集所有 ready 回调
	const readyCallbacks: Array<() => Promise<void>> = [];
	const registerReadyCallback = (callback: () => Promise<void>) => {
		readyCallbacks.push(callback);
	};

	// 创建离屏渲染 Context
	const offscreenContextValue: OffscreenRenderContextValue = {
		isOffscreen: true,
		registerReadyCallback,
		waitForReady: async () => {
			// 等待所有 ready 回调完成
			await Promise.all(readyCallbacks.map((cb) => cb()));
		},
	};

	// 将元素包装在 Group 中（不包含 Fill 背景色），并提供离屏渲染 Context 和 TimelineContext
	const elementTree = (
		<OffscreenRenderContext.Provider value={offscreenContextValue}>
			<TimelineContext.Provider
				value={{
					currentTime,
					setCurrentTime: () => {
						// 离屏渲染时不允许修改时间
					},
				}}
			>
				<SkiaGroup>
					{skiaReactElements.map((el, index) => (
						<React.Fragment key={index}>{el}</React.Fragment>
					))}
				</SkiaGroup>
			</TimelineContext.Provider>
		</OffscreenRenderContext.Provider>
	);

	// 渲染元素
	await root.render(elementTree);

	// 等待所有视频帧准备好（给组件一些时间注册回调）
	await new Promise((resolve) => setTimeout(resolve, 50));

	// 等待所有 ready 回调完成
	if (offscreenContextValue.waitForReady) {
		await offscreenContextValue.waitForReady();
	}

	// 创建 PictureRecorder
	const recorder = Skia.PictureRecorder();

	// 如果提供了 bounds，使用它；否则如果提供了 size，创建 bounds；否则不设置 bounds
	let recordingBounds: SkRect | undefined = bounds;
	if (!recordingBounds && size) {
		recordingBounds = Skia.XYWHRect(0, 0, size.width, size.height);
	}

	const canvas = recorder.beginRecording(recordingBounds);

	// 绘制到 canvas（不包含背景色）
	root.drawOnCanvas(canvas);

	// 完成录制并获取 Picture
	const picture = recorder.finishRecordingAsPicture();

	// 清理资源
	await root.unmount();

	return picture;
}

/**
 * 离屏渲染部分元素并转换为 Image（不包含背景色）
 *
 * 示例用法:
 * ```tsx
 * const image = await renderElementsOffscreenAsImage(elementsToRender, {
 *   width: canvasWidth,
 *   height: canvasHeight,
 * }, 5); // 指定时间点为 5 秒
 * // 可以将 image 用于导出、合成等操作
 * ```
 *
 * @param skiaReactElements - 要渲染的 React 元素数组（不包含 Fill 背景色）
 * @param size - 渲染尺寸
 * @param currentTime - 时间点（可选，默认为 0，用于视频组件显示对应帧）
 * @returns Promise<SkImage> - 渲染后的 Image 对象
 */
export async function renderElementsOffscreenAsImage(
	skiaReactElements: React.ReactElement[],
	size: SkSize,
	currentTime: number = 0,
): Promise<SkImage> {
	// 先渲染为 Picture
	const picture = await renderElementsOffscreen(
		skiaReactElements,
		size,
		undefined,
		currentTime,
	);

	// 创建离屏 Surface
	const surface = Skia.Surface.MakeOffscreen(size.width, size.height);
	if (!surface) {
		throw new Error("Failed to create offscreen surface");
	}

	// 在 Surface 上绘制 Picture
	const canvas = surface.getCanvas();
	// 清除为透明背景（RGBA: 0, 0, 0, 0）
	// 参考: packages/react-skia-lite/src/views/SkiaPictureView.tsx:126
	// canvas.clear(Float32Array.of(0, 0, 0, 0));
	canvas.drawPicture(picture);
	surface.flush();

	// 获取 Image
	const image = surface.makeImageSnapshot();
	return image.makeNonTextureImage();
}
