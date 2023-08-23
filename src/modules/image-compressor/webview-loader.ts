import * as vscode from "vscode";
import * as fs from "fs";
import * as cheerio from "cheerio";
import * as path from "path";
import { getNonce, getWebviewUri } from './utils';


export type PathSegments = string[];

export interface WebviewLoaderOptions {
  htmlEntry: PathSegments;
  distDir: PathSegments;
}


export default class WebviewLoader {

  private htmlEntry;
  private distDir;
  private vsCodeContext: vscode.ExtensionContext;
  private webview: vscode.Webview;

  constructor(context: vscode.ExtensionContext, webview: vscode.Webview, options: WebviewLoaderOptions) {
    const { htmlEntry, distDir } = options;
    this.htmlEntry = htmlEntry;
    this.distDir = distDir;
    this.vsCodeContext = context;
    this.webview = webview;
  }

  private getHTMLContent() {
    const htmlPath = path.join(this.vsCodeContext.extensionPath, ...this.htmlEntry)
    const textContent = fs.readFileSync(htmlPath, {
      encoding: "utf-8"
    });
    return textContent;
  }

  private transformWithParse() {
    const html = this.getHTMLContent();
    const $ = cheerio.load(html);
    const scripts = $.root().find("script")
    const links = $.root().find("link")
    Array.from(scripts).forEach(el => {
      const src = el.attribs.src.slice(1).split("/")
      el.attribs.nonce = getNonce();
      el.attribs.src = getWebviewUri(this.webview, this.vsCodeContext.extensionUri, ...this.distDir, ...src)
    })
    Array.from(links).forEach(el => {
      const href = el.attribs.href.slice(1).split("/")
      el.attribs.href = getWebviewUri(this.webview, this.vsCodeContext.extensionUri, ...this.distDir, ...href)
    })
    return $.html();
  }

  public get html() {
    return this.transformWithParse();
  }
}
