import * as vscode from "vscode";
import * as Tinify from "tinify";
import * as path from "path";
import * as util from "util";
import * as svgo from "svgo";
import * as imageSize from "image-size";
import { nanoid } from "nanoid";
import WebviewLoader from "./webview-loader";
import { getAvailableImageDirectoryStructure, isAvailableSvgoExt, isAvailableTinypngExt } from "./utils";
import { WebviewIPCSignal, type IPCMessage, ExtensionIPCSignal, WorkspaceNode, ExecutedStatus } from "./typing";
import logger from "./utils/logger";

const tinify = Tinify.default;
const sizeOf = util.promisify(imageSize.default);
import type { ISizeCalculationResult } from "image-size/dist/types/interface";

logger.info("env", process.env.NODE_ENV)

export default class ImageCompressor {

  private tempFolder: vscode.Uri;
  private tinypngAPIKey = "";
  private readonly commandKey = "flat-copilot.image-effecter.compress";
  private vsCodeContext: vscode.ExtensionContext;
  private webviewTempFolderMap = new WeakMap<vscode.Webview, vscode.Uri>;
  private webviewIdTempFolderMap = new Map<string, vscode.Uri>;
  private readonly disposables: vscode.Disposable[] = [];
  private static instance: ImageCompressor | undefined;


  constructor(context: vscode.ExtensionContext) {
    logger.info("vsCodeContext.extensionFsPath", context.extensionUri.fsPath);
    if (ImageCompressor.instance) {
      return ImageCompressor.instance;
    }
    ImageCompressor.instance = this;
    this.vsCodeContext = context;
    this.configInit();
    this.webviewInit();
  }

  /**
   * @description tinypngApiKey校验
   * @returns
   */
  private tinypngApiKeyValidate() {
    return new Promise<Boolean>(async (resolve, reject) => {
      try {
        const tinypngApiKey = vscode.workspace.getConfiguration('mikas').get<string>('tinypngApiKey') || "";
        logger.info("tinypngApiKey", tinypngApiKey);
        if (tinypngApiKey) {
          tinify.key = tinypngApiKey;
          try {
            await tinify.validate();
            this.tinypngAPIKey = tinypngApiKey;
            vscode.window.showInformationMessage(`TinyPNG API Key 校验成功，当前压缩额度已使用${tinify.compressionCount}次`);
            resolve(true);
          } catch (e) {
            throw new Error('TinyPNG API Key 校验失败，请确保Key有效或重新创建。');
          }
        } else {
          throw new Error('TinyPNG: API validation failed. Be sure that you filled out tinypng.apiKey setting already.');
        }
      } catch (e) {
        vscode.window.showErrorMessage(e.message);
        reject(false);
      }
    });
  }

