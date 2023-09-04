import * as vscode from "vscode";
import * as Tinify from "tinify";
import * as path from "path";
import * as util from "util";
import * as svgo from "svgo";
import * as imageSize from "image-size";
import * as os from "os";
import { nanoid } from "nanoid";
import WebviewLoader from "./webview-loader";
import { getDirectoryStructure, isAvailableImage, isAvailableSvgoExt, isAvailableTinypngExt, isDev, isGIF, isSvga, sleep } from "./utils";
import {
  WebviewIPCSignal,
  type IPCMessage,
  ExtensionIPCSignal,
  WorkspaceNode,
  ExecutedStatus,
  ImageDirectoryStructureNode,
  DirectoryStructureNode,
  CompressedState,
  FileType,
} from "./typing";
import logger from "./utils/logger";
import type { ISizeCalculationResult } from "image-size/dist/types/interface";
import { Uri } from "vscode";
import svgaUtility from "./utils/svga";
import open from "open";

const tinify = Tinify.default;
const sizeOf = util.promisify(imageSize.default);

const CONFIG_SECTION = "mikas";
enum CONFIG_KEY {
  Ignore = "ignore",
  TinypngApiKey = "tinypngApiKey",
  CompressedFilePostfix = "compressedFilePostfix",
  Concurrency = "concurrency",
  ForceOverwrite = "forceOverwrite",
}
enum VSCODE_COMMAND {
  Compress = "mikas.compress",
}

export default class ImageCompressor {
  public readonly name = "Mikas - Image Compressor";
  private tempFolder: vscode.Uri;
  private vsCodeContext: vscode.ExtensionContext;
  private ignorePatterns: string[];
  private tinypngApiKeyValid = false;
  private webviewTempFolderMap = new WeakMap<vscode.Webview, vscode.Uri>();
  private webviewIdTempFolderMap = new Map<string, vscode.Uri>();
  private readonly disposers: vscode.Disposable[] = [];
  private static instance: ImageCompressor | undefined;
  private sharp: typeof import("sharp") | undefined;

  constructor(context: vscode.ExtensionContext) {
    if (ImageCompressor.instance) {
      return ImageCompressor.instance;
    }
    ImageCompressor.instance = this;
    this.vsCodeContext = context;
    this.webviewInit();
  }

