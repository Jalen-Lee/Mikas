import {CSSProperties, ReactNode} from "react";
import {VSCodeTag} from "@vscode/webview-ui-toolkit/react";

export interface ImageViewerProps {
  src: string;
  size: number;
  title: ReactNode;
  dimensions: {
    width: number;
    height: number;
  },
  className?: string;
  style?: CSSProperties
}

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return fileSize.toFixed(2) + ' B';
  } else if (fileSize < 1024 * 1024) {
    const fileSizeInKB = fileSize / 1024;
    return fileSizeInKB.toFixed(2) + ' KB';
  } else if (fileSize < 1024 * 1024 * 1024) {
    const fileSizeInMB = fileSize / (1024 * 1024);
    return fileSizeInMB.toFixed(2) + ' MB';
  } else {
    const fileSizeInGB = fileSize / (1024 * 1024 * 1024);
    return fileSizeInGB.toFixed(2) + ' GB';
  }
}

export default function ImageViewer(props: ImageViewerProps) {
  const {src, size, title, dimensions,className = "", style = {}} = props;
  return <div className={`flex flex-col px-[10px] ${className}`}>
    <header className="flex justify-center py-[20px] items-center">
      <span className="text-[16px]">{title}</span>
    </header>
    <main className="flex flex-1 justify-center items-center">
      <img src={src} alt="img" className="aspect-auto object-contain" style={{
        backgroundSize:"16px 16px",
        backgroundPosition:"0 0, 8px 8px",
        backgroundImage:"linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20)), linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20))"
      }}/>
    </main>
    <footer className="flex justify-center items-center py-[20px] text-[16px] text-white">
      {`${dimensions.width}×${dimensions.height} ${formatFileSize(size)}`}
    </footer>
  </div>
}
