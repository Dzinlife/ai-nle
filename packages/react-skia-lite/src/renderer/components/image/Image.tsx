import type { ImageProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const Image = ({ fit = "contain", ...props }: SkiaProps<ImageProps>) => {
	return <skImage fit={fit} {...props} />;
};
