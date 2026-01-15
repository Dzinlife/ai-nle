# Editor 模块

视频编辑器的核心模块，包含时间线编辑器、预览编辑器和素材库。

## 目录结构

```text
editor/
├── components/           # UI 子组件
│   ├── ElementSettingsPanel.tsx  # 元素属性设置面板
│   ├── TimeIndicatorCanvas.tsx   # 时间指示器画布（红色竖线）
│   ├── TimelineDragOverlay.tsx   # 拖拽指示层（ghost + drop 指示）
│   ├── TimelineElement.tsx       # 时间线元素（可拖拽的轨道元素）
│   ├── TimelineRuler.tsx         # 时间尺（顶部刻度）
│   └── TimelineToolbar.tsx       # 工具栏（播放控制、吸附开关等）
│
├── contexts/             # React Context 和状态管理
│   ├── TimelineContext.tsx       # 核心状态管理 (Zustand store)
│   │                             # - 元素列表、选中状态、播放状态
│   │                             # - 拖拽状态、轨道分配
│   │                             # - 吸附和联动设置
│   └── PreviewProvider.tsx       # 预览画布 context
│                                 # - canvas ref 和渲染状态
│
├── drag/                 # 拖拽状态（跨组件共享）
│   ├── dragStore.ts              # 拖拽状态 store（素材拖入画布用）
│   └── index.ts
│
├── timeline/             # 轨道计算逻辑
│   ├── dragCalculations.ts       # 拖拽位置计算
│   ├── trackConfig.ts            # 轨道配置（高度、间距等）
│   ├── types.ts                  # 类型定义
│   ├── useElementDrag.ts         # 元素拖拽 hook
│   ├── useTimelineElementDnd.ts  # 元素拖拽逻辑（单选/多选）
│   └── index.ts
│
├── utils/                # 工具函数
│   ├── attachments.ts            # 元素联动关系计算
│   ├── snap.ts                   # 吸附点计算
│   └── trackAssignment.ts        # 轨道分配算法
│
├── TimelineEditor.tsx    # 主时间线编辑器组件
├── PreviewEditor.tsx     # 预览画布编辑器
├── MaterialLibrary.tsx   # 素材库面板
├── index.tsx             # 入口，组合所有编辑器组件
├── timelineLoader.ts     # 时间线数据加载器
└── timeline.json         # 示例时间线数据
```

## 核心组件

### TimelineEditor.tsx

主时间线编辑器，负责：

- 渲染所有轨道和元素
- 处理滚动和缩放
- 管理主轨道（track 0）的特殊行为
- 渲染拖拽指示层（ghost + drop 指示）

### PreviewEditor.tsx

预览画布，负责：

- 渲染当前时间点的可见元素
- 处理画布交互（选择、变换）
- 导出图片/视频

### MaterialLibrary.tsx

素材库面板，负责：

- 展示可用素材列表
- 处理素材拖拽到时间线

## 状态管理

### TimelineContext.tsx (Zustand)

核心状态包括：

- `elements`: 所有时间线元素
- `currentTime`: 当前播放时间
- `isPlaying`: 播放状态
- `selectedIds`: 选中元素列表
- `primarySelectedId`: 主选中元素
- `trackAssignments`: 轨道分配映射
- `snapEnabled`: 吸附开关
- `autoAttach`: 自动联动开关

常用 hooks：

```tsx
useElements()          // 获取/设置元素列表
useCurrentTime()       // 获取当前时间
usePlaybackControl()   // 播放控制
useSelectedElement()   // 选中元素状态
useMultiSelect()       // 多选状态与操作
useTrackAssignments()  // 轨道分配
useSnap()              // 吸附设置
useAttachments()       // 联动设置
```

## 轨道系统

- Track 0 为主轨道（Main），固定在最底部
- 其他轨道从上到下递增
- 元素可以跨轨道拖拽
- 支持自动轨道分配（避免重叠）

## 吸附系统

- 元素边缘吸附
- 播放头吸附
- 可通过工具栏开关

## 联动系统

- 当 `autoAttach` 启用时，拖拽主轨道元素会带动相邻元素
- 通过 `findAttachments` 计算联动关系
