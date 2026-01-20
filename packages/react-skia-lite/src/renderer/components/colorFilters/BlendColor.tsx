import type { BlendColorFilterProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const BlendColor = (props: SkiaProps<BlendColorFilterProps>) => {
	return <skBlendColorFilter {...props} />;
};
