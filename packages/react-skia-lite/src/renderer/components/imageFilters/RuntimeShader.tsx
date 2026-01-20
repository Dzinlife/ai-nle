import type { RuntimeShaderImageFilterProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors/Animations/Animations";

export const RuntimeShader = (
	props: SkiaProps<RuntimeShaderImageFilterProps>,
) => {
	return <skRuntimeShaderImageFilter {...props} />;
};
