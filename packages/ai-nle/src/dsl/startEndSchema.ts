export const parseStartEndSchema = (schema: number | string) => {
	if (typeof schema === "number") {
		return schema;
	}

	// TODO: 支持其他时间格式
	return 0;
};
