import { useEffect, useState } from "react";

const STEPS = [
  {
    target: '[data-novice-tour="price"]',
    title: "当前价格",
    body: "大字报价区：一眼看清这只股票现在多少钱、今天涨跌多少。",
  },
  {
    target: '[data-novice-tour="brief"]',
    title: "白话总结",
    body: "系统用一句话说明走势强弱和资金动向，无需盯 K 线细节。",
  },
  {
    target: '[data-novice-tour="paper"]',
    title: "模拟练习",
    body: "在这里试试买和卖，不花真钱；先用滑块设定最多愿意亏多少。",
  },
] as const;

interface Props {
  active: boolean;
  onDone: () => void;
  onReachPaper?: () => void;
}

export function NoviceOnboardingTour({
  active,
  onDone,
  onReachPaper,
}: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    if (step === 2) onReachPaper?.();
  }, [active, step, onReachPaper]);

  useEffect(() => {
    if (!active) return;
    const sel = STEPS[step]?.target;
    if (!sel) return;
    const el = document.querySelector(sel);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, step]);

  if (!active) return null;
  const cur = STEPS[step];
  if (!cur) return null;

  const next = () => {
    if (step >= STEPS.length - 1) {
      onDone();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
  <div className="novice-tour-backdrop" role="presentation">
    <div className="novice-tour-card" role="dialog" aria-modal="true">
      <p className="novice-tour-step muted">
        新手上路 {step + 1}/{STEPS.length}
      </p>
      <h3 className="novice-tour-title">{cur.title}</h3>
      <p className="novice-tour-body">{cur.body}</p>
      <div className="novice-tour-actions">
        <button type="button" className="chip" onClick={onDone}>
          跳过
        </button>
        <button type="button" className="chip on" onClick={next}>
          {step >= STEPS.length - 1 ? "完成" : "下一步"}
        </button>
      </div>
    </div>
  </div>
  );
}