import { EventEmitter } from "stream";
import { ExtensionContext } from "vscode";
import { AsyncSeriesBailHook, Hook } from "tapable";

export interface ProcessorOptions {}

class Processor extends EventEmitter {
  context: ExtensionContext;
  hooks: {
    validate: AsyncSeriesBailHook<[boolean], boolean>;
  };

  constructor(context: ExtensionContext, options?: ProcessorOptions) {
    super();
    this.context = context;
    this.hooks = Object.freeze({
      validate: new AsyncSeriesBailHook<[boolean], boolean>(["args1"]),
      jpg: new AsyncSeriesBailHook<[boolean], boolean>(["args1"]),
      png: new AsyncSeriesBailHook<[boolean], boolean>(["args1"]),
      webp: new AsyncSeriesBailHook<[boolean], boolean>(["args1"]),
      svg: new AsyncSeriesBailHook<[boolean], boolean>(["args1"]),
    });
  }
}

export default Processor;
