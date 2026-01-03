import { createContext, useContext, useMemo } from "react";

const PreviewContext = createContext({
	pictureWidth: 1920,
	pictureHeight: 1080,
	canvasWidth: 960,
	canvasHeight: 540,
});

const PreviewProvider = ({ children }: { children: React.ReactNode }) => {
	const defaultValues = useMemo(() => {
		return {
			pictureWidth: 1920,
			pictureHeight: 1080,
			canvasWidth: 960,
			canvasHeight: 540,
		};
	}, []);
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
