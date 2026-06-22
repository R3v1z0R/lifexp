import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { authRoutes } from "./routes/auth";
import { logsRoutes } from "./routes/logs";

const app = Fastify({
  logger: true,
});

// Plugins
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || "dev-secret-key",
});

app.register(fastifyCors, {
  origin: true,
});

app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "15 minutes",
});

// Swagger documentation
app.register(fastifySwagger, {
  openapi: {
    openapi: "3.1.0",
    info: {
      title: "LifeXP API",
      description: "Gamified life-tracking API with XP system, social features, and monetization",
      version: "1.0.0",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
});

app.register(fastifySwaggerUI, {
  routePrefix: "/docs",
});

// Routes
app.register(authRoutes);
app.register(logsRoutes);

// Health check
app.get("/health", async (request, reply) => {
  return { ok: true };
});

// Start server
async function start() {
  try {
    const port = parseInt(process.env.PORT || "3000", 10);
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Server running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
