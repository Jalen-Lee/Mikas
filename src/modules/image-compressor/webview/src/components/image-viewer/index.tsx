import { CSSProperties, ReactNode } from "react";
import { formatFileSize } from "@utils";

export interface ImageViewerProps {
  src: string;
  size: number;
  title: ReactNode;
  dimensions: {
    width: number;
    height: number;
  };
  className?: string;
  style?: CSSProperties;
}

export default function ImageViewer(props: ImageViewerProps) {
  const { src, size, title, dimensions, className = "", style = {} } = props;
  return (
    <div className={`flex flex-col px-[10px] ${className}`} style={{ ...style }}>
      <header className="flex justify-center py-[20px] items-center">
        <span className="text-[16px]">{title}</span>
      </header>
      <main className="flex flex-1 justify-center items-center">
        <img
          src={src}
          alt="img"
          className="aspect-auto object-contain "
          style={{
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 8px 8px",
            backgroundImage:
              "linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20)), linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20))",
          }}
        />
      </main>
      <footer className="flex justify-center items-center py-[20px] text-[16px] text-white">{`${dimensions.width}×${dimensions.height} ${formatFileSize(size)}`}</footer>
    </div>
  );
}
