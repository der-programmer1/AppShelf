import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--import", "tsx", "--watch", "server/main.ts"], { stdio: "inherit", env: { ...process.env, PORT: "3001", NODE_ENV: "development" } }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];
const stop = () => children.forEach(child => child.kill("SIGTERM"));
process.on("SIGTERM", stop);process.on("SIGINT", stop);
children.forEach(child=>child.on("exit", code=>{stop();process.exitCode=code ?? 0;}));
