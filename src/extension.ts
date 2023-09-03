import "./modules/image-compressor/utils/preload";
import * as vscode from "vscode";
import ImageCompressor from "./modules/image-compressor";
import logger from "./modules/image-compressor/utils/logger";

export function activate(context: vscode.ExtensionContext) {
  logger.info("env", process.env.NODE_ENV);
  logger.info("VsCode.version", vscode.version);
  logger.info("extensionFsPath", context.extensionUri.fsPath);
  const imageEffecter = new ImageCompressor(context);
  context.subscriptions.push(...imageEffecter.dispatcher);
}

export function deactivate() {
  logger.info("deactivate", "Mikas");
}
