import { CSSProperties, ReactNode, useEffect, useRef,memo } from "react";
import { formatFileSize } from "@utils";
import SVGA from 'svgaplayerweb'
import logger from "@extension/utils/logger.ts";
import { ImageDirectoryStructureNode } from "@typing";

export interface ImageViewerProps {
  src: string;
  size: number;
  title: ReactNode;
  dimensions: ImageDirectoryStructureNode["dimensions"];
  ext: string;
  className?: string;
  style?: CSSProperties;
}

function ImageViewer(props: ImageViewerProps) {
  const { src, size, title, dimensions, className = "", style = {}, ext } = props;
  const svgaRendererRef = useRef<HTMLDivElement>(null);
  const svgaPlayerRef = useRef<SVGA.Player>();

  const svgaInit = async ()=>{
    if(svgaPlayerRef.current){
      svgaPlayerRef.current.clear()
      svgaPlayerRef.current = null
    }
    if(svgaRendererRef.current){
      const player = new SVGA.Player(svgaRendererRef.current);
      svgaPlayerRef.current = player;
      const parser = new SVGA.Parser(); // 如果你需要支持 IE6+，那么必须把同样的选择器传给 Parser。
      parser.load(src, (videoItem)=>{
        player.setVideoItem(videoItem);
        player.startAnimation();
      },(err)=>{
        logger.error("svga.load.error",err)
        player.clear()
      })
    }
  }

  useEffect(() => {
    if(ext === ".svga") svgaInit()
    return ()=>{
      svgaPlayerRef.current && svgaPlayerRef.current.clear()
      svgaPlayerRef.current = null
    }
  }, [src]);
  return (
    <div className={`flex flex-col px-[10px] text-white ${className}`} style={{ ...style }}>
      <header className="flex justify-center py-[20px] items-center">
        <span className="text-[16px]">{title}</span>
      </header>
      <main className="flex flex-1 justify-center items-center flex-grow-0">
        {
          ext === ".svga" ? (
            <div
              ref={svgaRendererRef}
              id="svga-renderer"
              // height={500}
              className="overflow-hidden w-[300px] aspect-auto h-[500px]"
              style={{
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 8px 8px",
                backgroundImage:
                  "linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20)), linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20))"
              }}
            ></div>
            ) : (
            <img
              src={src}
              alt="img"
              className="aspect-auto object-contain "
              style={{
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 8px 8px",
                backgroundImage:
                  "linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20)), linear-gradient(45deg, rgb(20, 20, 20) 25%, transparent 25%, transparent 75%, rgb(20, 20, 20) 75%, rgb(20, 20, 20))"
              }}
            />
          )
        }
      </main>
      <footer className="flex justify-center items-center py-[20px] text-[16px] text-white">
        {
          ext === ".svga" ? <p className="flex gap-x-[6px]">
              <span>{`${dimensions.width}×${dimensions.height}`}</span>
              <span>{`SVGA/${dimensions.version}`}</span>
              <span>{`FPS: ${dimensions.fps}`}</span>
              <span>{`Frames: ${dimensions.frames}`}</span>
              <span>{formatFileSize(size)}</span>
            </p> :
            <span>{`${dimensions.width}×${dimensions.height} ${formatFileSize(size)}`}</span>
        }</footer>
    </div>
  );
}

export default memo(ImageViewer,(prevProps, nextProps)=>{
  return prevProps.src === nextProps.src
})
