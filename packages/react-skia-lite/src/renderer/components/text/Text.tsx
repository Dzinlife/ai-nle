import type { TextProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors";

export const Text = ({
	x = 0,
	y = 0,
	...props
}: SkiaDefaultProps<TextProps, "x" | "y">) => {
	return <skText x={x} y={y} {...props} />;
};
