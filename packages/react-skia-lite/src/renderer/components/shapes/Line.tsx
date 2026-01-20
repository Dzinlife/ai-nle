import type { LineProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const Line = (props: SkiaProps<LineProps>) => {
	return <skLine {...props} />;
};
