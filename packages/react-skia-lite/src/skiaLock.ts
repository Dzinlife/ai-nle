export class SkiaLock {
	private chain = Promise.resolve();

	run<T>(fn: () => T | Promise<T>) {
		const result = this.chain.then(fn, fn);
		this.chain = result.then(
			() => void 0,
			() => void 0,
		);
		return result;
	}
}

export const skiaLock = new SkiaLock();
