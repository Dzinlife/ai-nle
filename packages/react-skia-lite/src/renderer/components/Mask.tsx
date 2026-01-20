import type { ReactNode } from "react";
import { LumaColorFilter } from "./colorFilters/LumaColorFilter";
import { Group } from "./Group";
import { Paint } from "./Paint";

interface MaskProps {
	mode?: "luminance" | "alpha";
	clip?: boolean;
	mask: ReactNode | ReactNode[];
	children: ReactNode | ReactNode[];
}

export const Mask = ({
	children,
	mask,
	mode = "alpha",
	clip = true,
}: MaskProps) => {
	return (
		<Group layer>
			<Group
				layer={
					<Paint blendMode="src">
						{mode === "luminance" && <LumaColorFilter />}
					</Paint>
				}
			>
				{mask}
				{clip && <Group layer={<Paint blendMode="dstIn" />}>{children}</Group>}
			</Group>
			<Group blendMode="srcIn">{children}</Group>
		</Group>
	);
};
