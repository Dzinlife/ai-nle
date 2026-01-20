import { isValidElement } from "react";
import type { GroupProps } from "../../dom/types";
import type { ChildrenProps } from "../../dom/types/Common";
import type { SkiaProps } from "../processors";

export interface PublicGroupProps extends Omit<GroupProps, "layer"> {
	layer?: GroupProps["layer"] | ChildrenProps["children"];
}

export const Group = ({ layer, ...props }: SkiaProps<PublicGroupProps>) => {
	if (isValidElement(layer) && typeof layer === "object") {
		return (
			<skLayer>
				{layer}
				<skGroup {...props} />
			</skLayer>
		);
	}
	return <skGroup layer={layer as GroupProps["layer"]} {...props} />;
};
