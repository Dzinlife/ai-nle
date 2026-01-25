import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Skia, SkiaSGRoot, type SkPicture } from "react-skia-lite";

const syncPictureCacheByFrame = new Map<number, Map<string, SkPicture | null>>();

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
	options?: { syncKey?: string },
): SkPicture | null => {
	const [picture, setPicture] = useState<SkPicture | null>(null);
	const renderIdRef = useRef(0);
	const pictureRef = useRef<SkPicture | null>(null);
	const syncKey = options?.syncKey;
	const hasSyncKey = typeof syncKey === "string" && syncKey.length > 0;
	const syncEntry =
		hasSyncKey && renderKey !== undefined
			? getSyncPictureEntry(syncKey, renderKey)
			: { exists: false, picture: null };

	useEffect(() => {
		let active = true;
		const renderId = renderIdRef.current + 1;
		renderIdRef.current = renderId;

		if (syncEntry.exists) {
			pictureRef.current = syncEntry.picture;
			setPicture(syncEntry.picture);
			return;
		}

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

	return syncEntry.exists ? syncEntry.picture : picture;
};
