import {FallOutlined, SyncOutlined, WarningFilled,CheckCircleFilled} from "@ant-design/icons";
import {CompressedState, WorkspaceNode} from "../../../../typing";

export default function WorkspaceNodeTitle(props: WorkspaceNode) {
  const {title, compressedState= CompressedState.IDLE, optimizedSize, size} = props;

  function calcCompressionRatio(originSize: number, optimizeSize: number) {
    return ((originSize - optimizeSize) / originSize * 100).toFixed(0)
  }


  return <div className="flex justify-between items-center flex-1 px-[4px]">
    <div className={`flex items-center ${compressedState === CompressedState.REJECTED ? "text-red-500":""}`}>{title}</div>
    <div className="flex items-center">
      {
        compressedState === CompressedState.PENDING && <>
          <SyncOutlined spin className="mr-[6px]"/>
          <span>Processing</span>
        </>
      }
      {
        compressedState === CompressedState.FULFILLED && <>
          <FallOutlined className="text-emerald-500 mr-[6px]"/>
          {
            <span>{calcCompressionRatio(size, optimizedSize)}%</span>
          }
        </>
      }
      {
        compressedState === CompressedState.REJECTED &&  <>
          <WarningFilled className="text-red-500 mr-[6px]"/>
          <span>Error occurred</span>
        </>
      }
      {
        compressedState === CompressedState.SAVED && <>
          <CheckCircleFilled className="text-emerald-400 mr-[6px]"/>
        </>
      }
    </div>
  </div>
}