  private configInit() {
    try {
      const ignore = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.Ignore) || "";
      this.ignorePatterns = ignore.replace(/\s/g, "").split(";").filter(Boolean);
      logger.info("ignorePatterns", this.ignorePatterns);
      this.tinypngApiKeyValidate();
    } catch (e) {
      logger.error("configInit", e);
    }
  }

  /**
   * @description tinypng API Key validate
   * @returns
   */
  private tinypngApiKeyValidate() {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: "Mikas - Image Compressor: Preparing...",
      },
      (progress, token) => {
        return new Promise<Boolean>(async (resolve, reject) => {
          try {
            const tinypngApiKey = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.TinypngApiKey) || "";
            logger.info("tinypngApiKey", tinypngApiKey);
            if (tinypngApiKey) {
              tinify.key = tinypngApiKey;
              try {
                await tinify.validate();
                this.tinypngApiKeyValid = true;
                resolve(true);
              } catch (e) {
                reject(false);
                await sleep(500);
                vscode.window.showErrorMessage(`TinyPNG: API validation failed: ${e.message}`);
              }
            } else {
              reject(false);
              await sleep(500);
              vscode.window
                .showErrorMessage(
                  'TinyPNG: API validation failed. Be sure that you filled out "tinypngApiKey" setting already. Turn the compressor back on after setting.',
                  "Open Settings"
                )
                .then((options) => {
                  if (options === "Open Settings") {
                    vscode.commands.executeCommand("workbench.action.openSettings", "tinypngApiKey");
                  }
                });
            }
          } catch (e) {
            reject(false);
            await sleep(500);
            vscode.window.showErrorMessage(e.message);
          }
        });
      }
    );
  }

  private async createRootTempFolder() {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No open workspace folder");
      return;
    }
    const tempFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, `.${CONFIG_SECTION}`);
    try {
      await vscode.workspace.fs.createDirectory(tempFolderUri);
      this.tempFolder = tempFolderUri;
      logger.info("createRootTempFolder", tempFolderUri.fsPath);
    } catch (error) {
      logger.error("createRootTempFolder", error);
    }
  }

  private async getAvailableImageDirectoryStructure(uri: vscode.Uri, webview: vscode.Webview, parentUri?: vscode.Uri): Promise<WorkspaceNode> {
    return getDirectoryStructure<ImageDirectoryStructureNode>(
      uri,
      parentUri,
      isAvailableImage,
      //@ts-ignore
      async (node: DirectoryStructureNode) => {
        let dimensions: ImageDirectoryStructureNode["dimensions"];
        try {
          if (isSvga(node.fsPath)) {
            const { movieEntity } = await svgaUtility.parse(node.fsPath);
            dimensions = {
              width: movieEntity.params.viewBoxWidth,
              height: movieEntity.params.viewBoxHeight,
              version: movieEntity.version,
              ...movieEntity.params,
            };
          } else {
            dimensions = await sizeOf(node.fsPath);
          }
        } catch (e) {
          logger.error("dimensions.parse", e);
          dimensions = {
            width: 0,
            height: 0,
            error: `[Parse Error]: ${e}`,
          };
        }
        logger.info("$$", webview.asWebviewUri(Uri.file(node.fsPath)).toString());
        return {
          compressedState: dimensions.error ? CompressedState.REJECTED : CompressedState.IDLE,
          sourceWebviewUri: webview.asWebviewUri(Uri.file(node.fsPath)).toString(),
          optimizedFsPath: "",
          optimizedWebviewUri: "",
          optimizedSize: 0,
          errorMessage: dimensions.error ? dimensions.error : "",
          disabled: Boolean(dimensions.error),
          disableCheckbox: node.type === FileType.Directory && node?.children.length === 0,
          dimensions,
          optimizedDimensions: {
            width: 0,
            height: 0,
          },
          ...node,
        };
      },
      this.ignorePatterns
    );
  }

  private async webviewInit() {
    const dispose = vscode.commands.registerCommand(VSCODE_COMMAND.Compress, async (entry: vscode.Uri, others: vscode.Uri[]) => {
      logger.info("entry", entry);
      logger.info("others", others);
      this.configInit();
      await this.createRootTempFolder();
      const { webviewPanel, webviewId } = await this.createWebviewPanel();
      webviewPanel.onDidDispose(() => {
        this.webviewDestroy(webviewId);
      });
      this.setWebviewMessageListener(webviewPanel.webview);
      let treePromises;
      if (Array.isArray(others) && others.length) {
        treePromises = others.map<Promise<WorkspaceNode>>((uri) => this.getAvailableImageDirectoryStructure(uri, webviewPanel.webview));
      } else {
        treePromises = [this.getAvailableImageDirectoryStructure(entry, webviewPanel.webview)];
      }
      const treeData = (await Promise.all<WorkspaceNode>(treePromises)).filter(Boolean);
      if (webviewPanel.active) {
        webviewPanel.webview.postMessage({
          signal: ExtensionIPCSignal.Init,
          payload: {
            workspace: treeData,
          },
        });
      }
      const tempDir = vscode.Uri.joinPath(this.tempFolder, Date.now() + "");
      await vscode.workspace.fs.createDirectory(tempDir);
      !this.webviewTempFolderMap.has(webviewPanel.webview) && this.webviewTempFolderMap.set(webviewPanel.webview, tempDir);
      !this.webviewIdTempFolderMap.has(webviewId) && this.webviewIdTempFolderMap.set(webviewId, tempDir);
    });
    this.disposers.push(dispose);
  }

  private async webviewDestroy(webviewId: string) {
    try {
      const tempDir = this.webviewIdTempFolderMap.get(webviewId);
      await vscode.workspace.fs.delete(tempDir, {
        recursive: true,
        useTrash: false,
      });
      logger.info("webviewDestroy", `${webviewId} tempFolder has deleted`);
    } catch (e) {
      logger.error("webviewDestroy", `${webviewId} tempFolder delete error ${e}`);
    }
  }

  private createCompressTaskQueue(files: { key: string; fsPath: string; ext: string }[], tempUri: vscode.Uri) {
    return files.map<() => Promise<any> | any>((file) => {
      if (isAvailableTinypngExt(file.ext)) {
        return () => this.tinifyCompress(file.fsPath, tempUri);
      } else if (isAvailableSvgoExt(file.ext)) {
        return () => this.svgoCompress(file.fsPath, tempUri);
      } else if (isGIF(file.ext)) {
        return () => this.gifCompress(file.fsPath, tempUri);
      } else if (isSvga(file.ext)) {
        return () => this.svgaCompress(file.fsPath, tempUri);
      } else {
        return () => Promise.resolve();
      }
    });
  }

  /**
   * @description Process the compressed task queue with a maximum of 6 concurrent tasks by default
   * @param tasks
   * @param fulfilledCb
   * @param rejectedCb
   * @param concurrency Maximum concurrency
   */
  private consumeCompressTaskQueue<T>(tasks: (() => Promise<T>)[], fulfilledCb: (res: any) => void, rejectedCb: (res: any) => void, concurrency = 2) {
    let i = 0;
    const ret = []; // Stores all asynchronous tasks
    const executing = []; // Stores asynchronous tasks that are being executed
    const enqueue = function () {
      if (i === tasks.length) {
        return Promise.resolve();
      }
      const task = tasks[i++];
      const p = Promise.resolve()
        .then(() => task())
        .then((res) => {
          fulfilledCb(res);
          return res;
        })
        .catch((e) => {
          rejectedCb(e);
        });
      ret.push(p);

      let r = Promise.resolve();
      // When the concurrency value is less than or equal to the total number of tasks, concurrency control is implemented
      if (concurrency <= tasks.length) {
        // When the task is complete, the completed task is removed from the array of tasks being executed
        const e = p.then(() => {
          return executing.splice(executing.indexOf(e), 1);
        });
        executing.push(e);
        if (executing.length >= concurrency) {
          r = Promise.race(executing);
        }
      }

      // The system obtains a new task from the array only after the faster task in the executing task list is completed
      return r.then(() => enqueue());
    };
    return enqueue().then(() => Promise.all(ret));
  }

  /**
   * @description tinypng
   * @param fsPath
   * @param tempUri
   * @returns
   */
  private tinifyCompress(fsPath: string, tempUri: vscode.Uri) {
    return new Promise<{
      key: string;
      sourceFsPath: string;
      errorMessage: string;
      destinationFsPath: string;
      optimizedSize: number;
      optimizedDimensions: ISizeCalculationResult;
    }>((resolve, reject) => {
      try {
        if (!this.tinypngApiKeyValid) {
          reject({
            key: fsPath,
            sourceFsPath: fsPath,
            errorMessage: 'TinyPNG API validation failed. Be sure that you filled out "tinypngApiKey" setting already. Turn the compressor back on after setting.',
          });
          return;
        }
        const postfix = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.CompressedFilePostfix) || "";
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(tempUri.fsPath, `${parsedPath.name}${postfix}${parsedPath.ext}`);
        tinify.fromFile(fsPath).toFile(destinationFsPath, async (error) => {
          let errorMessage = "";
          if (error) {
            if (error instanceof tinify.AccountError) {
              errorMessage = "[AccountError]: Authentication failed. Have you set the API Key? Verify your API key and account limit.";
            } else if (error instanceof tinify.ClientError) {
              errorMessage = "[ClientError]: Check your source image and request options.";
            } else if (error instanceof tinify.ServerError) {
              errorMessage = "[ServerError]: Temporary issue with the Tinify API,TinyPNG API is currently not available.";
            } else if (error instanceof tinify.ConnectionError) {
              errorMessage = "[ConnectionError]: Network issue occurred. Please check your internet connectivity.";
            } else {
              errorMessage = "[UnknownError]: Something else went wrong, unrelated to the Tinify API. Please try again later.";
            }
            reject({
              key: fsPath,
              sourceFsPath: fsPath,
              errorMessage,
            });
          } else {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(destinationFsPath));
            const dimensions = await sizeOf(destinationFsPath);
            resolve({
              key: fsPath,
              sourceFsPath: fsPath,
              errorMessage,
              destinationFsPath,
              optimizedSize: stat.size,
              optimizedDimensions: dimensions,
            });
          }
        });
      } catch (e) {
        logger.error("tinifyCompressError", e);
        reject({
          key: fsPath,
          sourceFsPath: fsPath,
          errorMessage: e.message,
        });
      }
    });
  }

  /**
   * @description svgo
   * @param fsPath
   */
  private async svgoCompress(fsPath: string, tempUri: vscode.Uri) {
    return new Promise(async (resolve, reject) => {
      try {
        const postfix = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.CompressedFilePostfix) || "";
        const svgBuffer = await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath));
        const output = svgo.optimize(svgBuffer.toString(), {});
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(tempUri.fsPath, `${parsedPath.name}${postfix}${parsedPath.ext}`);
        const destinationUri = vscode.Uri.file(destinationFsPath);
        await vscode.workspace.fs.writeFile(destinationUri, Buffer.from(output.data));
        const stat = await vscode.workspace.fs.stat(destinationUri);
        const dimensions = await sizeOf(destinationFsPath);
        resolve({
          key: fsPath,
          sourceFsPath: fsPath,
          destinationFsPath,
          optimizedSize: stat.size,
          optimizedDimensions: dimensions,
        });
      } catch (e) {
        logger.error("svgoCompress", e);
        reject({
          key: fsPath,
          sourceFsPath: fsPath,
          errorMessage: e.message,
        });
      }
    });
  }

  private async gifCompress(fsPath: string, tempUri: vscode.Uri) {
    return new Promise(async (resolve, reject) => {
      try {
        const postfix = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.CompressedFilePostfix) || "";
        if (!this.sharp) {
          this.sharp = (await import("sharp")).default;
          // Reducing concurrency should reduce the memory usage too.
          const divisor = process.env.NODE_ENV === "development" ? 4 : 2;
          this.sharp.concurrency(Math.floor(Math.max(os.cpus().length / divisor, 1)));
        }
        const image = this.sharp(fsPath, {
          animated: true,
          limitInputPixels: false,
        });
        const metadata = await image.metadata();
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(tempUri.fsPath, `${parsedPath.name}${postfix}${parsedPath.ext}`);
        const destinationUri = vscode.Uri.file(destinationFsPath);
        await image
          .gif({
            colors: 50,
          })
          .toFile(destinationFsPath);
        const stat = await vscode.workspace.fs.stat(destinationUri);
        const dimensions = await sizeOf(destinationFsPath);
        resolve({
          key: fsPath,
          sourceFsPath: fsPath,
          destinationFsPath: destinationFsPath,
          optimizedSize: stat.size,
          optimizedDimensions: dimensions,
        });
      } catch (e) {
        logger.error("gifCompress", e);
        reject({
          key: fsPath,
          sourceFsPath: fsPath,
          errorMessage: e.message,
        });
      }
    });
  }

  private svgaCompress(fsPath: string, tempUri: vscode.Uri) {
    return new Promise(async (resolve, reject) => {
      try {
        const postfix = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.CompressedFilePostfix) || "";
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(tempUri.fsPath, `${parsedPath.name}${postfix}${parsedPath.ext}`);
        const destinationUri = vscode.Uri.file(destinationFsPath);
        const { destination, parsedInfo } = await svgaUtility.compress(fsPath, destinationFsPath);
        const stat = await vscode.workspace.fs.stat(destinationUri);
        resolve({
          key: fsPath,
          sourceFsPath: fsPath,
          destinationFsPath: destination,
          optimizedSize: stat.size,
          optimizedDimensions: {
            width: parsedInfo.params.viewBoxWidth,
            height: parsedInfo.params.viewBoxHeight,
            version: parsedInfo.version,
            ...parsedInfo.params,
          },
        });
      } catch (e) {
        logger.error("svgaCompress", e);
        reject({
          key: fsPath,
          sourceFsPath: fsPath,
          errorMessage: e.message,
        });
      }
    });
  }

  private async handleCompressFilesCommand(
    payload: {
      files: Array<{ key: string; fsPath: string; ext: string }>;
    },
    senderWebview: vscode.Webview
  ) {
    logger.info("handleCompressFilesCommand", payload);
    const { files = [] } = payload;
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    try {
      const tempUri = this.webviewTempFolderMap.get(senderWebview) || this.tempFolder;
      const tasksQueue = this.createCompressTaskQueue(files, tempUri);
      const concurrency = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.Concurrency) || 6;
      const result = await this.consumeCompressTaskQueue(
        tasksQueue,
        (res) => {
          statusBarItem.text = `${res.sourceFsPath} compress successful!`;
          statusBarItem.show();
          senderWebview.postMessage({
            signal: ExtensionIPCSignal.Compressed,
            payload: {
              status: ExecutedStatus.Fulfilled,
              data: {
                ...res,
                optimizedWebviewUri: senderWebview.asWebviewUri(vscode.Uri.file(res.destinationFsPath)).toString(),
              },
              error: "",
            },
          });
        },
        (res) => {
          statusBarItem.text = `${res.sourceFsPath} compress failed!`;
          statusBarItem.show();
          senderWebview.postMessage({
            signal: ExtensionIPCSignal.Compressed,
            payload: {
              status: ExecutedStatus.Rejected,
              data: res,
              error: res.errorMessage,
            },
          });
        },
        Number(concurrency)
      );
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.AllCompressed,
        payload: {
          status: ExecutedStatus.Fulfilled,
          data: result,
          error: "",
        },
      });
      statusBarItem.dispose();
    } catch (e) {
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.AllCompressed,
        payload: {
          status: ExecutedStatus.Rejected,
          data: [],
          error: e.message,
        },
      });
    } finally {
      statusBarItem.dispose();
    }
  }

  private async handleSaveCommand(
    payload: {
      files: {
        key: string;
        sourceFsPath: string;
        tempFsPath: string;
      }[];
    },
    senderWebview: vscode.Webview
  ) {
    try {
      const { files = [] } = payload;
      const forceOverwrite = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY.ForceOverwrite) || "";
      const taskPromises = files.map((file) => {
        return new Promise((resolve, reject) => {
          const tempUri = vscode.Uri.file(file.tempFsPath);
          let sourceUri: vscode.Uri;
          if (forceOverwrite) {
            sourceUri = vscode.Uri.file(file.sourceFsPath);
          } else {
            const sourceParsedInfo = path.parse(file.sourceFsPath);
            const tempParsedInfo = path.parse(file.tempFsPath);
            sourceUri = vscode.Uri.file(`${sourceParsedInfo.dir}/${tempParsedInfo.base}`);
          }
          Promise.resolve(vscode.workspace.fs.copy(tempUri, sourceUri, { overwrite: true }))
            .then(() => {
              resolve({
                status: ExecutedStatus.Fulfilled,
                key: file.key,
                overwrite: forceOverwrite,
                error: "",
              });
            })
            .catch((e) => {
              reject({
                status: ExecutedStatus.Rejected,
                key: file.key,
                overwrite: forceOverwrite,
                error: e.message,
              });
            });
        });
      });
      const res = await Promise.all(taskPromises);
      logger.info("handleSaveCommand", res);
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.Saved,
        payload: {
          status: ExecutedStatus.Fulfilled,
          data: res,
          error: "",
        },
      });
      vscode.window.showInformationMessage(`${res.length} pictures operation completed`);
    } catch (e) {
      logger.error("handleSaveCommand", e);
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.Saved,
        payload: {
          status: ExecutedStatus.Rejected,
          data: [],
          error: e.message,
        },
      });
    }
  }

  private async createWebviewPanel() {
    const allWorkspaceUri = vscode.workspace.workspaceFolders.map((i) => i.uri);
    logger.info("allWorkspaceUri", allWorkspaceUri);
    logger.info("vscode.workspace.workspaceFile", vscode.workspace.workspaceFile);
    const panel = vscode.window.createWebviewPanel(CONFIG_SECTION, this.name, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        ...allWorkspaceUri,
        isDev
          ? vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "src", "modules", "image-compressor", "webview", "dist")
          : vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "dist", "image-compressor-dist"),
      ],
    });
    panel.iconPath = vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "assets", "icon.png");
    const webviewLoader = new WebviewLoader(this.vsCodeContext, panel.webview, {
      htmlEntry: isDev ? ["src", "modules", "image-compressor", "webview", "dist", "index.html"] : ["dist", "image-compressor-dist", "index.html"],
      distDir: isDev ? ["src", "modules", "image-compressor", "webview", "dist"] : ["dist", "image-compressor-dist"],
    });
    panel.webview.html = await webviewLoader.getHtml();
    return {
      webviewPanel: panel,
      webviewId: nanoid(),
    };
  }

  private async handleOpenFileCommand(payload: { file: string }) {
    const fileUri = vscode.Uri.file(`vscode://file${payload.file}`);
    vscode.env.openExternal(fileUri);
  }

  private handleOpenFileInExplorerCommand(payload: { file: string }) {
    open(payload.file);
  }

  private setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      (message: IPCMessage) => {
        const { signal, payload } = message;
        switch (signal) {
          case WebviewIPCSignal.Compress:
            this.handleCompressFilesCommand(payload, webview);
            break;
          case WebviewIPCSignal.Save:
            this.handleSaveCommand(payload, webview);
            break;
          case WebviewIPCSignal.OpenFile:
            this.handleOpenFileCommand(payload);
            break;
          case WebviewIPCSignal.OpenFileInExplorer:
            this.handleOpenFileInExplorerCommand(payload);
            break;
        }
      },
      undefined,
      this.dispatcher
    );
  }

  public get dispatcher() {
    return this.disposers;
  }

  public static getInstance(context: vscode.ExtensionContext) {
    if (!this.instance) {
      this.instance = new ImageCompressor(context);
    }
    return this.instance;
  }
}
