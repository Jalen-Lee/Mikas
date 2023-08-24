import * as vscode from "vscode";
import * as Tinify from "tinify";
import * as path from "path";
import * as util from "util";
import * as svgo from "svgo";
import * as imageSize from "image-size";
import { nanoid } from "nanoid";
import WebviewLoader from "./webview-loader";
import { getAvailableImageDirectoryStructure, isAvailableSvgoExt, isAvailableTinypngExt, isDev, sleep } from "./utils";
import { WebviewIPCSignal, type IPCMessage, ExtensionIPCSignal, WorkspaceNode, ExecutedStatus } from "./typing";
import logger from "./utils/logger";
import type { ISizeCalculationResult } from "image-size/dist/types/interface";

const tinify = Tinify.default;
const sizeOf = util.promisify(imageSize.default);

logger.info("env", process.env.NODE_ENV);

export default class ImageCompressor {
  private tempFolder: vscode.Uri;
  private vsCodeContext: vscode.ExtensionContext;
  private webviewTempFolderMap = new WeakMap<vscode.Webview, vscode.Uri>();
  private webviewIdTempFolderMap = new Map<string, vscode.Uri>();
  private readonly disposers: vscode.Disposable[] = [];
  private static instance: ImageCompressor | undefined;

  constructor(context: vscode.ExtensionContext) {
    logger.info("vsCodeContext.extensionFsPath", context.extensionUri.fsPath);
    if (ImageCompressor.instance) {
      return ImageCompressor.instance;
    }
    ImageCompressor.instance = this;
    this.vsCodeContext = context;
    this.webviewInit();
  }