  private async createRootTempFolder() {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) {
      // 没有打开的工作空间文件夹
      vscode.window.showErrorMessage("No open workspace folder");
      return;
    }
    const tempFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, ".flat-copliot");
    try {
      await vscode.workspace.fs.createDirectory(tempFolderUri);
      this.tempFolder = tempFolderUri;
      logger.info('createRootTempFolder', tempFolderUri.fsPath);
    } catch (error) {
      logger.error('createRootTempFolder', error);
    }
  }

  private configInit() {
    this.createRootTempFolder();
  }

  /**
   *
   */
  private webviewInit() {
    const disposable = vscode.commands.registerCommand("mikas.compress", async (entry: vscode.Uri, others: vscode.Uri[]) => {
      const tinypngApiKeyValid = await this.tinypngApiKeyValidate();
      if (!tinypngApiKeyValid) return
      const { webviewPanel, webviewId } = this.createWebviewPanel();
      webviewPanel.onDidDispose(() => {
        this.webviewDestroy(webviewId);
      });
      this.setWebviewMessageListener(webviewPanel.webview);
      let treePromises;
      if (others.length) {
        treePromises = others.map<Promise<WorkspaceNode>>(uri => getAvailableImageDirectoryStructure(uri, webviewPanel.webview));
      } else {
        treePromises = [getAvailableImageDirectoryStructure(entry, webviewPanel.webview)];
      }
      const treeData = (await (Promise.all<WorkspaceNode>(treePromises))).filter(Boolean);
      logger.info("treeData", treeData);
      webviewPanel.webview.postMessage({
        signal: ExtensionIPCSignal.Init,
        payload: {
          workspace: treeData
        }
      });
      const tempDir = vscode.Uri.joinPath(this.tempFolder, Date.now() + '');
      await vscode.workspace.fs.createDirectory(tempDir);
      !this.webviewTempFolderMap.has(webviewPanel.webview) && this.webviewTempFolderMap.set(webviewPanel.webview, tempDir);
      !this.webviewIdTempFolderMap.has(webviewId) && this.webviewIdTempFolderMap.set(webviewId, tempDir);
    });
    this.disposables.push(disposable);
  }

  private async webviewDestroy(webviewId: string) {
    try {
      const tempDir = this.webviewIdTempFolderMap.get(webviewId);
      await vscode.workspace.fs.delete(tempDir, {
        recursive: true,
        useTrash: false
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
  private createCompressTaskQueue(files: { key: string, fsPath: string, ext: string }[], tempUri: vscode.Uri) {
    return files.map<() => Promise<any> | any>((file) => {
      if (isAvailableTinypngExt(file.ext)) { return () => this.tinifyCompress(file.fsPath, tempUri); }
      else if (isAvailableSvgoExt(file.ext)) { return () => this.svgoCompress(file.fsPath, tempUri); }
      else { return () => Promise.resolve(); }
    });
  }

  /**
   * @description 处理压缩任务队列，默认限制最大6个并发任务
   * @param queue
   * @param cb
   * @param concurrency 最大并发数
   */
  private consumeCompressTaskQueue<T>(tasks: (() => Promise<T>)[], cb: (res: any) => void, concurrency = 2) {
    let i = 0;
    const ret = []; // 存储所有的异步任务
    const executing = []; // 存储正在执行的异步任务
    const enqueue = function () {
      if (i === tasks.length) {
        return Promise.resolve();
      }
      const task = tasks[i++]; // 获取新的任务项
      const p = Promise.resolve()
        .then(() => task()).then(res => {
          cb(res);
          return res;
        });
      ret.push(p);

      let r = Promise.resolve();
      // 当并发值小于或等于总任务个数时，进行并发控制
      if (concurrency <= tasks.length) {
        // 当任务完成后，从正在执行的任务数组中移除已完成的任务
        const e = p.then((res) => {
          // cb(res);
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
      key: string,
      sourceFsPath: string,
      destinationFsPath: string,
      optimizedSize: number
      optimizedDimensions: ISizeCalculationResult
    }>((resolve, reject) => {
      try {
        const postfix = vscode.workspace.getConfiguration('mikas').get<string>('compressedFilePostfix') || "";
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(
          tempUri.fsPath,
          `${parsedPath.name}${postfix}${parsedPath.ext}`
        );
        tinify.fromFile(fsPath).toFile(destinationFsPath, async (error, data) => {
          if (error) {
            if (error instanceof tinify.AccountError) {
              throw new Error('[AccountError]: Authentication failed. Have you set the API Key? Verify your API key and account limit.');
            } else if (error instanceof tinify.ClientError) {
              throw new Error('[ClientError]: Check your source image and request options.');
            } else if (error instanceof tinify.ServerError) {
              throw new Error('[ServerError]: Temporary issue with the Tinify API,TinyPNG API is currently not available.');
            } else if (error instanceof tinify.ConnectionError) {
              throw new Error('[ConnectionError]: Network issue occurred. Please check your internet connectivity.');
            } else {
              throw new Error('[UnknownError]: Something else went wrong, unrelated to the Tinify API. Please try again later.');
            }
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
        reject(new Error(e.message));
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
        const postfix = vscode.workspace.getConfiguration('mikas').get<string>('compressedFilePostfix') || "";
        const svgBuffer = await vscode.workspace.fs.readFile(vscode.Uri.parse(fsPath));
        const output = svgo.optimize(svgBuffer.toString(), {});
        const parsedPath = path.parse(fsPath);
        const destinationFsPath = path.join(
          tempUri.fsPath,
          `${parsedPath.name}${postfix}${parsedPath.ext}`
        );
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
        reject(new Error(e.message));
      }
    });
  }

  /**
   * @description 多文件压缩
   * @param payload
   * @param senderWebview
   */
  private async handleCompressFiles(payload: {
    files: Array<{ key: string; fsPath: string; ext: string }>
  }, senderWebview: vscode.Webview) {
    logger.info("handleCompressFiles", payload);
    const { files = [] } = payload;
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );
    try {
      const tempUri = this.webviewTempFolderMap.get(senderWebview) || this.tempFolder;
      const tasksQueue = this.createCompressTaskQueue(files, tempUri);
      const concurrency = vscode.workspace.getConfiguration('mikas').get<string>('concurrency') || 6;
      const result = await this.consumeCompressTaskQueue(tasksQueue, (res) => {
        statusBarItem.text = `${res.sourceFsPath} compress`;
        statusBarItem.show();
        senderWebview.postMessage({
          signal: ExtensionIPCSignal.Compressed,
          payload: {
            status: ExecutedStatus.Fulfilled,
            data: {
              ...res,
              optimizedWebviewUri: senderWebview.asWebviewUri(vscode.Uri.parse(res.destinationFsPath)).toString()
            },
            error: ""
          }
        });
      }, Number(concurrency));
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.AllCompressed,
        payload: {
          status: ExecutedStatus.Fulfilled,
          data: result,
          error: ""
        }
      });
      vscode.window.showInformationMessage(`${files.length}张图片已压缩完成！`);
      statusBarItem.dispose();
    } catch (e) {
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.AllCompressed,
        payload: {
          status: ExecutedStatus.Rejected,
          data: [],
          error: e.message
        }
      });
    } finally {
      statusBarItem.dispose();
    }
  }

  private async handleSaveCommand(payload: {
    files: {
      key: string,
      sourceFsPath: string,
      tempFsPath: string,
    }[]
  }, senderWebview: vscode.Webview) {
    try {
      const { files = [] } = payload;
      const forceOverwrite = vscode.workspace.getConfiguration('mikas').get<string>('forceOverwrite') || "";
      const taskPromises = files.map(file => {
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
                error: ""
              });
            })
            .catch((e) => {
              reject({
                status: ExecutedStatus.Rejected,
                key: file.key,
                overwrite: forceOverwrite,
                error: e.message
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
          error: ""
        }
      });
      vscode.window.showInformationMessage(`${res.length} pictures operation completed`);
    } catch (e) {
      logger.error("handleSaveCommand", e);
      senderWebview.postMessage({
        signal: ExtensionIPCSignal.Saved,
        payload: {
          status: ExecutedStatus.Rejected,
          data: [],
          error: e.message
        }
      });
    }
  }

  /**
   * @description 创建webview实例
   * @returns
   */
  private createWebviewPanel() {
    const allWorkspaceUri = vscode.workspace.workspaceFolders.map(i => i.uri);
    const panel = vscode.window.createWebviewPanel(
      'mikas',
      'Mikas - Image Compressor',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          process.env.NODE_ENV === "development" ? vscode.Uri.joinPath(this.vsCodeContext.extensionUri, 'src', 'modules', 'image-compressor', 'webview', 'dist') : vscode.Uri.joinPath(this.vsCodeContext.extensionUri, 'dist', 'image-compressor-dist'),
          ...allWorkspaceUri
        ],
      }
    );
    const webviewLoader = new WebviewLoader(this.vsCodeContext, panel.webview, {
      htmlEntry: process.env.NODE_ENV === "development" ? ['src', 'modules', 'image-compressor', 'webview', 'dist', 'index.html'] : ['dist', 'image-compressor-dist', 'index.html'],
      distDir: process.env.NODE_ENV === "development" ? ['src', 'modules', 'image-compressor', 'webview', 'dist'] : ['dist', 'image-compressor-dist']
    });
    panel.webview.html = webviewLoader.html;
    return {
      webviewPanel: panel,
      webviewId: nanoid()
    };
  }

  private async handleOpenFileCommand(payload: {
    file: string
  }) {
    logger.info("handleOpenFileCommand", payload)
    const fileUri = vscode.Uri.parse(`vscode://file${payload.file}`);
    vscode.env.openExternal(fileUri);
  }

  private handleOpenFileInExplorerCommand(payload: {
    file: string
  }) {
    logger.info("handleOpenFileInExplorer", payload)
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
    return this.disposables;
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
