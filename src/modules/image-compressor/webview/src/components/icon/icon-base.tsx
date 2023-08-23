import React from "react";
import styles from "./index.module.css";

export interface IconFontProps<T extends string = string> {
  type: T;
}


const IconBase = React.forwardRef<SVGSVGElement, IconFontProps>((props, ref) => {
  const { type, ...restProps } = props;
  return (
    <svg
      width="1em"
      height="1em"
      focusable="false"
      className={styles["svg-icon"]}
      aria-hidden="true"
      {...restProps}
      ref={ref}
      fill="currentColor"
      stroke="currentColor"
    >
      <use xlinkHref={`codicon.svg#${type}`} />
    </svg>
  );
});

IconBase.displayName = "MunaIcon";

export default IconBase;