  /**
   * @description tinypngApiKey校验
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
            const tinypngApiKey = vscode.workspace.getConfiguration("mikas").get<string>("tinypngApiKey") || "";
            logger.info("tinypngApiKey", tinypngApiKey);
            if (tinypngApiKey) {
              tinify.key = tinypngApiKey;
              try {
                await tinify.validate();
                resolve(true);
              } catch (e) {
                reject(false);
                await sleep(500);
                vscode.window.showErrorMessage(`TinyPNG: API validation failed: ${e.message}`);
              }
            } else {
              reject(false);
              await sleep(500);
              vscode.window.showErrorMessage('TinyPNG: API validation failed. Be sure that you filled out "tinypngApiKey" setting already.', "Open Settings").then((options) => {
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
      // 没有打开的工作空间文件夹
      vscode.window.showErrorMessage("No open workspace folder");
      return;
    }
    const tempFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, ".mikas");
    // const tempFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, ".mikas");
    try {
      await vscode.workspace.fs.createDirectory(tempFolderUri);
      this.tempFolder = tempFolderUri;
      logger.info("createRootTempFolder", tempFolderUri.fsPath);
    } catch (error) {
      logger.error("createRootTempFolder", error);
    }
  }

  /**
   *
   */
  private async webviewInit() {
    const dispose = vscode.commands.registerCommand("mikas.compress", async (entry: vscode.Uri, others: vscode.Uri[]) => {
      logger.info("entry", entry);
      logger.info("others", others);
      const tinypngApiKeyValid = await this.tinypngApiKeyValidate();
      if (!tinypngApiKeyValid) return;
      await this.createRootTempFolder();
      const { webviewPanel, webviewId } = await this.createWebviewPanel();
      webviewPanel.onDidDispose(() => {
        this.webviewDestroy(webviewId);
      });
      this.setWebviewMessageListener(webviewPanel.webview);
      let treePromises;
      if (Array.isArray(others) && others.length) {
        treePromises = others.map<Promise<WorkspaceNode>>((uri) => getAvailableImageDirectoryStructure(uri, webviewPanel.webview));
      } else {
        treePromises = [getAvailableImageDirectoryStructure(entry, webviewPanel.webview)];
      }
      const treeData = (await Promise.all<WorkspaceNode>(treePromises)).filter(Boolean);
      logger.info("treeData", treeData);
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

  /**
   * @description 创建压缩任务队列
   * @param files
   * @returns
   */
  private createCompressTaskQueue(files: { key: string; fsPath: string; ext: string }[], tempUri: vscode.Uri) {
    return files.map<() => Promise<any> | any>((file) => {
      if (isAvailableTinypngExt(file.ext)) {
        return () => this.tinifyCompress(file.fsPath, tempUri);
      } else if (isAvailableSvgoExt(file.ext)) {
        return () => this.svgoCompress(file.fsPath, tempUri);
      } else {
        return () => Promise.resolve();
      }
    });
  }

  /**
   * @description 处理压缩任务队列，默认限制最大6个并发任务
   * @param queue
   * @param cb
   * @param concurrency 最大并发数
   */
  private consumeCompressTaskQueue<T>(tasks: (() => Promise<T>)[], fulfilledCb: (res: any) => void, rejectedCb: (res: any) => void, concurrency = 2) {
    let i = 0;
    const ret = []; // 存储所有的异步任务
    const executing = []; // 存储正在执行的异步任务
    const enqueue = function () {
      if (i === tasks.length) {
        return Promise.resolve();
      }
      const task = tasks[i++]; // 获取新的任务项
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
      // 当并发值小于或等于总任务个数时，进行并发控制
      if (concurrency <= tasks.length) {
        // 当任务完成后，从正在执行的任务数组中移除已完成的任务
        const e = p.then((res) => {
          return executing.splice(executing.indexOf(e), 1);
        });
        executing.push(e);
        if (executing.length >= concurrency) {
          r = Promise.race(executing);
        }
      }

      // 正在执行任务列表 中较快的任务执行完成之后，才会从array数组中获取新的待办任务
      return r.then(() => enqueue());
    };
    return enqueue().then(() => Promise.all(ret));
  }

  /**
   * @description tinypng压缩
   * @param fsPath 文件路径
   * @returns
   */
  private tinifyCompress(fsPath: string, tempUri: vscode.Uri) {
    return new Promise<{
      key: string;
      sourceFsPath: string;
      destinationFsPath: string;
      optimizedSize: number;
      optimizedDimensions: ISizeCalculationResult;
    }>((resolve, reject) => {
      try {
        const postfix = vscode.workspace.getConfiguration("mikas").get<string>("compressedFilePostfix") || "";
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(tempUri.fsPath, `${parsedPath.name}${postfix}${parsedPath.ext}`);
        tinify.fromFile(fsPath).toFile(destinationFsPath, async (error, data) => {
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
            const stat = await vscode.workspace.fs.stat(vscode.Uri.parse(destinationFsPath));
            const dimensions = await sizeOf(destinationFsPath);
            resolve({
              key: fsPath,
              sourceFsPath: fsPath,
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
   * @description svgo压缩
   * @param fsPath
   */
  private async svgoCompress(fsPath: string, tempUri: vscode.Uri) {
    return new Promise(async (resolve, reject) => {
      try {
        const postfix = vscode.workspace.getConfiguration("mikas").get<string>("compressedFilePostfix") || "";
        const svgBuffer = await vscode.workspace.fs.readFile(vscode.Uri.parse(fsPath));
        const output = svgo.optimize(svgBuffer.toString(), {});
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(tempUri.fsPath, `${parsedPath.name}${postfix}${parsedPath.ext}`);
        const destinationUri = vscode.Uri.parse(destinationFsPath);
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

  /**
   * @description 多文件压缩
   * @param payload
   * @param senderWebview
   */
  private async handleCompressFiles(
    payload: {
      files: Array<{ key: string; fsPath: string; ext: string }>;
    },
    senderWebview: vscode.Webview
  ) {
    logger.info("handleCompressFiles", payload);
    const { files = [] } = payload;
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    try {
      const tempUri = this.webviewTempFolderMap.get(senderWebview) || this.tempFolder;
      const tasksQueue = this.createCompressTaskQueue(files, tempUri);
      const concurrency = vscode.workspace.getConfiguration("mikas").get<string>("concurrency") || 6;
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
                optimizedWebviewUri: senderWebview.asWebviewUri(vscode.Uri.parse(res.destinationFsPath)).toString(),
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
      const forceOverwrite = vscode.workspace.getConfiguration("mikas").get<string>("forceOverwrite") || "";
      const taskPromises = files.map((file) => {
        return new Promise((resolve, reject) => {
          const tempUri = vscode.Uri.parse(file.tempFsPath);
          let sourceUri;
          if (forceOverwrite) {
            sourceUri = vscode.Uri.parse(file.sourceFsPath);
          } else {
            const sourceParsedInfo = path.parse(file.sourceFsPath);
            const tempParsedInfo = path.parse(file.tempFsPath);
            sourceUri = vscode.Uri.parse(`${sourceParsedInfo.dir}/${tempParsedInfo.base}`);
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

  /**
   * @description 创建webview实例
   * @returns
   */
  private async createWebviewPanel() {
    const allWorkspaceUri = vscode.workspace.workspaceFolders.map((i) => i.uri);
    const panel = vscode.window.createWebviewPanel("mikas", "Mikas - Image Compressor", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        isDev
          ? vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "src", "modules", "image-compressor", "webview", "dist")
          : vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "dist", "image-compressor-dist"),
        ...allWorkspaceUri,
      ],
    });
    panel.iconPath = isDev
      ? vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "assets", "icon.png")
      : vscode.Uri.joinPath(this.vsCodeContext.extensionUri, "dist", "assets", "icon.png");
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
    logger.info("handleOpenFileCommand", payload);
    const fileUri = vscode.Uri.parse(`vscode://file${payload.file}`);
    vscode.env.openExternal(fileUri);
  }

  private handleOpenFileInExplorerCommand(payload: { file: string }) {
    logger.info("handleOpenFileInExplorer", payload);
    const fileUri = vscode.Uri.parse(payload.file);
    vscode.env.openExternal(fileUri);
  }

  /**
   * @description 设置webview事件监听
   * @param webview
   */
  private setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      (message: IPCMessage) => {
        const { signal, payload } = message;
        logger.info("Webview message", message);
        switch (signal) {
          case WebviewIPCSignal.Compress:
            this.handleCompressFiles(payload, webview);
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

  /**
   * @description 单例
   * @param context
   * @returns
   */
  public static getInstance(context: vscode.ExtensionContext) {
    if (!this.instance) {
      this.instance = new ImageCompressor(context);
    }
    return this.instance;
  }
}
