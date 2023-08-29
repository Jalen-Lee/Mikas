import * as vscode from "vscode";
import ImageCompressor from "./modules/image-compressor";
import logger from "./modules/image-compressor/utils/logger";
import * as sharp from "sharp";

logger.info("sharp", sharp);

export function activate(context: vscode.ExtensionContext) {
  const imageEffecter = new ImageCompressor(context);
  context.subscriptions.push(...imageEffecter.dispatcher);
}

export function deactivate() {
  logger.info("deactivate", "Mikas");
}
