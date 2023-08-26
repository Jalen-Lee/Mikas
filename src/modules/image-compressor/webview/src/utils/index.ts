import type { WebviewApi } from "vscode-webview";
import { FileType, IPCMessage, WorkspaceNode } from "@typing";
import logger from "@extension/utils/logger.ts";

class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === "function") {
      this.vsCodeApi = acquireVsCodeApi();
    }
  }

  public postMessage(message: IPCMessage) {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message);
    } else {
      logger.info("webview.postMessage", message);
    }
  }

  public getState(): unknown | undefined {
    if (this.vsCodeApi) {
      return this.vsCodeApi.getState();
    } else {
      const state = localStorage.getItem("vscodeState");
      return state ? JSON.parse(state) : undefined;
    }
  }

  public setState<T extends unknown | undefined>(newState: T): T {
    if (this.vsCodeApi) {
      return this.vsCodeApi.setState(newState);
    } else {
      localStorage.setItem("vscodeState", JSON.stringify(newState));
      return newState;
    }
  }
}

export const vscode = new VSCodeAPIWrapper();

export interface WorkspaceParsedInfo {
  total: number;
  totalSize: number;
  reducedSize: number;
  png: number;
  jpg: number;
  webp: number;
  svg: number;
}

export function workspaceParse(root: WorkspaceNode) {
  const nodeMap = new Map<string, WorkspaceNode>();
  const workspaceParsedInfo: WorkspaceParsedInfo = {
    total: 0,
    totalSize: 0,
    reducedSize: 0,
    png: 0,
    jpg: 0,
    webp: 0,
    svg: 0,
  };
  function travel(node: WorkspaceNode) {
    if (!node) return;
    const queue = [node];
    while (queue.length) {
      const n = queue.shift();
      if (n.type === FileType.File) {
        workspaceParsedInfo.total++;
        workspaceParsedInfo.totalSize += n.size;
        if (n.optimizedSize !== 0) {
          workspaceParsedInfo.reducedSize += n.size - n.optimizedSize;
        }
        switch (n.parsedInfo.ext) {
          case ".png":
            workspaceParsedInfo.png++;
            break;
          case ".jpg":
          case ".jpeg":
            workspaceParsedInfo.jpg++;
            break;
          case ".webp":
            workspaceParsedInfo.webp++;
            break;
          case ".svg":
            workspaceParsedInfo.svg++;
            break;
        }
      }
      if (Array.isArray(n.children)) {
        queue.push(...n.children);
      }
      if (!nodeMap.has(n.key)) nodeMap.set(n.key, n);
    }
  }
  travel(root);
  return {
    nodeMap,
    workspaceParsedInfo,
  };
}

export function calcReducedRate(originSize: number, optimizeSize: number) {
  if (!originSize || !optimizeSize) return "0";
  return (((originSize - optimizeSize) / originSize) * 100).toFixed(0);
}

export function formatReducedRate(value: number) {
  return value.toFixed(2);
}

export function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return fileSize.toFixed(2) + " B";
  } else if (fileSize < 1024 * 1024) {
    const fileSizeInKB = fileSize / 1024;
    return fileSizeInKB.toFixed(2) + " KB";
  } else if (fileSize < 1024 * 1024 * 1024) {
    const fileSizeInMB = fileSize / (1024 * 1024);
    return fileSizeInMB.toFixed(2) + " MB";
  } else {
    const fileSizeInGB = fileSize / (1024 * 1024 * 1024);
    return fileSizeInGB.toFixed(2) + " GB";
  }
}
