import type { VerticesProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors";

export const Vertices = ({
	mode = "triangles",
	...props
}: SkiaDefaultProps<VerticesProps, "mode">) => {
	return <skVertices mode={mode} {...props} />;
};
