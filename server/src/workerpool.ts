import { availableParallelism } from "os";
import { Worker, WorkerOptions } from "worker_threads";

export default class WorkerPool {
	private workers: Worker[];
	private available: Worker[];

	constructor(filename: string | URL, options?: WorkerOptions) {
		this.workers = [];

		for (let i = 0; i < availableParallelism(); i++) {
			this.workers.push(new Worker(filename, options));
		}

		this.available = [...this.workers];
	}

	public async run(req: unknown): Promise<unknown> {
		let worker = this.available.shift();

		if (worker === undefined) {
			worker = this.workers.shift()!;
			this.workers.push(worker);
		}

		return new Promise((res, rej) => {
			const { port1, port2 } = new MessageChannel();

			port1.addEventListener(
				"message",
				({ data }) => {
					if ("res" in data) {
						res(data.res);
					} else {
						rej(
							data.err ?? new Error("worker did not return a result or error")
						);
					}
				},
				{ once: true }
			);

			worker.postMessage({ port: port2, req }, [port2 as any]);
		}).then((res) => {
			this.available.push(worker);
			return res;
		});
	}
}
