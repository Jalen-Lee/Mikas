import { type } from "os";
import type { ParsedPath } from "path"

export interface IPCMessage {
  signal: string,
  payload: any
}
// 文件类型
export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 3
}

// 压缩进程状态
export enum CompressedState {
  IDLE = "idle",
  PENDING = "pending",
  FULFILLED = "fulfilled",
  REJECTED = "rejected",
  SAVED = "saved"
}

export interface DirectoryStructureNode {
  key: string;
  // 标题
  title: string;
  // 是否是叶子结点
  isLeaf: boolean;
  // 文件名
  name: string,
  // 系统路径
  fsPath: string,
  // 类型
  type: FileType.File | FileType.Directory,
  // 大小
  size?: number;
  // path.parse解析数据
  parsedInfo: ParsedPath,
  // 父目录
  parentPath: string,
  // 子节点
  children?: Array<DirectoryStructureNode>,
};

export interface ImageDirectoryStructureNode {
  compressedState: CompressedState;
  sourceWebviewUri: string;
  optimizedFsPath: string;
  optimizedWebviewUri: string;
  optimizedSize: number;
  errorMessage: string;
  disabled: boolean;
  disableCheckbox: boolean;
  dimensions: {
    width: number;
    height: number;
  }
  optimizedDimensions: {
    width: number;
    height: number;
  }
}

export type WorkspaceNode = DirectoryStructureNode & ImageDirectoryStructureNode;

export enum WebviewIPCSignal {
  Compress = "webview.compress",
  Save = "webview.save",
  OpenFile = "webview.openFile",
  OpenFileInExplorer = "webview.openFileInExplorer",
}

export enum ExtensionIPCSignal {
  Init = "extension.init",
  Compressed = "extension.compressed",
  AllCompressed = "extension.allCompressed",
  Saved = "extension.saved",
  AllSaved = "extension.AllSaved"
}

export enum ExecutedStatus {
  Fulfilled = "fulfilled",
  Rejected = "rejected",
}
