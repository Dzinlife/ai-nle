// src/reconciler/index.ts
import ReactReconciler from "react-reconciler";
import { hostConfig } from "./_HostConfig";

export const SkiaRenderer = ReactReconciler(hostConfig);
