import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
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

function hasRecentAuthentication(accessToken) {
  const payload = accessToken.split(".")[1];
  if (!payload) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const ageSeconds = Date.now() / 1000 - Number(claims.auth_time);
    return Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 10 * 60;
  } catch {
    return false;
  }
}

async function listStorageFiles(storage, prefix) {
  const paths = [];
  const folders = [prefix];
  while (folders.length) {
    const folder = folders.pop();
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(folder, { limit: 100, offset });
      if (error) throw error;
      if (!data.length) break;

      for (const entry of data) {
        const objectPath = `${folder}/${entry.name}`;
        if (entry.id) paths.push(objectPath);
        else folders.push(objectPath);
      }

      if (data.length < 100) break;
    }
  }
  return paths;
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

app.delete("/api/account", async (request, response) => {
  if (!hasSupabaseConfig()) {
    response.status(503).json({ error: "Account deletion is temporarily unavailable. Please contact nnusrath167@gmail.com." });
    return;
  }

  const authorization = request.get("authorization") || "";
  const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!tokenMatch) {
    response.status(401).json({ error: "Sign in again before deleting your account." });
    return;
  }

  const accessToken = tokenMatch[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  let user;
  try {
    const publicClient = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await publicClient.auth.getUser(accessToken);
    if (error || !data.user) {
      response.status(401).json({ error: "Your session is invalid. Sign in again, then retry." });
      return;
    }
    user = data.user;
  } catch (error) {
    console.error("StudySprint could not verify an account deletion request:", error);
    response.status(502).json({ error: "Could not verify your session. Please retry." });
    return;
  }
  if (!hasRecentAuthentication(accessToken)) {
    response.status(403).json({ error: "For your security, confirm your password again before deleting your account." });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    response.status(503).json({ error: "Account deletion is not configured yet. Please contact nnusrath167@gmail.com." });
    return;
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const storage = adminClient.storage.from("studysprint-files");
    const paths = await listStorageFiles(storage, user.id);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await storage.remove(paths.slice(index, index + 100));
      if (error) throw error;
    }

    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) throw error;
    response.json({ ok: true });
  } catch (error) {
    console.error("StudySprint account deletion failed:", error);
    response.status(500).json({ error: "We could not finish deleting your cloud files and account. Please retry or email nnusrath167@gmail.com." });
  }
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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Self-service account deletion is disabled until SUPABASE_SERVICE_ROLE_KEY is configured on the server.");
  }
});
