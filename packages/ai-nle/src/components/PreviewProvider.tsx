import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

const PreviewContext = createContext({
	containerWidth: 0,
	containerHeight: 0,
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
});

const PreviewProvider = ({ children }: { children: React.ReactNode }) => {
	const [containerSize, setContainerSize] = useState({
		width: 1920,
		height: 1080,
	});

	const [pictureSize, setPictureSize] = useState({
		width: 1920,
		height: 1080,
	});

	const [canvasSize, setCanvasSize] = useState({
		width: 960,
		height: 540,
	});

	const [zoomLevel, setZoomLevel] = useState(
		canvasSize.width / pictureSize.width,
	);
	const [isDraggingZoom, setIsDraggingZoom] = useState(false);
	const [tempZoomLevel, setTempZoomLevel] = useState(
		canvasSize.width / pictureSize.width,
	);

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
			setZoomLevel(canvasSize.width / pictureSize.width);
		},
		[setZoomLevel, canvasSize.width, pictureSize.width, pictureSize.height],
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
			isDraggingZoom,
			containerWidth: containerSize.width,
			containerHeight: containerSize.height,
			setContainerSize: setContainerSize,
		};
	}, [
		containerSize,
		pictureSize,
		canvasSize,
		zoomLevel,
		setZoom,
		setPicture,
		setCanvas,
		isDraggingZoom,
		setContainerSize,
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
