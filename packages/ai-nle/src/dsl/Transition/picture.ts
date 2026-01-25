import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Skia, SkiaSGRoot, type SkPicture } from "react-skia-lite";

const syncPictureCacheByFrame = new Map<
	number,
	Map<string, SkPicture | null>
>();

const getSyncPictureEntry = (
	syncKey: string,
	renderKey: number,
): { exists: boolean; picture: SkPicture | null } => {
	const bucket = syncPictureCacheByFrame.get(renderKey);
	if (!bucket) return { exists: false, picture: null };
	if (!bucket.has(syncKey)) return { exists: false, picture: null };
	return { exists: true, picture: bucket.get(syncKey) ?? null };
};

const setSyncPictureEntry = (
	syncKey: string,
	renderKey: number,
	picture: SkPicture | null,
) => {
	let bucket = syncPictureCacheByFrame.get(renderKey);
	if (!bucket) {
		bucket = new Map();
		syncPictureCacheByFrame.set(renderKey, bucket);
	}
	const prev = bucket.get(syncKey);
	if (prev && prev !== picture) {
		prev.dispose();
	}
	bucket.set(syncKey, picture);
};

export const clearSyncPictures = (renderKey?: number) => {
	if (renderKey === undefined) {
		for (const bucket of syncPictureCacheByFrame.values()) {
			for (const picture of bucket.values()) {
				picture?.dispose();
			}
		}
		syncPictureCacheByFrame.clear();
		return;
	}
	const bucket = syncPictureCacheByFrame.get(renderKey);
	if (!bucket) return;
	for (const picture of bucket.values()) {
		picture?.dispose();
	}
	syncPictureCacheByFrame.delete(renderKey);
};

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

export const prepareSyncPicture = async (
	syncKey: string,
	renderKey: number,
	node: ReactNode,
	size: { width: number; height: number },
): Promise<SkPicture | null> => {
	const picture = await renderNodeToPicture(node, size);
	setSyncPictureEntry(syncKey, renderKey, picture);
	return picture;
};

export const useSkPictureFromNode = (
	node: ReactNode | null,
	size: { width: number; height: number },
	renderKey?: number,
	syncKey?: string,
): SkPicture | null => {
	const [picture, setPicture] = useState<SkPicture | null>(null);
	const renderIdRef = useRef(0);
	const pictureRef = useRef<SkPicture | null>(null);
	const usedSyncRef = useRef(false);
	const syncEntry =
		renderKey !== undefined && syncKey
			? getSyncPictureEntry(syncKey, renderKey)
			: { exists: false, picture: null };

	useEffect(() => {
		// 同步缓存失效后清空引用，避免使用已释放的 SkPicture
		if (!syncEntry.exists && usedSyncRef.current) {
			usedSyncRef.current = false;
			pictureRef.current = null;
			setPicture(null);
		}
	}, [syncEntry.exists]);

	useEffect(() => {
		let active = true;
		const renderId = renderIdRef.current + 1;
		renderIdRef.current = renderId;

		if (!node) {
			pictureRef.current = null;
			setPicture(null);
			return;
		}
		if (syncEntry.exists) {
			usedSyncRef.current = true;
			return;
		}
		usedSyncRef.current = false;

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
	}, [node, renderKey, syncKey, size.height, size.width, syncEntry.exists]);

	useEffect(() => {
		return () => {
			pictureRef.current = null;
		};
	}, []);

	if (syncEntry.exists) return syncEntry.picture;
	// 同步缓存刚被清理时，避免返回已释放的引用
	if (usedSyncRef.current) return null;
	return picture;
};
