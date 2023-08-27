import type { ParsedPath } from "path";

export interface IPCMessage {
  signal: string;
  payload: any;
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 3,
}

export enum CompressedState {
  IDLE = "idle",
  PENDING = "pending",
  FULFILLED = "fulfilled",
  REJECTED = "rejected",
  SAVED = "saved",
}

export interface DirectoryStructureNode {
  key: string;
  title: string;
  isLeaf: boolean;
  name: string;
  fsPath: string;
  type: FileType.File | FileType.Directory;
  size?: number;
  parsedInfo: ParsedPath;
  parentPath: string;
  children?: Array<DirectoryStructureNode>;
}

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
  };
  optimizedDimensions: {
    width: number;
    height: number;
  };
  children?: Array<ImageDirectoryStructureNode>;
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
  AllSaved = "extension.AllSaved",
}

export enum ExecutedStatus {
  Fulfilled = "fulfilled",
  Rejected = "rejected",
}
