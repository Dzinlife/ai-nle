import React, { startTransition, useCallback, useState } from "react";
import { parseStartEndSchema } from "@/dsl/startEndSchema";
import { EditorElement } from "@/dsl/types";
import { useTimeline } from "./TimelineContext";
import { testTimeline } from "./timeline";

// 从 timeline JSX 中解析出初始状态
function parseTimeline(timelineElement: React.ReactElement): EditorElement[] {
	const elements: EditorElement[] = [];

	const children = (timelineElement.props as { children?: React.ReactNode })
		.children;

	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child)) {
			elements.push(child as EditorElement);
		}
	});

	return elements;
}

const TimelineEditor = () => {
	const { currentTime, setCurrentTime } = useTimeline();

	// 从 timeline JSX 中提取的初始状态
	const [elements, setElements] = useState<EditorElement[]>(
		parseTimeline(testTimeline),
	);

	const ratio = 50;

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
			const time = x / ratio;
			startTransition(() => {
				setCurrentTime(time);
			});
		},
		[ratio],
	);

	return (
		<div className="w-full bg-neutral-100 flex-1 flex">
			<div className="w-44 shrink-0">left column</div>
			<div
				className="relative flex-1 overflow-auto"
				onMouseMove={handleMouseMove}
			>
				<div className="flex">
					{Array.from({ length: 100 }).map((_, index) => (
						<div
							key={index}
							className="w-full h-10 bg-blue-200 shrink-0"
							style={{ left: index * ratio, width: ratio }}
						>
							{index}
						</div>
					))}
				</div>
				<div className="relative">
					{elements.map((element, i) => {
						const { type, props } = element;

						const { start = 0, end = 1 } = props;

						const left = parseStartEndSchema(start) * ratio;
						const width =
							(parseStartEndSchema(end) - parseStartEndSchema(start)) * ratio;

						return (
							<div
								key={props.id}
								className="absolute flex p-1"
								style={{
									left,
									width,
									top: i * 30,
								}}
							>
								{type.timelineComponent ? (
									<div className="bg-red-200 rounded w-full">
										{start}-{end}
										<type.timelineComponent key={props.id} {...props} />
									</div>
								) : (
									<div className="bg-red-200 rounded w-full">
										no timeline component
									</div>
								)}
							</div>
						);
					})}
				</div>

				<div
					className="absolute top-0 left-0 w-full h-full bg-red-500"
					style={{
						left: currentTime * ratio,
						width: 2,
						height: "100%",
					}}
				></div>
			</div>
		</div>
	);
};

export default TimelineEditor;
