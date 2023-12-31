import type { ParsedPath } from "path";

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production";
    mikas_libvips_loaded: boolean;
  }
}

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
    error?: string;
    // svga only
    viewBoxWidth?: number;
    viewBoxHeight?: number;
    fps?: number;
    frames?: number;
    version?: string;
  };
  optimizedDimensions: {
    width: number;
    height: number;
  };
  extra?: Record<string, any>;
  children?: Array<ImageDirectoryStructureNode>;
}

export type WorkspaceNode = DirectoryStructureNode & ImageDirectoryStructureNode;

export enum WebviewIPCSignal {
  CompressSelected = "webview.compressSelected",
  CompressCurrent = "webview.compressCurrent",
  SaveSelected = "webview.saveSelected",
  SaveCurrent = "webview.saveCurrent",
  OpenFile = "webview.openFile",
  OpenFileInExplorer = "webview.openFileInExplorer",
}

export enum ExtensionIPCSignal {
  Init = "extension.init",
  TinypngUsageUpdate = "extension.tinypngUsageUpdate",
  Compressed = "extension.compressed",
  AllCompressed = "extension.allCompressed",
  CurrentCompressed = "extension.currentCompressed",
  Saved = "extension.saved",
  CurrentSaved = "extension.currentSaved",
  AllSaved = "extension.AllSaved",
}

export enum ExecutedStatus {
  Fulfilled = "fulfilled",
  Rejected = "rejected",
}

export declare namespace SvgaParsed {
  interface MovieParams {
    viewBoxWidth: number;
    viewBoxHeight: number;
    fps: number;
    frames: number;
  }
  interface MovieEntity {
    version: string;
    sprites: any[];
    params: MovieParams;
    images: Record<string, Uint8Array>;
    audios: any[];
  }
}
