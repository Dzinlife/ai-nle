import React, { useEffect, useState } from "react";
import { useElements, useSelectedElement } from "../contexts/TimelineContext";

const ElementSettingsPanel: React.FC = () => {
	const { selectedElement, setSelectedElementId } = useSelectedElement();
	const { setElements } = useElements();
	const [name, setName] = useState("");

	// 同步选中元素的 name 到本地状态
	useEffect(() => {
		if (selectedElement) {
			setName(selectedElement.name || "");
		}
	}, [selectedElement?.id, selectedElement?.name]);

	if (!selectedElement) {
		return null;
	}

	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newName = e.target.value;
		setName(newName);

		// 更新元素的 name
		setElements((prev) =>
			prev.map((el) =>
				el.id === selectedElement.id ? { ...el, name: newName } : el,
			),
		);
	};

	const handleClose = () => {
		setSelectedElementId(null);
	};

	return (
		<div className="absolute top-4 left-4 z-[100] bg-neutral-900/95 backdrop-blur-lg border border-white/10 rounded-lg shadow-xl p-4 min-w-64">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-medium text-white">Element Settings</h3>
				<button
					onClick={handleClose}
					className="text-neutral-400 hover:text-white transition-colors"
				>
					<svg
						className="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div className="space-y-3">
				<div>
					<label className="block text-xs text-neutral-400 mb-1">Name</label>
					<input
						type="text"
						value={name}
						onChange={handleNameChange}
						placeholder={selectedElement.type}
						className="w-full bg-neutral-800 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<div className="pt-2 border-t border-white/10">
					<div className="text-xs text-neutral-500">
						<div>Type: {selectedElement.type}</div>
						<div>ID: {selectedElement.id}</div>
						<div>Track Index: {selectedElement.timeline.trackIndex}</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ElementSettingsPanel;
