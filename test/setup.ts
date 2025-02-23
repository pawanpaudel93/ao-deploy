import { spawn } from "child_process";

let waoProcess: any;

export async function setup() {
  console.log("Starting wao server...");

  // Start wao in background
  waoProcess = spawn("npx", ["wao-esm"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env }
  });

  // Wait for wao to be ready (increased timeout to 30s)
  await Promise.race([
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("wao startup timeout (30s elapsed)")),
        30000
      )
    ),
    new Promise((resolve, reject) => {
      waoProcess.stdout?.on("data", () => {
        // const output = data.toString();
        // console.log("wao output:", output.trim());

        resolve(true);
      });

      waoProcess.stderr?.on("data", (data: Buffer) => {
        const error = data.toString();
        console.error("wao error:", error.trim());
      });

      waoProcess.on("error", (error: any) => {
        console.error("wao process error:", error);
        reject(error);
      });

      waoProcess.on("exit", (code: any, signal: any) => {
        const error = new Error(
          `wao exited with code ${code} (signal: ${signal})`
        );
        console.error(error.message);
        reject(error);
      });
    })
  ]).catch((error) => {
    console.error("Server startup failed:", error);
    if (waoProcess) {
      try {
        process.kill(-waoProcess.pid);
      } catch (killError) {
        console.error("Failed to kill process:", killError);
      }
    }
    throw error;
  });

  // Add a small delay after server reports ready
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log("Setup complete - server should be ready");
}

export async function teardown() {
  console.log("Starting teardown...");
  if (waoProcess) {
    try {
      process.kill(-waoProcess.pid);
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log("Force killing wao process...");
          process.kill(-waoProcess.pid, "SIGKILL");
          resolve(true);
        }, 5000);

        waoProcess.on("exit", () => {
          clearTimeout(timeout);
          console.log("wao process exited cleanly");
          resolve(true);
        });
      });
    } catch (error) {
      console.error("Error during teardown:", error);
    }
  }
  console.log("Teardown complete");
}
