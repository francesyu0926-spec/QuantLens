interface Props {
  onCollapsePanel: () => void;
}

/** 侧栏顶仅保留收起；品牌固定在顶栏左锚点 */
export function SidebarBrandStrip({ onCollapsePanel }: Props) {
  return (
    <div className="sidebar-strip-bar sidebar-strip-bar--fold-only">
      <button
        type="button"
        className="sidebar-brand-fold"
        title="收起自选 (F 专注)"
        aria-label="收起自选"
        onClick={onCollapsePanel}
      >
        ◂
      </button>
    </div>
  );
}