import type { DisplacementMapImageFilterProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const DisplacementMap = (
	props: SkiaProps<DisplacementMapImageFilterProps>,
) => {
	return <skDisplacementMapImageFilter {...props} />;
};
