/* eslint-disable @typescript-eslint/no-explicit-any */

import type { NodeHandle } from "../react-native-types/RendererProxy";
import type { ViewComponent } from "../react-native-types/View";

import type { DataModule } from "../skia/types";

export interface IPlatform {
	OS: string;
	PixelRatio: number;
	findNodeHandle: (
		componentOrHandle:
			| null
			| number
			| React.Component<any, any>
			| React.ComponentClass<any>,
	) => null | NodeHandle;
	resolveAsset: (source: DataModule) => string;
	View: typeof ViewComponent;
}
