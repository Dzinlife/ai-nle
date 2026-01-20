import type { TextPathProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors";

export const TextPath = ({
	initialOffset = 0,
	...props
}: SkiaDefaultProps<TextPathProps, "initialOffset">) => {
	return <skTextPath initialOffset={initialOffset} {...props} />;
};
