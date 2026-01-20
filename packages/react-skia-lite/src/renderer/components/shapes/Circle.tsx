import type { CircleProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const Circle = (props: SkiaProps<CircleProps>) => {
	return <skCircle {...props} />;
};
