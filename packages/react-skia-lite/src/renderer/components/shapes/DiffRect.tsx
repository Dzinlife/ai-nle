import type { DiffRectProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors/Animations/Animations";

export const DiffRect = (props: SkiaProps<DiffRectProps>) => {
	return <skDiffRect {...props} />;
};
