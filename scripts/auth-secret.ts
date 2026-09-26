import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/auth";
// Read from stdin, never argv or logs of a shell command. Output is itself secret.
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > 1024) process.exit(1);
});
process.stdin.on("end", () => {
  const password = input.trim();
  if (password.length < 16 || password.length > 256) {
    console.error("Use a password of 16–256 characters.");
    process.exitCode = 1;
    return;
  }
  console.log(
    `APP_PASSWORD_HASH=${hashPassword(password)}\nAUTH_SECRET=${randomBytes(32).toString("hex")}`,
  );
});
