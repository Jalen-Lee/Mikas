import * as fs from "fs";
import * as path from "path";
import * as tarFs from "tar-fs";
import * as stream from "stream";
import * as zlib from "zlib";
import * as detectLibc from "detect-libc";
import logger from "./logger";

const env = process.env;
let userPath;

if (getPlatform().includes("win")) {
  userPath = process.env.HOME;
} else {
  userPath = process.env.USERPROFILE;
}

const platformAndArch = getPlatform();
const extensionFsPath = path.resolve(__dirname, "../");
const vendorFsPath = path.resolve(userPath, ".vscode/extensions/vendor");
const libvipsVersion = "8.14.4";
const libvipsFsPath = path.resolve(extensionFsPath, `./assets/libvips-${libvipsVersion}`);
const prebuild = {
  "darwin-arm64v8": path.resolve(libvipsFsPath, "./libvips-8.14.4-darwin-arm64v8.tar.br"),
  "darwin-x64": path.resolve(libvipsFsPath, "./libvips-8.14.4-darwin-x64.tar.br"),
  "linux-arm64v8": path.resolve(libvipsFsPath, "./libvips-8.14.4-linux-arm64v8.tar.br"),
  "linux-armv6": path.resolve(libvipsFsPath, "./libvips-8.14.4-linux-armv6.tar.br"),
  "linux-armv7": path.resolve(libvipsFsPath, "libvips-8.14.4-linux-armv7.tar.br"),
  "linux-x64": path.resolve(libvipsFsPath, "libvips-8.14.4-linux-x64.tar.br"),
  "linuxmusl-arm64v8": path.resolve(libvipsFsPath, "libvips-8.14.4-linuxmusl-arm64v8.tar.br"),
  "win32-arm64v8": path.resolve(libvipsFsPath, "libvips-8.14.4-win32-arm64v8.tar.br"),
  "win32-x64": path.resolve(libvipsFsPath, "libvips-8.14.4-win32-x64.tar.br"),
};

logger.info("platform", getPlatform());
logger.info("extensionFsPath", extensionFsPath);
logger.info("vendorFsPath", vendorFsPath);
logger.info("libvipsFsPath", libvipsFsPath);
logger.info("prebuild", prebuild);

(async () => {
  try {
    if (fs.existsSync(vendorFsPath)) {
      fs.rmSync(vendorFsPath, {
        recursive: true,
      });
    }
    fs.mkdirSync(vendorFsPath, {
      recursive: true,
    });
    await extractTarball(prebuild[platformAndArch]);
    logger.info("vendor mounted!");
  } catch (e) {
    errorhandler(e);
  }
})();

function errorhandler(error) {
  if (error) {
    logger.error("libvips.load", error);
    process.env.mikas_libvips_loaded = "false";
  }
}

function getPlatform() {
  const arch = env.npm_config_arch || process.arch;
  const platform = env.npm_config_platform || process.platform;
  const libc =
    process.env.npm_config_libc ||
    /* istanbul ignore next */
    (detectLibc.isNonGlibcLinuxSync() ? detectLibc.familySync() : "");
  const libcId = platform !== "linux" || libc === detectLibc.GLIBC ? "" : libc;

  const platformId = [`${platform}${libcId}`];

  if (arch === "arm") {
    const fallback = process.versions.electron ? "7" : "6";
    //@ts-ignore
    platformId.push(`armv${env.npm_config_arm_version || process.config.variables.arm_version || fallback}`);
  } else if (arch === "arm64") {
    platformId.push(`arm64v${env.npm_config_arm_version || "8"}`);
  } else {
    platformId.push(arch);
  }

  return platformId.join("-");
}

async function extractTarball(tarPath: string) {
  const versionedVendorPath = path.resolve(vendorFsPath, libvipsVersion, platformAndArch);
  await stream.pipeline(
    fs.createReadStream(tarPath),
    // @ts-ignore
    new zlib.BrotliDecompress(),
    tarFs.extract(versionedVendorPath),
    errorhandler
  );
}
