import type { CloudPhotoDecision } from "../ai/cloud-language";

export interface PhotoTask {
  providerTaskId: string;
  taskToken?: string;
  model?: string;
  credentialAttempt?: number;
  prompt?: string;
}
export interface PhotoJob {
  uid: string;
  characterId: string;
  parentReplyId: string;
  timestamp: number;
  decision: CloudPhotoDecision;
  task?: PhotoTask;
  status: "queued" | "starting" | "polling" | "failed";
}
const PREFIX = "vc-photo-job-v1:";
const key = (uid: string, reply: string) => PREFIX + JSON.stringify([uid, reply]);
export function readPhotoJob(uid: string, reply: string): PhotoJob | null {
  try {
    const raw = localStorage.getItem(key(uid, reply));
    if (!raw) return null;
    const job = JSON.parse(raw) as PhotoJob;
    if (job.uid !== uid || job.parentReplyId !== reply || !job.characterId ||
        !Number.isFinite(job.timestamp) || !job.decision?.intent ||
        !["queued", "starting", "polling", "failed"].includes(job.status)) return null;
    return job;
  } catch { return null; }
}
export function writePhotoJob(job: PhotoJob) {
  // A failed durable write must stop generation, rather than silently lose a paid task.
  localStorage.setItem(key(job.uid, job.parentReplyId), JSON.stringify(job));
}
export function removePhotoJob(uid: string, reply: string) {
  localStorage.removeItem(key(uid, reply));
}
export function listPhotoJobs(uid: string, characterId: string): PhotoJob[] {
  const jobs: PhotoJob[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(PREFIX)) continue;
      const [owner, reply] = JSON.parse(storageKey.slice(PREFIX.length));
      if (owner !== uid || typeof reply !== "string") continue;
      const job = readPhotoJob(uid, reply);
      if (job?.characterId === characterId) jobs.push(job);
    }
  } catch { /* unavailable storage: no automatic paid retry */ }
  return jobs.sort((a, b) => a.timestamp - b.timestamp);
}
export function clearPhotoJobs(uid: string, characterId: string) {
  for (const job of listPhotoJobs(uid, characterId)) removePhotoJob(uid, job.parentReplyId);
}

/** Serialize starts/delivery across tabs sharing this browser's local journal. */
export async function withPhotoJobLock<T>(uid: string | null, reply: string, signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw signal.reason;
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("vc-photo-job:" + JSON.stringify([uid, reply]), { mode: "exclusive", signal }, async () => {
      if (signal.aborted) throw signal.reason;
      return run();
    });
  }
  return run();
}
