import {FallOutlined, SyncOutlined, WarningFilled, CheckCircleFilled} from "@ant-design/icons";
import {CompressedState, WorkspaceNode} from "../../../../typing";
import {
  Tooltip,
} from 'react-tippy';
import 'react-tippy/dist/tippy.css'

export default function WorkspaceNodeTitle(props: WorkspaceNode) {
  const {title, compressedState = CompressedState.IDLE, optimizedSize, size, errorMessage} = props;

  function calcCompressionRatio(originSize: number, optimizeSize: number) {
    return ((originSize - optimizeSize) / originSize * 100).toFixed(0)
  }


  return <div className="flex justify-between items-center flex-1 px-[4px]">
    <div
      className={`flex items-center ${compressedState === CompressedState.REJECTED ? "text-red-500" : ""}`}>{title}</div>
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
        compressedState === CompressedState.REJECTED && <>
            {/*@ts-ignore*/}
            <Tooltip
                title={errorMessage}
                position="bottom"
                trigger="mouseenter"
                arrow={true}
                distance={5}
            >
                <div className="flex items-center">
                    <WarningFilled className="text-red-500 mr-[6px]"/>
                    <span>Error occurred</span>
                </div>
            </Tooltip>
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
