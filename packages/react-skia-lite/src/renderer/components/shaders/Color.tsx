import type { ColorProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const ColorShader = (props: SkiaProps<ColorProps>) => {
	return <skColorShader {...props} />;
};
