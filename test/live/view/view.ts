/**
 * 视图层桩（issue #66）。
 * 用例导航、分屏/重叠、背景与反馈面板由界面票（#70）实现。
 */
import type { ControllerState, ViewEvent } from "../contracts/index.js";

export interface View {
  render(state: ControllerState): void;
  /** 页面级快捷键在控件聚焦期间不得触发（issue #60 键盘冲突）。 */
  handleKey(key: string): void;
}

export function createView(
  _root: unknown,
  _dispatch: (event: ViewEvent) => void,
): View {
  throw new Error(
    "not-implemented: 视图由工具界面票（#70）实现；本票仅冻结接口",
  );
}
