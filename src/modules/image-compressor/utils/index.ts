import vscode, { Uri, Webview } from "vscode";
import * as fs from "fs";
import * as path from "path";
import { FileType, type DirectoryStructureNode, ImageDirectoryStructureNode, CompressedState, WorkspaceNode } from "@image-compressor/typing";
import * as util from "util";
import * as imageSize from "image-size";
import * as minimatch from "minimatch";
import * as os from "os";

export const sizeOf = util.promisify(imageSize.default);

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

export function isGIF(filename: string) {
  return /\.(gif)$/gi.test(filename);
}

export function isSvga(filename: string) {
  return /\.(svga)$/gi.test(filename);
}

export function isAvailableTinypngExt(filename: string) {
  return /\.(png|jpg|jpeg|webp)$/gi.test(filename);
}

export function isAvailableSvgoExt(filename: string) {
  return /\.(svg)$/gi.test(filename);
}

export function isAvailableImage(filename: string) {
  return isSvga(filename) || isAvailableTinypngExt(filename) || isAvailableSvgoExt(filename) || isGIF(filename);
}

export function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
}

export function globIgnoreFilter(ignore: string[], path: string) {
  for (const ignorePattern of ignore) {
    const matcher = minimatch.makeRe(ignorePattern);
    if (matcher && matcher.test(path)) return true;
  }
  return false;
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
  parentUri: vscode.Uri = vscode.Uri.file("/"),
  filter?: (fsPath: string) => Boolean,
  mapped?: (node: DirectoryStructureNode) => Promise<DirectoryStructureNode & T>,
  ignores?: string[]
): Promise<DirectoryStructureNode & T> {
  filter = filter || (() => true);
  mapped = mapped || ((node) => Promise.resolve(node) as Promise<DirectoryStructureNode & T>);
  ignores = ignores || [];
  if (globIgnoreFilter(ignores, uri.fsPath)) return;
  const info = path.parse(uri.fsPath);

  if (await isFile(uri)) {
    const stat = await vscode.workspace.fs.stat(uri);
    return filter(uri.fsPath)
      ? await mapped({
          key: uri.fsPath,
          title: uri.fsPath,
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
      title: uri.fsPath,
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
      if (!globIgnoreFilter(ignores, entryUri.fsPath)) {
        const info = path.parse(entryUri.fsPath);
        if (type === vscode.FileType.Directory) {
          const childStructure = await getDirectoryStructure(entryUri, uri, filter, mapped, ignores);
          childStructure && directoryStructure.children.push(childStructure);
        } else {
          const stat = await vscode.workspace.fs.stat(entryUri);
          if (filter(entryUri.fsPath)) {
            directoryStructure.children.push(
              await mapped({
                key: entryUri.fsPath,
                title: entryUri.fsPath,
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
    }
    return directoryStructure as DirectoryStructureNode & T;
  }
  return undefined;
}

export async function getAvailableImageDirectoryStructure(uri: vscode.Uri, webview: vscode.Webview, parentUri?: vscode.Uri, ignores?: string[]): Promise<WorkspaceNode> {
  // @ts-ignore
  return getDirectoryStructure<ImageDirectoryStructureNode>(
    uri,
    parentUri,
    isAvailableImage,
    //@ts-ignore
    async (node: DirectoryStructureNode) => {
      const dimensions = isSvga(node.fsPath)
        ? {
            with: 0,
            height: 0,
          }
        : await sizeOf(node.fsPath);
      return {
        compressedState: CompressedState.IDLE,
        sourceWebviewUri: webview.asWebviewUri(Uri.file(node.fsPath)).toString(),
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
    },
    ignores
  );
}

const AVIF = "image/avif";
const WEBP = "image/webp";
const PNG = "image/png";
const JPEG = "image/jpeg";
const GIF = "image/gif";
const SVG = "image/svg+xml";
const ICO = "image/x-icon";

const ANIMATABLE_TYPES = [WEBP, PNG, GIF];
const VECTOR_TYPES = [SVG];

/**
 * Inspects the first few bytes of a buffer to determine if
 * it matches the "magic number" of known file signatures.
 * https://en.wikipedia.org/wiki/List_of_file_signatures
 */
export function detectContentType(buffer: Buffer) {
  if ([0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
    return JPEG;
  }
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buffer[i] === b)) {
    return PNG;
  }
  if ([0x47, 0x49, 0x46, 0x38].every((b, i) => buffer[i] === b)) {
    return GIF;
  }
  if ([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50].every((b, i) => !b || buffer[i] === b)) {
    return WEBP;
  }
  if ([0x3c, 0x3f, 0x78, 0x6d, 0x6c].every((b, i) => buffer[i] === b)) {
    return SVG;
  }
  if ([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every((b, i) => !b || buffer[i] === b)) {
    return AVIF;
  }
  if ([0x00, 0x00, 0x01, 0x00].every((b, i) => buffer[i] === b)) {
    return ICO;
  }
  return null;
}

export function getOperatingSystem() {
  const platform = os.platform();

  if (platform === "win32") {
    return "Windows";
  } else if (platform === "darwin") {
    return "macOS";
  } else if (platform === "linux") {
    return "Linux";
  } else {
    return "Unknown";
  }
}
