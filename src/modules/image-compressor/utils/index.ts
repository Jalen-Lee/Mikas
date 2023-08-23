import vscode, { Uri, Webview } from "vscode";
import * as fs from "fs";
import * as path from "path";
import { FileType, type DirectoryStructureNode, ImageDirectoryStructureNode, CompressedState, WorkspaceNode } from "@image-compressor/typing";
import * as util from "util";
import * as imageSize from "image-size";
const sizeOf = util.promisify(imageSize.default);

export const isDev = process.env.NODE_ENV === "development";
export const isProduction = process.env.NODE_ENV === "production";

export function getWebviewUri(webview: Webview, extensionUri: Uri, ...pathList: string[]) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList)).toString();
}

export function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export async function isFile(uri: vscode.Uri) {
  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type === vscode.FileType.File;
}

export function isFileSync(path: string) {
  return fs.statSync(path).isFile;
}

export async function isDirectory(uri: vscode.Uri) {
  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type === vscode.FileType.Directory;
}

export function isDirectorySync(path: string) {
  return fs.statSync(path).isDirectory;
}

export function isAvailableTinypngExt(filename: string) {
  return /\.(png|jpg|jpeg|webp)$/gi.test(filename);
}

export function isAvailableSvgoExt(filename: string) {
  return /\.(svg)$/gi.test(filename);
}

export function isAvailableImage(filename: string) {
  return isAvailableTinypngExt(filename) || isAvailableSvgoExt(filename);
}

export function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
}

/**
 * @description 获取目录结构树
 * @param uri 入口
 * @param filter 文件过滤器
 * @param parentUri 父目录
 * @returns
 */
export async function getDirectoryStructure<T>(
  uri: vscode.Uri,
  parentUri: vscode.Uri = vscode.Uri.parse("/"),
  filter?: (fsPath: string) => Boolean,
  mapped?: (node: DirectoryStructureNode) => Promise<DirectoryStructureNode & T>
): Promise<DirectoryStructureNode & T> {
  filter = filter || (() => true);
  mapped = mapped || ((node) => Promise.resolve(node) as Promise<DirectoryStructureNode & T>);
  const info = path.parse(uri.fsPath);

  if (await isFile(uri)) {
    const stat = await vscode.workspace.fs.stat(uri);
    return filter(uri.fsPath)
      ? await mapped({
          key: uri.fsPath,
          title: info.base,
          isLeaf: true,
          name: info.base,
          fsPath: uri.fsPath,
          size: stat.size,
          type: FileType.File,
          parsedInfo: info,
          parentPath: parentUri.fsPath,
        })
      : undefined;
  } else if (await isDirectory(uri)) {
    const directoryStructure: DirectoryStructureNode = {
      key: uri.fsPath,
      title: info.base,
      isLeaf: false,
      name: info.base,
      fsPath: uri.fsPath,
      type: FileType.Directory,
      parsedInfo: info,
      children: [],
      parentPath: parentUri.fsPath,
    };

    const entries = await vscode.workspace.fs.readDirectory(uri);
    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.joinPath(uri, name);
      const info = path.parse(entryUri.fsPath);
      if (type === vscode.FileType.Directory) {
        const childStructure = await getDirectoryStructure(entryUri, uri, filter, mapped);
        childStructure && directoryStructure.children.push(childStructure);
      } else {
        const stat = await vscode.workspace.fs.stat(entryUri);
        if (filter(entryUri.fsPath)) {
          directoryStructure.children.push(
            await mapped({
              key: entryUri.fsPath,
              title: name,
              isLeaf: true,
              name: name,
              fsPath: entryUri.fsPath,
              size: stat.size,
              type: FileType.File,
              parsedInfo: info,
              parentPath: uri.fsPath,
            })
          );
        }
      }
    }
    return directoryStructure as DirectoryStructureNode & T;
  }
  return undefined;
}

/**
 * @default 获取可处理图片的目录结构,生成节点树
 * @param uri 入口
 * @param webview webview实例
 * @param parentUri 父目录
 * @returns
 */
export async function getAvailableImageDirectoryStructure(uri: vscode.Uri, webview: vscode.Webview, parentUri?: vscode.Uri): Promise<WorkspaceNode> {
  return getDirectoryStructure<ImageDirectoryStructureNode>(uri, parentUri, isAvailableImage, async (node: DirectoryStructureNode) => {
    const dimensions = await sizeOf(node.fsPath);
    return {
      compressedState: CompressedState.IDLE,
      sourceWebviewUri: webview.asWebviewUri(Uri.parse(node.fsPath)).toString(),
      optimizedFsPath: "",
      optimizedWebviewUri: "",
      optimizedSize: 0,
      errorMessage: "",
      disabled: false,
      disableCheckbox: node.type === FileType.Directory && node?.children.length === 0,
      dimensions,
      optimizedDimensions: {
        width: 0,
        height: 0,
      },
      ...node,
    };
  });
}
