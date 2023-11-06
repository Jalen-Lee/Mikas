import Processor from "../processor";
import { CONFIG_KEY, CONFIG_SECTION } from "../constants";
import { ExtensionContext } from "vscode";

export default class Plugin {
  protected readonly appName = "mikas";
  protected readonly configSection = CONFIG_SECTION;
  protected readonly configKey = CONFIG_KEY;
  protected context: ExtensionContext;

  constructor(context: ExtensionContext) {
    this.context = context;
  }
}
