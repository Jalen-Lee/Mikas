import "./modules/image-compressor/utils/preload";
import * as vscode from "vscode";
import registerImageCompressorSupport from "./modules/image-compressor";

export function activate(context: vscode.ExtensionContext) {
  registerImageCompressorSupport(context);
}

export function deactivate() {}
