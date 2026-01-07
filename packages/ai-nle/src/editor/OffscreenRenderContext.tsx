import { createContext, useContext } from "react";

export interface OffscreenRenderContextValue {
	isOffscreen: boolean;
	waitForReady?: () => Promise<void>;
	registerReadyCallback?: (callback: () => Promise<void>) => void;
}

export const OffscreenRenderContext =
	createContext<OffscreenRenderContextValue>({
		isOffscreen: false,
	});

export const useOffscreenRender = () => {
	return useContext(OffscreenRenderContext);
};
