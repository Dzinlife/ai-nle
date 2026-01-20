import type { PathProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors";

export const Path = ({
	start = 0,
	end = 1,
	...props
}: SkiaDefaultProps<PathProps, "start" | "end">) => {
	return <skPath start={start} end={end} {...props} />;
};
