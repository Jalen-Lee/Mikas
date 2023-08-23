import type { WebviewApi } from "vscode-webview";
import {IPCMessage} from "../../../typing";

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
      console.log(message);
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


export function travelTreeToMap(root: any){
  // BFS
  function travel(node:any){
    if(!node) return
    const queue = [node]
    while(queue.length){
      const n = queue.shift()
      if(Array.isArray(n.children)){
        queue.push(...n.children)
      }
      if(!map.has(n.key)) map.set(n.key,n);
    }
  }
  const map = new Map<string,any>()
  travel(root);
  return map;
}



