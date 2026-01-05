import {
	type ComponentType,
	type Context,
	type ReactNode,
	useCallback,
	useContext,
	useRef,
} from "react";

type BridgeProps = { children: ReactNode };

/**
 * Hook to bridge React contexts from a parent tree to a custom reconciler tree.
 *
 * Custom reconcilers (like Skia's) create separate React trees that don't
 * automatically inherit context from the parent tree. This hook captures
 * context values from the parent and returns a Bridge component that provides
 * those values to children rendered in the custom reconciler.
 *
 * **Important**: The list of contexts should be stable (same contexts in same order)
 * between renders to comply with React's rules of hooks.
 *
 * @example
 * ```tsx
 * import { ThemeContext, UserContext } from './contexts';
 * import { Canvas, useContextBridge } from 'react-skia-lite';
 *
 * function MyCanvas({ children }) {
 *   // Call useContextBridge with all contexts you want to bridge
 *   const ContextBridge = useContextBridge(ThemeContext, UserContext);
 *
 *   return (
 *     <Canvas>
 *       <ContextBridge>
 *         {children}
 *       </ContextBridge>
 *     </Canvas>
 *   );
 * }
 * ```
 */
export function useContextBridge<T extends Context<any>[]>(
	...contexts: T
): ComponentType<BridgeProps> {
	// Read all context values - this subscribes the calling component to these contexts
	const values = contexts.map((ctx) => useContext(ctx));

	// Use ref to store latest values without changing component identity
	const valuesRef = useRef<unknown[]>(values);
	valuesRef.current = values;

	// Use ref to store contexts
	const contextsRef = useRef<T>(contexts);
	contextsRef.current = contexts;

	// Create a stable Bridge component that reads from refs
	// This component's identity stays the same across renders
	const contextBridge = useCallback(({ children }: BridgeProps): ReactNode => {
		// Read the latest values from ref at render time
		const currentContexts = contextsRef.current;
		const currentValues = valuesRef.current;

		return currentContexts.reduceRight(
			(acc, Context, i) => (
				<Context.Provider value={currentValues[i]}>{acc}</Context.Provider>
			),
			children,
		) as ReactNode;
	}, []);

	return contextBridge;
}
