import { spawn, ChildProcess } from "child_process";

let emulatorProcess: ChildProcess | null = null;

async function waitForEmulators(retries = 90, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const [authRes, fsRes] = await Promise.all([
        fetch("http://127.0.0.1:9099/"),
        fetch("http://127.0.0.1:8080/"),
      ]);
      if ((authRes.ok || authRes.status === 404) && (fsRes.ok || fsRes.status === 404)) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    "Firebase emulators did not start in time.\n" +
    "The Firestore emulator requires Java. Install it with:\n" +
    "  brew install --cask temurin"
  );
}

export async function clearEmulatorData() {
  await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/notedude2/databases/(default)/documents",
    { method: "DELETE" }
  );
  await fetch(
    "http://127.0.0.1:9099/emulator/v1/projects/notedude2/accounts",
    { method: "DELETE" }
  );
}

export default async function globalSetup() {
  emulatorProcess = spawn(
    "firebase",
    ["emulators:start", "--only", "auth,firestore", "--project", "notedude2"],
    { stdio: "pipe", detached: false }
  );

  await waitForEmulators();

  return async () => {
    if (emulatorProcess) {
      emulatorProcess.kill("SIGTERM");
      emulatorProcess = null;
    }
  };
}
