import type { OvalProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const Oval = (props: SkiaProps<OvalProps>) => {
	return <skOval {...props} />;
};
