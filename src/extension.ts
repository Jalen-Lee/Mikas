// import "./modules/image-compressor/utils/preload";
import * as vscode from "vscode";
import registerImageCompressorSupport from "./modules/image-compressor";
import Processor from "./modules/image-compressor/processor";

export function activate(context: vscode.ExtensionContext) {
  // registerImageCompressorSupport(context);
  const processor = new Processor(context);
  processor.hooks.validate.tapAsync("flag1", (name: boolean, callback) => {
    console.log("flag1", name);
    callback();
  });

  processor.hooks.validate.tapPromise("flag2", (name: boolean) => {
    return new Promise((resolve, reject) => {
      console.log("flag2", name);
      resolve(true);
    });
  });

  processor.hooks.validate.tapPromise("flag3", (name: boolean) => {
    return new Promise<boolean>((resolve, reject) => {
      console.log("flag3", name);
      // resolve();
    });
  });

  processor.hooks.validate.callAsync(false, (error, result) => {
    console.log("Done", result, error);
  });
}

export function deactivate() {}
