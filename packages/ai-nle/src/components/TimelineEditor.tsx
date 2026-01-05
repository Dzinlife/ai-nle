import React, { startTransition, useCallback, useState } from "react";
import { Clip, Group, Image } from "@/dsl";
import ClipTimeline from "@/dsl/ClipTimeline";
import GroupTimeline from "@/dsl/GroupTimeline";
import ImageTimeline from "@/dsl/ImageTimeline";
import { CommonMeta, TimelineMeta } from "@/dsl/types";
import { useTimeline } from "./TimelineContext";
import { testTimeline } from "./timeline";

interface TimelineEditorElement extends CommonMeta, TimelineMeta {
	__type: "Group" | "Image" | "Clip";
	__TimelineEditorComponent: React.ComponentType<any>;
}

const PlaceholderEditorComponent: React.ComponentType<any> = () => {
	return <div>PlaceholderEditorComponent</div>;
};

// 从 timeline JSX 中解析出初始状态
function parseTimeline(
	timelineElement: React.ReactElement,
): TimelineEditorElement[] {
	const elements: TimelineEditorElement[] = [];

	const children = (timelineElement.props as { children?: React.ReactNode })
		.children;

	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child)) {
			const type = child.type as React.ComponentType;
			const props = child.props as CommonMeta;

			let __TimelineEditorComponent: React.ComponentType<any>;

			// 根据组件类型确定元素类型
			let elementType: "Group" | "Image" | "Clip";
			if (type === Group) {
				elementType = "Group";
				__TimelineEditorComponent = GroupTimeline;
			} else if (type === Image) {
				elementType = "Image";
				__TimelineEditorComponent = ImageTimeline;
			} else if (type === Clip) {
				elementType = "Clip";
				__TimelineEditorComponent = ClipTimeline;
			} else {
				return; // 跳过未知类型
			}

			elements.push({
				...props,
				__type: elementType,
				__TimelineEditorComponent: __TimelineEditorComponent,
			});
		}
	});

	return elements;
}

const TimelineEditor = () => {
	const { currentTime, setCurrentTime } = useTimeline();

	// 从 timeline JSX 中提取的初始状态
	const [elements, setElements] = useState<TimelineEditorElement[]>(
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
				{elements.map((element) => {
					if (element.__type === "Group") return <div>Group</div>;

					return (
						<div
							key={element.id}
							className="absolute flex p-1"
							style={{
								left: element.start * ratio,
								width: (element.end - element.start) * ratio,
							}}
						>
							<div className="bg-red-200 rounded w-full">
								{element.start}-{element.end}
								<element.__TimelineEditorComponent
									key={element.id}
									{...element}
								/>
							</div>
						</div>
					);
				})}
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
