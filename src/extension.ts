import "./modules/image-compressor/utils/preload";
import * as vscode from "vscode";
import ImageCompressor from "./modules/image-compressor";

export function activate(context: vscode.ExtensionContext) {
  const imageEffecter = new ImageCompressor(context);
  context.subscriptions.push(...imageEffecter.dispatcher);
}

export function deactivate() {}
