import { Inngest } from "inngest";

export const workerInngest = new Inngest({
  id: "hiveforyou-worker",
  name: "HiveForYou Worker",
  appVersion: process.env.WORKER_INNGEST_APP_VERSION?.trim() || undefined,
});
