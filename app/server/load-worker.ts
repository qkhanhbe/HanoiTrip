import { parentPort, workerData } from 'node:worker_threads';
const deadline = performance.now() + Number(workerData) * 1000;
let iterations = 0;
while (performance.now() < deadline) {
  iterations++;
  Math.sqrt(iterations);
}
parentPort?.postMessage({ iterations });
