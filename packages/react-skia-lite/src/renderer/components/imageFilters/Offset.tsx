import type { OffsetImageFilterProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors/Animations/Animations";

export const Offset = ({
	x = 0,
	y = 0,
	...props
}: SkiaDefaultProps<OffsetImageFilterProps, "x" | "y">) => {
	return <skOffsetImageFilter x={x} y={y} {...props} />;
};
