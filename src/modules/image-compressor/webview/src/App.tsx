import {HTMLAttributes, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {VSCodeButton} from "@vscode/webview-ui-toolkit/react";
import Splitter, {SplitDirection} from "@devbookhq/splitter";
import "rc-tree/assets/index.css"
import Tree, {BasicDataNode, TreeProps} from 'rc-tree';
import {travelTreeToMap, vscode} from "./utils";
import {
  ArrowsAltOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  FileImageFilled,
  FileImageOutlined,
  FolderFilled,
  FolderOpenFilled,
  Loading3QuartersOutlined,
  SaveOutlined, ShrinkOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import useLatest from "./hooks/useLatest.ts";
import WorkspaceNodeTitle from "./components/workspace-node-title";
import {
  CompressedState,
  ExecutedStatus,
  ExtensionIPCSignal,
  FileType, IPCMessage,
  WebviewIPCSignal,
  WorkspaceNode
} from "../../typing";
import logger from "../../utils/logger.ts";
import ImageViewer from "./components/image-viewer";
import {
  Menu,
  Item,
  Separator,
  Submenu,
  useContextMenu, ItemParams
} from "react-contexify";

import "react-contexify/dist/ReactContexify.css";

interface ItemProps {
  key: string;
}

// Defined just for documentation purpose
type ItemData = any;


const WORKSPACE_CONTEXT_MENU_ID = "workspace-context-menu";

enum WorkspaceContextMenuItemId {
  OpenRawFile = "OpenFile",
  OpenOptimizedFile = "OpenOptimizedFile",
  OpenFileInExplorer = "OpenFileInExplorer"
}

function App() {
  const [workspace, setWorkspace] = useState<Array<WorkspaceNode>>([])
  const workspaceLatest = useLatest(workspace);

  const [workspaceNodeMap, setWorkspaceNodeMap] = useState<Map<string, WorkspaceNode>>(new Map());
  const workspaceNodeMapLatest = useLatest(workspaceNodeMap);

  // 当前查看的文件
  const [currentFile, setCurrentFile] = useState<BasicDataNode & WorkspaceNode>()
  const currentFileLatest = useLatest(currentFile);
  const [currentRightClickFile,setCurrentRightClickFile] = useState<BasicDataNode & WorkspaceNode>()
  // 选中文件列表
  const [selectedFiles, setSelectedFiles] = useState<Array<BasicDataNode & WorkspaceNode>>([]);
  const selectedFilesLatest = useLatest(selectedFiles);


  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const {show: showWorkspaceContextMenu} = useContextMenu({
    id: WORKSPACE_CONTEXT_MENU_ID
  });

  const handleFileSelected: TreeProps["onSelect"] = (_key, payload) => {
    const node = payload.node;
    //@ts-ignore
    if (node.type === FileType.File) {
      //@ts-ignore
      setCurrentFile(node);
      //@ts-ignore
      currentFileLatest.current = node;
    }
  }

  const handleFileChecked: TreeProps["onCheck"] = (_key, payload) => {
    logger.info("handleFileChecked", payload.checkedNodes)
    const newSelectedFiles = payload.checkedNodes.filter(node => {
      // @ts-ignore
      return node.type === FileType.File && node.compressedState !== CompressedState.SAVED && node.compressedState !== CompressedState.PENDING;
    })
    //@ts-ignore
    setSelectedFiles(newSelectedFiles);
    //@ts-ignore
    selectedFilesLatest.current = newSelectedFiles;
  }

  const handleCompressCommand: HTMLAttributes<HTMLDivElement>["onClick"] = (e) => {
    setIsCompressing(true)
    selectedFiles.forEach(file => {
      const node = workspaceNodeMap.get(file.key)
      if (node) {
        file.compressedState = CompressedState.PENDING;
        file.optimizedFsPath = "";
        file.optimizedSize = 0;
        file.optimizedWebviewUri = "";
        file.optimizedDimensions = {width: 0,height:0}
        file.disableCheckbox = true;
        workspaceNodeMap.set(file.key, node)
      }
    })
    vscode.postMessage({
      signal: WebviewIPCSignal.Compress,
      payload: {
        files: selectedFiles.map(file => ({
          key: file.key,
          fsPath: file.fsPath,
          ext: file.parsedInfo.ext
        }))
      }
    })
    const newSelectedFiles = [...selectedFiles];
    const newWorkspace = [...workspace]
    setSelectedFiles(newSelectedFiles)
    selectedFilesLatest.current = newSelectedFiles;
    setWorkspace(newWorkspace)
    workspaceLatest.current = newWorkspace;
  }

  const handleSave: HTMLAttributes<HTMLDivElement>["onClick"] = (e) => {
    setIsSaving(true)
    vscode.postMessage({
      signal: WebviewIPCSignal.Save,
      payload: {
        files: selectedFiles.filter(file =>
          file.compressedState === CompressedState.FULFILLED
        ).map(file => ({
          key: file.key,
          sourceFsPath: file.fsPath,
          tempFsPath: file.optimizedFsPath,
        }))
      }
    })
  }

  const handleInitial = (payload: {
    workspace: WorkspaceNode[]
  }) => {
    setIsWorkspaceLoading(false)
    const dummyHead = {
      key: "$$root",
      title: "dummyHead",
      children: payload.workspace
    }
    const map = travelTreeToMap(dummyHead)
    logger.info("map", map)
    workspaceNodeMapLatest.current = map;
    setWorkspaceNodeMap(map);
    workspaceLatest.current = payload.workspace;
    setWorkspace(payload.workspace);
  }

  const handleCompressed = (payload: {
    status: ExecutedStatus;
    error: string;
    data: {
      key: string;
      sourceFsPath: string;
      destinationFsPath: string;
      optimizedWebviewUri: string;
      optimizedSize: number,
      optimizedDimensions: {
        width: number;
        height: number;
        type: string;
      }
    }
  }) => {
    const {status, error, data} = payload;
    const {key, optimizedSize, optimizedDimensions, optimizedWebviewUri, destinationFsPath} = data;
    const node = workspaceNodeMapLatest.current.get(key)
    const selectedNode = selectedFilesLatest.current.find(file => file.key === key);
    let updatePayload = {};
    logger.info(key, payload)
    if (status === ExecutedStatus.Fulfilled) {
      updatePayload = {
        optimizedSize: optimizedSize,
        optimizedDimensions: optimizedDimensions,
        compressedState: CompressedState.FULFILLED,
        optimizedFsPath: destinationFsPath,
        optimizedWebviewUri: optimizedWebviewUri,
        disableCheckbox: false,
      }
    } else {
      updatePayload = {
        disableCheckbox: false,
        compressedState: CompressedState.REJECTED,
        errorMessage: error
      }
    }
    Object.assign(node, updatePayload);
    Object.assign(selectedNode, updatePayload);
    if (currentFileLatest.current && key === currentFileLatest.current.key) {
      setCurrentFile({
        ...currentFileLatest.current,
        ...node
      })
    }
    workspaceNodeMapLatest.current.set(key, node);
    setSelectedFiles([...selectedFilesLatest.current])
    setWorkspace([...workspaceLatest.current])
  }

  const handleSaved = (payload: {
    status: ExecutedStatus;
    error: string;
    data: Array<{
      status: ExecutedStatus,
      key: string,
      overwrite: boolean,
      error: string
    }>
  }) => {
    setIsSaving(false)
    logger.info("handleSaved", payload)
    const {status, data} = payload;
    if (status === ExecutedStatus.Fulfilled) {
      data.forEach((file) => {
        const node = workspaceNodeMapLatest.current.get(file.key)
        node.compressedState = CompressedState.SAVED
        node.disableCheckbox = true
        workspaceNodeMapLatest.current.set(file.key, node);
      })
    }
    setSelectedFiles([...selectedFiles])
    setWorkspace([...workspaceLatest.current])
  }

  const handleAllCompressed = (payload: {
    status: ExecutedStatus;
    error: string;
    data: Array<{
      key: string;
      sourceFsPath: string;
      destinationFsPath: string;
      optimizedWebviewUri: string;
      optimizedSize: number,
      optimizedDimensions: {
        width: number;
        height: number;
        type: string;
      }
    }>
  }) => {
    setIsCompressing(false)
  }

  const handleAllSaved = () => {
    setIsSaving(false)
  }

  useLayoutEffect(() => {
    window.addEventListener('message', event => {
      const message:IPCMessage = event.data;
      logger.info(message.signal,message)
      const {signal, payload} = message;
      switch (signal) {
        case ExtensionIPCSignal.Init:
          handleInitial(payload)
          break;
        case ExtensionIPCSignal.Compressed:
          handleCompressed(payload)
          break;
        case ExtensionIPCSignal.AllCompressed:
          handleAllCompressed(payload)
          break;
        case ExtensionIPCSignal.Saved:
          handleSaved(payload)
          break;
        case ExtensionIPCSignal.AllSaved:
          handleAllSaved()
          break;
      }
    });
  }, []);

  const availableCompressSelectedFiles = useMemo(() => {
    return selectedFiles.filter(file =>
      file.type === FileType.File && file.compressedState !== CompressedState.PENDING && file.compressedState !== CompressedState.SAVED
    )
  }, [selectedFiles])

  const availableSavedSelectedFiles = useMemo(() => {
    return selectedFiles.filter(file =>
      file.type === FileType.File && file.compressedState === CompressedState.FULFILLED
    )
  }, [selectedFiles])

  logger.info("availableSavedSelectedFiles", availableSavedSelectedFiles)

  const handleShowWorkspaceContextMenu = (e) => {
    setCurrentRightClickFile(e.node)
    showWorkspaceContextMenu({
      event: e.event
    })
  }
  const handleWorkspaceContextMenuItemClick = (payload: ItemParams<ItemProps, ItemData>) => {
    const { id} = payload
    switch (id) {
      case WorkspaceContextMenuItemId.OpenRawFile:
      case WorkspaceContextMenuItemId.OpenOptimizedFile:
        vscode.postMessage({
          signal: WebviewIPCSignal.OpenFile,
          payload:{
            file: id === WorkspaceContextMenuItemId.OpenRawFile ? currentRightClickFile.fsPath : currentRightClickFile.optimizedFsPath
          }
        })
        break;
      case WorkspaceContextMenuItemId.OpenFileInExplorer:
        vscode.postMessage({
          signal: WebviewIPCSignal.OpenFileInExplorer,
          payload:{
            file: currentRightClickFile.fsPath
          }
        })
        break;
    }
  }

  return (
    <>
      <section id="app" className="flex flex-col">
        <main className="h-[calc(100%-48px)] flex-1">
          <Splitter
            direction={SplitDirection.Horizontal}
          >
            <div className="relative h-full pt-[26px]">
              <div className="px-[12px] w-full absolute left-0 top-0 h-[26px] flex justify-between items-center text-[#CCCCCC] bg-[#252526] ">
                <div>EXPLORER</div>
                <div className="flex items-center gap-x-[12px] text-[16px]">
                  <ShrinkOutlined />
                  <ArrowsAltOutlined />
                </div>
              </div>
              <div className="h-full px-[12px] pb-[12px] bg-[#333333] w-full overflow-auto flex flex-col relative">
                {
                  isWorkspaceLoading ? <div className="flex flex-1 h-full items-center justify-center">
                    <Loading3QuartersOutlined spin className="mx-[6px]"/>
                    <p>Workspace resolving...</p>
                  </div> : <>
                    {/*
                // @ts-ignore*/}
                    <Tree
                      titleRender={WorkspaceNodeTitle}
                      switcherIcon={(props) => {
                        if (props.isLeaf) {
                          return null
                        }
                        return props.expanded ? <CaretDownOutlined className="text-[#94a3ad]"/> :
                          <CaretRightOutlined className="text-[#94a3ad]"/>
                      }}
                      className="h-full"
                      onRightClick={handleShowWorkspaceContextMenu}
                      onSelect={handleFileSelected}
                      onCheck={handleFileChecked}
                      icon={props => {
                        // @ts-ignore
                        const {type} = props;
                        if (type === FileType.File) {
                          return <FileImageFilled className="text-emerald-400 text-[18px]]"/>
                        } else if (type === FileType.Directory) {
                          if (props.expanded) {
                            return <FolderOpenFilled className="text-[#94a3ad] text-[18px]"/>
                          } else {
                            return <FolderFilled className="text-[#94a3ad] text-[18px]"/>
                          }
                        }
                      }}
                      autoExpandParent
                      defaultExpandAll
                      // @ts-ignore
                      treeData={workspace}
                      checkable
                    />
                  </>
                }
              </div>
            </div>
            <div className="h-full flex flex-1">
              <div className="flex-1 flex justify-center items-center px-[20px]">
                {
                  currentFile ? <ImageViewer src={currentFile.sourceWebviewUri} size={currentFile.size} title="Raw"
                                             dimensions={currentFile.dimensions} className="flex-1 h-full"/> : null
                }
              </div>
              <div className="h-full w-2 bg-[#252526]"></div>
              <div className="flex-1 flex justify-center items-center px-[20px]">
                {
                  currentFile && currentFile.optimizedWebviewUri &&
                  <ImageViewer src={currentFile.optimizedWebviewUri} dimensions={currentFile.optimizedDimensions}
                               size={currentFile.optimizedSize} title="Optimized" className="flex-1 h-full"/>
                }
              </div>
            </div>
          </Splitter>
        </main>
        <footer
          className="px-[12px] h-[46px] flex justify-between items-center border-t-[1px] border-solid border-[#414141] ">
          <div className="flex gap-x-[12px] text-white">
            {/*<FileImageOutlined className="text-white text-[18px]"/>*/}
            {/*<span>Total: {selectedFiles.length}</span>*/}
            {/*<div className="h-[20px] w-[1px] bg-white"></div>*/}
            <span>Currently selected: {selectedFiles.length}</span>
          </div>
          <div className="flex gap-x-4">
            {/*<VSCodeButton appearance="primary" disabled={selectedFiles.length <= 0}>*/}
            {/*  <div className="h-full flex items-center">*/}
            {/*    <AppstoreOutlined className="text-white mx-[6px]"/>*/}
            {/*    Select All*/}
            {/*  </div>*/}
            {/*</VSCodeButton>*/}
            <VSCodeButton appearance="primary"
                          disabled={isCompressing || (availableCompressSelectedFiles && !availableCompressSelectedFiles.length)}
                          onClick={handleCompressCommand}>
              <div className="h-full flex items-center">
                {
                  isCompressing ? <Loading3QuartersOutlined className="text-white mx-[6px]" spin/> :
                    <ThunderboltOutlined className="text-white mx-[6px]"/>
                }
                Compress
              </div>
            </VSCodeButton>
            <VSCodeButton appearance="primary"
                          disabled={isCompressing || isSaving || (availableSavedSelectedFiles && !availableSavedSelectedFiles.length)}
                          onClick={handleSave}>
              <div className="h-full flex items-center">
                {
                  isSaving ? <Loading3QuartersOutlined className="text-white mx-[6px]" spin/> :
                    <SaveOutlined className="text-white mx-[6px]"/>
                }
                Save
              </div>
            </VSCodeButton>
          </div>
        </footer>
      </section>
      <Menu id={WORKSPACE_CONTEXT_MENU_ID} theme="dark">
        <Submenu label="Open File">
          <Item id={WorkspaceContextMenuItemId.OpenRawFile} onClick={handleWorkspaceContextMenuItemClick}>Raw</Item>
          <Item id={WorkspaceContextMenuItemId.OpenOptimizedFile} disabled={!currentRightClickFile || !currentRightClickFile.optimizedFsPath} onClick={handleWorkspaceContextMenuItemClick}>Optimized</Item>
        </Submenu>
        <Item id={WorkspaceContextMenuItemId.OpenFileInExplorer} onClick={handleWorkspaceContextMenuItemClick}>Open in
          explorer</Item>
      </Menu>
    </>
  )
}

export default App
