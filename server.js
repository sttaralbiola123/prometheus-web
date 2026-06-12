const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_CODE_BYTES = 300_000;
const TIMEOUT_MS = 30_000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

function runPrometheus(workDir, inputFileName) {
  return new Promise((resolve, reject) => {
    const preset = "Strong";
    const args = ["--preset", preset, inputFileName];

    const child = spawn("prometheus-lua", args, {
      cwd: workDir,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let done = false;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      reject(new Error("Timed out while obfuscating code."));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", async (code) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);

      try {
        const files = await fs.readdir(workDir);
        const luaFiles = files.filter((f) => f.endsWith(".lua") && f !== inputFileName);

        if (luaFiles.length > 0) {
          const outputPath = path.join(workDir, luaFiles[0]);
          const output = await fs.readFile(outputPath, "utf8");
          resolve(output);
          return;
        }

        if (stdout.trim()) {
          resolve(stdout);
          return;
        }

        reject(new Error(`Prometheus exited with code ${code}. ${stderr || "No output produced."}`));
      } catch (err) {
        reject(err);
      }
    });
  });
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/obfuscate", async (req, res) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code : "";

    if (!code.trim()) {
      return res.status(400).json({ ok: false, error: "Walang code na ipinasa." });
    }

    if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
      return res.status(413).json({ ok: false, error: "Masyadong mahaba ang code." });
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "prometheus-"));
    const inputName = `input-${crypto.randomBytes(8).toString("hex")}.lua`;
    const inputPath = path.join(workDir, inputName);

    await fs.writeFile(inputPath, code, "utf8");

    const output = await runPrometheus(workDir, inputName);

    await fs.rm(workDir, { recursive: true, force: true });

    return res.json({
      ok: true,
      preset: "Strong",
      code: output
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "May nangyaring error."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
