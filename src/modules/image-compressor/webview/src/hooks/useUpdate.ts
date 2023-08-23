import { useCallback, useState } from "react";

/**
 * @description 返回一个函数，调用该函数会强制组件重新渲染。
 */
const useUpdate = () => {
  const [, setState] = useState({});

  return useCallback(() => setState({}), []);
};

export default useUpdate;
