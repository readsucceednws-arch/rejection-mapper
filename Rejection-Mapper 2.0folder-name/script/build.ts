import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "node:fs/promises";

// Server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("Building client...");
  await viteBuild();

  console.log("Building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));

  // Only use production dependencies here
  const dependencies = Object.keys(pkg.dependencies || {});
  const externals = dependencies.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    outfile: "dist/index.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    minify: true,
    sourcemap: false,
    logLevel: "info",
    external: externals,
    mainFields: ["module", "main"],
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  console.log("Build completed successfully.");
}

buildAll().catch((err) => {
  console.error("Build failed:");
  console.error(err);
  process.exit(1);
});
