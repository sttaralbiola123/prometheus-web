const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function runPrometheus(workDir, inputFileName) {
    return new Promise((resolve, reject) => {

        const child = spawn(
            "lua",
            [
                "/opt/Prometheus/cli.lua",
                "--preset",
                "Strong",
                inputFileName
            ],
            {
                cwd: workDir
            }
        );

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", data => {
            stdout += data.toString();
        });

        child.stderr.on("data", data => {
            stderr += data.toString();
        });

        child.on("close", async code => {

            try {

                const files = await fs.readdir(workDir);

                const luaFiles = files.filter(
                    f => f.endsWith(".lua") &&
                    f !== inputFileName
                );

                if (luaFiles.length > 0) {

                    const output = await fs.readFile(
                        path.join(workDir, luaFiles[0]),
                        "utf8"
                    );

                    resolve(output);
                    return;
                }

                resolve(stdout);

            } catch (err) {
                reject(err);
            }
        });

        child.on("error", reject);

    });
}

app.post("/api/obfuscate", async (req, res) => {

    try {

        const code = req.body.code || "";

        if (!code.trim()) {
            return res.status(400).json({
                ok: false,
                error: "No code supplied"
            });
        }

        const workDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "prometheus-")
        );

        const inputFile = `input-${crypto.randomBytes(8).toString("hex")}.lua`;

        await fs.writeFile(
            path.join(workDir, inputFile),
            code
        );

        const output = await runPrometheus(
            workDir,
            inputFile
        );

        await fs.rm(workDir, {
            recursive: true,
            force: true
        });

        res.json({
            ok: true,
            code: output
        });

    } catch (err) {

        res.status(500).json({
            ok: false,
            error: err.message
        });

    }

});

app.get("/healthz", (req, res) => {
    res.json({ ok: true });
});

app.listen(PORT, () => {
    console.log(`Running on ${PORT}`);
});
