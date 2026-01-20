import type { ShaderProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors";

export const Shader = ({
	uniforms = {},
	...props
}: SkiaDefaultProps<ShaderProps, "uniforms">) => {
	return <skShader uniforms={uniforms} {...props} />;
};
