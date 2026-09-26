import { Queue } from "bullmq";
import { Redis } from "ioredis";
const url = new URL(process.env.STUDIO_REDIS_URL || "");
if (url.hostname !== "127.0.0.1") throw Error("Local fixture queue only");
const connection = new Redis(url.href, { maxRetriesPerRequest: null });
const q = new Queue("studio-renders-v1", { connection });
try {
  if (process.argv[2] === "pause") await q.pause();
  else if (process.argv[2] === "resume") await q.resume();
  else throw Error("pause|resume");
} finally {
  await q.close();
  await connection.quit();
}
