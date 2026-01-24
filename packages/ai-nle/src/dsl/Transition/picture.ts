import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Skia, SkiaSGRoot, type SkPicture } from "react-skia-lite";

export const renderNodeToPicture = async (
	node: ReactNode,
	size: { width: number; height: number },
): Promise<SkPicture | null> => {
	if (size.width <= 0 || size.height <= 0) return null;
	const recorder = Skia.PictureRecorder();
	const canvas = recorder.beginRecording({
		x: 0,
		y: 0,
		width: size.width,
		height: size.height,
	});
	const root = new SkiaSGRoot(Skia);
	await root.render(node);
	root.drawOnCanvas(canvas);
	root.unmount();
	return recorder.finishRecordingAsPicture();
};

export const useSkPictureFromNode = (
	node: ReactNode | null,
	size: { width: number; height: number },
	renderKey?: number,
): SkPicture | null => {
	const [picture, setPicture] = useState<SkPicture | null>(null);
	const renderIdRef = useRef(0);
	const pictureRef = useRef<SkPicture | null>(null);

	useEffect(() => {
		let active = true;
		const renderId = renderIdRef.current + 1;
		renderIdRef.current = renderId;

		if (!node) {
			pictureRef.current = null;
			setPicture(null);
			return;
		}

		const render = async () => {
			try {
				const nextPicture = await renderNodeToPicture(node, size);
				if (!active || renderIdRef.current !== renderId) {
					nextPicture?.dispose();
					return;
				}
				pictureRef.current = nextPicture ?? null;
				setPicture(nextPicture ?? null);
			} catch (error) {
				console.error("Failed to render transition picture:", error);
				if (!active || renderIdRef.current !== renderId) return;
				pictureRef.current = null;
				setPicture(null);
			}
		};

		render();
		return () => {
			active = false;
		};
	}, [node, renderKey, size.height, size.width]);

	useEffect(() => {
		return () => {
			pictureRef.current = null;
		};
	}, []);

	return picture;
};
