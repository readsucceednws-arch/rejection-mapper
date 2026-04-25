import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupPassport } from "./auth";
import { initDb } from "./db";
import * as dbModule from "./db";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);

// Allow Attendance Mapper to call this API with session cookies
app.use(cors({
  origin: "https://attendance.aicreator.co.in",
  credentials: true,
}));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// 50 MB limit — the default 100 KB is too small for bulk imports.
// At ~250 bytes/row, 50 MB supports ~200,000 rows in a single request.
app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const port = parseInt(process.env.PORT || "5000", 10);

// Start listening immediately so health checks pass, then init DB
httpServer.listen(
  { port, host: "0.0.0.0", reusePort: true },
  () => { log(`serving on port ${port}`); }
);

(async () => {
  try {
    log("Initializing database...", "startup");
    await initDb();
    log("Database ready", "startup");
  } catch (err: any) {
    console.error("[startup] Database initialization failed:", err.message || err);
    console.error("[startup] Full error:", err);
    // Exit with error code if DB fails - don't continue
    process.exit(1);
  }

  try {
    // Session setup AFTER pool is initialized
    const PgSession = connectPgSimple(session);
    app.use(
      session({
        store: new PgSession({
          pool: dbModule.pool,
          tableName: "session",
          createTableIfMissing: true,
        }),
        secret: process.env.SESSION_SECRET || "rejectmap-secret-key-change-in-prod",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
          maxAge: 30 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        },
      })
    );

    setupPassport();
    app.use(passport.initialize());
    app.use(passport.session());

    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    log("Application ready", "startup");
  } catch (err: any) {
    console.error("[startup] Fatal error during setup:", err.message || err);
  }
})();
