import React from "react";
import styles from "./index.module.css";
import '@vscode/codicons/dist/codicon.css';

export interface IconProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "className"> {
  // 图标名
  type: string;
  // 是否旋转
  spin?: boolean;
  className?: string;
}

export default React.forwardRef<HTMLDivElement, IconProps>(function Icon(props: IconProps, ref) {
  const { type, spin = false, className = "", ...restProps } = props;
  return (
    <div
      className={`${spin ? styles["icon-spin"] : ""} ${className}`}
      ref={ref}
      {...restProps}
    >
      <i className={`codicon ${type}`}></i>
    </div>
  );
});
