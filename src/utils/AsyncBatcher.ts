interface Query<I, O> {
  resolve: (result: O) => void;
  reject: (error: unknown) => void;
  payload: I;
}

export class AsyncBatcher<I, O> implements Disposable {
  private queue: Query<I, O>[] = [];
  private tid: number | undefined;

  constructor(
    private batchFunction: (payloads: I[]) => Promise<O[]>,
    private batchInterval: number = 1000,
  ) {}

  add(payload: I): Promise<O> {
    const { promise, resolve, reject } = Promise.withResolvers<O>();

    this.queue.push({ resolve, reject, payload });

    // Start the timer if it's not already running.
    if (!this.tid) {
      this.tid = setTimeout(() => this.processBatch(), this.batchInterval);
    }

    return promise;
  }

  private async processBatch(): Promise<void> {
    const batch = [...this.queue];
    this.queue = [];

    clearTimeout(this.tid);
    this.tid = undefined;

    try {
      const payloads = batch.map((q) => q.payload);
      const results = await this.batchFunction(payloads);

      if (results.length !== batch.length) {
        throw new Error('Batch function returned mismatched results.');
      }

      batch.forEach((q, i) => q.resolve(results[i]));
    } catch (error) {
      batch.forEach((q) => q.reject(error));
    }
  }

  close(): void {
    clearTimeout(this.tid);
    this.queue.forEach((q) => q.reject(new Error('Batcher closed.')));
  }

  [Symbol.dispose]() {
    this.close();
  }
}
