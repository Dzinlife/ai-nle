import type { PatchProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const Patch = (props: SkiaProps<PatchProps>) => {
	return <skPatch {...props} />;
};
