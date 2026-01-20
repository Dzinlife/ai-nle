import type { LerpColorFilterProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors/Animations/Animations";

export const Lerp = (props: SkiaProps<LerpColorFilterProps>) => {
	return <skLerpColorFilter {...props} />;
};
