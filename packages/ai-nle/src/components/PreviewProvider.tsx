import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

const PreviewContext = createContext({
	pictureWidth: 1920,
	pictureHeight: 1080,
	canvasWidth: 960,
	canvasHeight: 540,
	setZoomLevel: (zoomLevel: number) => {},
	setPictureSize: (pictureSize: { width: number; height: number }) => {},
	setCanvasSize: (canvasSize: { width: number; height: number }) => {},
	setContainerSize: (containerSize: { width: number; height: number }) => {},
	zoomLevel: 0.5,
	isDraggingZoom: false,
	tempZoomLevel: 0.5,
	startZoomDrag: () => {},
	updateZoomDrag: (value: number) => {},
	endZoomDrag: (value: number) => {},
	zoomTransform: "",
	offsetX: 0,
	offsetY: 0,
});

const PreviewProvider = ({ children }: { children: React.ReactNode }) => {
	const [pictureSize, setPictureSize] = useState({
		width: 1920,
		height: 1080,
	});

	const [canvasSize, setCanvasSize] = useState({
		width: 960,
		height: 540,
	});

	const [containerSize, setContainerSize] = useState<{
		width: number;
		height: number;
	} | null>(null);

	// 计算合适的初始 zoomLevel（fit-to-container）
	const calculateFitZoomLevel = useCallback(
		(
			picture: { width: number; height: number },
			container: { width: number; height: number } | null,
		) => {
			if (!container || container.width === 0 || container.height === 0) {
				// 如果没有容器尺寸，使用默认的 canvasSize 计算
				return canvasSize.width / pictureSize.width;
			}

			// 留出边距，使画面稍微小一圈（留出 5% 的边距）
			const paddingRatio = 0.95;
			const availableWidth = container.width * paddingRatio;
			const availableHeight = container.height * paddingRatio;

			// 计算缩放比例，使得 picture 能够完整显示在容器中
			const scaleX = availableWidth / picture.width;
			const scaleY = availableHeight / picture.height;
			// 选择较小的缩放比例，确保内容完整显示
			return Math.min(scaleX, scaleY, 1); // 最大不超过 1（不放大）
		},
		[canvasSize.width, pictureSize.width],
	);

	const [zoomLevel, setZoomLevel] = useState(() => {
		return calculateFitZoomLevel(pictureSize, null);
	});

	const [isDraggingZoom, setIsDraggingZoom] = useState(false);
	const [tempZoomLevel, setTempZoomLevel] = useState(zoomLevel);

	// 同步 tempZoomLevel 当 zoomLevel 变化且不在拖动状态时
	useEffect(() => {
		if (!isDraggingZoom) {
			setTempZoomLevel(zoomLevel);
		}
	}, [zoomLevel, isDraggingZoom]);

	const setZoom = useCallback(
		(zoomLevel: number) => {
			setZoomLevel(zoomLevel);
			setCanvasSize({
				width: pictureSize.width * zoomLevel,
				height: pictureSize.height * zoomLevel,
			});
		},
		[pictureSize.width, pictureSize.height],
	);

	// 监听全局 mouseup 事件，处理拖动时鼠标移出滑块的情况
	useEffect(() => {
		if (!isDraggingZoom) return;

		const handleGlobalMouseUp = () => {
			setIsDraggingZoom(false);
			setZoom(tempZoomLevel);
		};

		window.addEventListener("mouseup", handleGlobalMouseUp);
		return () => {
			window.removeEventListener("mouseup", handleGlobalMouseUp);
		};
	}, [isDraggingZoom, tempZoomLevel, setZoom]);

	const startZoomDrag = useCallback(() => {
		setIsDraggingZoom(true);
		setTempZoomLevel(zoomLevel);
	}, [zoomLevel]);

	const updateZoomDrag = useCallback(
		(value: number) => {
			if (isDraggingZoom) {
				setTempZoomLevel(value);
			}
		},
		[isDraggingZoom],
	);

	const endZoomDrag = useCallback(
		(value: number) => {
			if (isDraggingZoom) {
				setIsDraggingZoom(false);
				setZoom(value);
			}
		},
		[isDraggingZoom, setZoom],
	);

	// 计算偏移量，使得缩放后的内容居中
	const { offsetX, offsetY } = useMemo(() => {
		if (
			!containerSize ||
			containerSize.width === 0 ||
			containerSize.height === 0
		) {
			return { offsetX: 0, offsetY: 0 };
		}

		// 计算实际显示的尺寸
		// canvasSize 已经是基于 zoomLevel 的尺寸
		// 如果正在拖动，需要应用临时缩放比例
		let scaledWidth = canvasSize.width;
		let scaledHeight = canvasSize.height;

		if (isDraggingZoom && zoomLevel > 0) {
			const scaleRatio = tempZoomLevel / zoomLevel;
			scaledWidth = canvasSize.width * scaleRatio;
			scaledHeight = canvasSize.height * scaleRatio;
		}

		// 计算居中所需的偏移量
		const offsetX = (containerSize.width - scaledWidth) / 2;
		const offsetY = (containerSize.height - scaledHeight) / 2;

		return { offsetX, offsetY };
	}, [containerSize, canvasSize, zoomLevel, tempZoomLevel, isDraggingZoom]);

	const zoomTransform = useMemo(() => {
		const transforms: string[] = [];

		// 先应用偏移（居中）
		if (offsetX !== 0 || offsetY !== 0) {
			transforms.push(`translate(${offsetX}px, ${offsetY}px)`);
		}

		// 计算相对于当前 zoomLevel 的缩放比例
		// 如果正在拖动，应用临时缩放；否则不应用额外缩放（因为 canvasSize 已经基于 zoomLevel）
		if (isDraggingZoom && zoomLevel > 0) {
			const scaleRatio = tempZoomLevel / zoomLevel;
			if (scaleRatio !== 1) {
				transforms.push(`scale(${scaleRatio})`);
			}
		}

		return transforms.length > 0 ? transforms.join(" ") : "";
	}, [isDraggingZoom, tempZoomLevel, zoomLevel, offsetX, offsetY]);

	const setCanvas = useCallback(
		(canvasSize: { width: number; height: number }) => {
			setCanvasSize(canvasSize);
			setZoomLevel(canvasSize.width / pictureSize.width);
		},
		[setZoomLevel, pictureSize.width, pictureSize.height],
	);

	const setPicture = useCallback(
		(pictureSize: { width: number; height: number }) => {
			setPictureSize(pictureSize);
			const newZoomLevel = calculateFitZoomLevel(pictureSize, containerSize);
			setZoomLevel(newZoomLevel);
		},
		[calculateFitZoomLevel, containerSize],
	);

	const setContainer = useCallback(
		(containerSize: { width: number; height: number }) => {
			setContainerSize(containerSize);
			// 只更新容器尺寸（用于居中计算），不重新计算 zoomLevel
			// 避免与手动缩放冲突
		},
		[],
	);

	const defaultValues = useMemo(() => {
		return {
			pictureWidth: pictureSize.width,
			pictureHeight: pictureSize.height,
			canvasWidth: canvasSize.width,
			canvasHeight: canvasSize.height,
			zoomLevel,
			setZoomLevel: setZoom,
			setPictureSize: setPicture,
			setCanvasSize: setCanvas,
			setContainerSize: setContainer,
			isDraggingZoom,
			tempZoomLevel,
			startZoomDrag,
			updateZoomDrag,
			endZoomDrag,
			zoomTransform,
			offsetX,
			offsetY,
		};
	}, [
		pictureSize,
		canvasSize,
		zoomLevel,
		setZoom,
		setPicture,
		setCanvas,
		setContainer,
		isDraggingZoom,
		tempZoomLevel,
		startZoomDrag,
		updateZoomDrag,
		endZoomDrag,
		zoomTransform,
		offsetX,
		offsetY,
	]);

	return (
		<PreviewContext.Provider value={defaultValues}>
			{children}
		</PreviewContext.Provider>
	);
};

export const usePreview = () => {
	return useContext(PreviewContext);
};

export default PreviewProvider;
