import type { DiscretePathEffectProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors/Animations/Animations";

export const DiscretePathEffect = ({
	seed = 0,
	...props
}: SkiaDefaultProps<DiscretePathEffectProps, "seed">) => {
	return <skDiscretePathEffect seed={seed} {...props} />;
};
