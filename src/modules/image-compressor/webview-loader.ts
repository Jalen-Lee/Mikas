import * as vscode from "vscode";
import * as fs from "fs";
import * as cheerio from "cheerio";
import * as path from "path";
import * as util from "util";
import { getNonce, getWebviewUri } from "./utils";
import logger from "./utils/logger";

const readFile = util.promisify(fs.readFile);

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
  private errorPage = `
    <!DOCTYPE html>
    <html style="height:100%">
      <head>
        <meta name="viewport" charset="utf-8" content="width=device-width, initial-scale=1, shrink-to-fit=no" >
        <title> 404 Not Found</title>
      </head>
      <body style="color: #cccccc; margin:0;font: normal 14px/20px Arial, Helvetica, sans-serif; height:100%; background-color: #333333;">
        <div style="height:auto; min-height:100%; ">
          <div style="text-align: center; width:800px; margin-left: -400px; position:absolute; top: 30%; left:50%;">
            <h1 style="margin:0; font-size:150px; line-height:150px; font-weight:bold;">404</h1>
            <h2 style="margin-top:20px;font-size: 30px;">Not Found</h2>
            <p>Resource loading failed. Please try again.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  constructor(context: vscode.ExtensionContext, webview: vscode.Webview, options: WebviewLoaderOptions) {
    const { htmlEntry, distDir } = options;
    this.htmlEntry = htmlEntry;
    this.distDir = distDir;
    this.vsCodeContext = context;
    this.webview = webview;
  }

  private getHTMLContent() {
    const htmlPath = path.join(this.vsCodeContext.extensionPath, ...this.htmlEntry);
    return readFile(htmlPath, {
      encoding: "utf-8",
    });
  }

  private async parseWithTransform() {
    return new Promise<string>(async (resolve, reject) => {
      try {
        const html = await this.getHTMLContent();
        const $ = cheerio.load(html);
        const scripts = $.root().find("script");
        const links = $.root().find("link");
        Array.from(scripts).forEach((el) => {
          const src = el.attribs.src.slice(1).split("/");
          el.attribs.nonce = getNonce();
          el.attribs.src = getWebviewUri(this.webview, this.vsCodeContext.extensionUri, ...this.distDir, ...src);
        });
        Array.from(links).forEach((el) => {
          const href = el.attribs.href.slice(1).split("/");
          el.attribs.href = getWebviewUri(this.webview, this.vsCodeContext.extensionUri, ...this.distDir, ...href);
        });
        resolve($.html());
      } catch (e) {
        reject(e);
      }
    });
  }

  public async getHtml() {
    try {
      return await this.parseWithTransform();
    } catch (e) {
      logger.error("getHtml", e);
      return this.errorPage;
    }
  }
}
