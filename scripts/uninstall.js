const fs = require("fs");
const path = require("path");

const extensionPath = path.resolve(process.cwd, "../");
const vendorPath = path.resolve(extensionPath, "../vendor");

if (fs.existsSync(vendorPath)) {
  fs.rmSync(vendorPath, { recursive: true, maxRetries: 3, force: true });
}

console.log("mikas uninstall!");
