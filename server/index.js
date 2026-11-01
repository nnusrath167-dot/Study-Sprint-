import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const clientDir = path.join(projectRoot, "client");
const distDir = path.join(projectRoot, "dist");
const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");

function hasSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("YOUR-PROJECT-REF") &&
    !supabaseAnonKey.includes("YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"),
  );
}

app.disable("x-powered-by");
app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/config", (_request, response) => {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  response.json({
    configured: hasSupabaseConfig(),
    supabaseUrl,
    // The anon/publishable key is intended for browser use; database safety comes from RLS.
    supabaseAnonKey,
  });
});

if (production) {
  app.use(express.static(distDir));
  app.get("*", (_request, response) => response.sendFile(path.join(distDir, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.log(`StudySprint config/API server listening on http://localhost:${port}`);
  if (!hasSupabaseConfig()) {
    console.warn("Supabase is not configured. Copy .env.example to .env and add your project URL and anon/publishable key.");
  }
});
