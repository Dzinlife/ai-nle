import type { PointsProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors/Animations/Animations";

export const Points = ({
	mode = "points",
	...props
}: SkiaDefaultProps<PointsProps, "mode">) => {
	return <skPoints mode={mode} {...props} />;
};
