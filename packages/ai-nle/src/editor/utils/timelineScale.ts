export const PIXELS_PER_SECOND = 50;

export function getPixelsPerFrame(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return PIXELS_PER_SECOND / 30;
	return PIXELS_PER_SECOND / fps;
}

export function framesToPixels(frames: number, fps: number): number {
	return frames * getPixelsPerFrame(fps);
}

export function pixelsToFrames(pixels: number, fps: number): number {
	return pixels / getPixelsPerFrame(fps);
}
