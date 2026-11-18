import { loadEnv, type Plugin } from "vite";
import { loginHandler } from "@ldayton/account/server";
export function accountApi(): Plugin {
  return {
    name: "soundtools-account-api",
    configureServer(server) {
      const env = {
        ...loadEnv(server.config.mode, server.config.root, ""),
        ...process.env,
      };
      server.middlewares.use("/api/account/login", loginHandler(env));
    },
    configurePreviewServer(server) {
      const env = {
        ...loadEnv(server.config.mode, server.config.root, ""),
        ...process.env,
      };
      server.middlewares.use("/api/account/login", loginHandler(env));
    },
  };
}
