/**
 * The four code outputs the generator supports.
 *
 * Each target drives three things:
 *  - the system prompts handed to the agent pipeline,
 *  - the syntax highlighter used to render the result,
 *  - the "Where to Paste This" guide shown underneath the code.
 */

export type TargetId =
  | "tv-indicator"
  | "tv-strategy"
  | "mt5-indicator"
  | "mt5-ea";

export type Language = "pine" | "mql5";

export interface PasteStep {
  title: string;
  detail: string;
}

export interface Target {
  id: TargetId;
  /** Short label for the selector card. */
  label: string;
  /** Platform family, used for grouping in the UI. */
  platform: "TradingView" | "MetaTrader 5";
  /** One-line description of what this output does. */
  tagline: string;
  language: Language;
  /** Suggested file name for the download / copy affordance. */
  fileName: string;
  /** Monaco-ish language id shown on the code block chrome. */
  languageLabel: string;
  /** Whether the output places orders (drives the risk-input agent). */
  executes: boolean;
  pasteGuide: {
    heading: string;
    steps: PasteStep[];
    note: string;
  };
}

export const TARGETS: Record<TargetId, Target> = {
  "tv-indicator": {
    id: "tv-indicator",
    label: "TradingView Indicator",
    platform: "TradingView",
    tagline:
      "Pine Script v6 indicator() — plots, signals and alerts drawn on the chart. No orders.",
    language: "pine",
    fileName: "indicator.pine",
    languageLabel: "Pine Script v6",
    executes: false,
    pasteGuide: {
      heading: "Where to paste this (TradingView Indicator)",
      steps: [
        {
          title: "Open the Pine Editor",
          detail:
            "On tradingview.com, open any chart and click “Pine Editor” in the bottom panel.",
        },
        {
          title: "Start a blank indicator",
          detail:
            "Click the “…” menu in the Pine Editor, then “New” → “Blank indicator script”.",
        },
        {
          title: "Replace everything and paste",
          detail:
            "Select all of the placeholder code (Ctrl/Cmd + A) and paste your generated script over it.",
        },
        {
          title: "Save, then add to chart",
          detail:
            "Click “Save” and give it a name, then click “Add to chart”. Your plots and signals appear on the chart.",
        },
        {
          title: "Tune the inputs",
          detail:
            "Open the indicator’s settings (gear icon) to change lengths, thresholds and colours without touching the code.",
        },
      ],
      note:
        "Alerts: right-click the chart → “Add alert”, pick your indicator as the condition, and choose the alert() message you want.",
    },
  },

  "tv-strategy": {
    id: "tv-strategy",
    label: "TradingView Algo Strategy",
    platform: "TradingView",
    tagline:
      "Pine Script v6 strategy() — entries, exits, stop loss, take profit and position sizing.",
    language: "pine",
    fileName: "strategy.pine",
    languageLabel: "Pine Script v6",
    executes: true,
    pasteGuide: {
      heading: "Where to paste this (TradingView Strategy)",
      steps: [
        {
          title: "Open the Pine Editor",
          detail:
            "On tradingview.com, open any chart and click “Pine Editor” in the bottom panel.",
        },
        {
          title: "Start a blank strategy",
          detail:
            "Click the “…” menu in the Pine Editor, then “New” → “Blank strategy script”.",
        },
        {
          title: "Replace everything and paste",
          detail:
            "Select all (Ctrl/Cmd + A) and paste your generated strategy over the placeholder code.",
        },
        {
          title: "Save and add to chart",
          detail:
            "Click “Save”, name it, then “Add to chart”. The Strategy Tester tab opens at the bottom.",
        },
        {
          title: "Set your risk inputs",
          detail:
            "Open settings (gear icon) → “Inputs” to set Stop Loss, Take Profit and position size, and → “Properties” to set your account size, commission and slippage.",
        },
      ],
      note:
        "Strategy Tester results are a simulation on historical data. Past performance does not predict future results — test on your own instrument and timeframe before risking money.",
    },
  },

  "mt5-indicator": {
    id: "mt5-indicator",
    label: "MetaTrader 5 Indicator",
    platform: "MetaTrader 5",
    tagline:
      "MQL5 custom indicator — buffers, plots and signal arrows in a chart or sub-window.",
    language: "mql5",
    fileName: "MyIndicator.mq5",
    languageLabel: "MQL5",
    executes: false,
    pasteGuide: {
      heading: "Where to paste this (MT5 Indicator)",
      steps: [
        {
          title: "Open MetaEditor",
          detail:
            "In MetaTrader 5, press F4 (or Tools → MetaQuotes Language Editor).",
        },
        {
          title: "Create a new custom indicator",
          detail:
            "File → New → “Custom Indicator” → Next. Give it a name, click Next through the parameter screens, then Finish.",
        },
        {
          title: "Replace everything and paste",
          detail:
            "In the new .mq5 file select all (Ctrl + A) and paste your generated code over it.",
        },
        {
          title: "Compile",
          detail:
            "Press F7. You want “0 errors, 0 warnings” in the Errors tab at the bottom.",
        },
        {
          title: "Attach it to a chart",
          detail:
            "Back in MT5, find it under Navigator → Indicators → Custom, then drag it onto a chart.",
        },
      ],
      note:
        "If the indicator does not appear in the Navigator, right-click Navigator → Refresh, or check that the file sits in MQL5/Indicators inside your terminal’s data folder (File → Open Data Folder).",
    },
  },

  "mt5-ea": {
    id: "mt5-ea",
    label: "MetaTrader 5 Algo EA",
    platform: "MetaTrader 5",
    tagline:
      "MQL5 Expert Advisor — places orders with stop loss, take profit and lot sizing.",
    language: "mql5",
    fileName: "MyExpert.mq5",
    languageLabel: "MQL5",
    executes: true,
    pasteGuide: {
      heading: "Where to paste this (MT5 Expert Advisor)",
      steps: [
        {
          title: "Open MetaEditor",
          detail:
            "In MetaTrader 5, press F4 (or Tools → MetaQuotes Language Editor).",
        },
        {
          title: "Create a new Expert Advisor",
          detail:
            "File → New → “Expert Advisor (template)” → Next. Name it, click Next, then Finish.",
        },
        {
          title: "Replace everything and paste",
          detail:
            "Select all (Ctrl + A) in the new .mq5 file and paste your generated EA over it.",
        },
        {
          title: "Compile",
          detail: "Press F7 and check for “0 errors, 0 warnings”.",
        },
        {
          title: "Test on a demo account first",
          detail:
            "In MT5 press Ctrl + R for the Strategy Tester, pick your EA, symbol and timeframe, and run it. Then drag it onto a chart of a DEMO account and tick “Allow Algo Trading”.",
        },
        {
          title: "Set your risk inputs",
          detail:
            "The EA’s Inputs tab holds Stop Loss, Take Profit, Lot Size and risk percent. Set these to match your account before it trades.",
        },
      ],
      note:
        "An EA places real orders. Run it on a demo account until you are satisfied with its behaviour, and never give it more risk per trade than you can afford to lose.",
    },
  },
};

export const TARGET_IDS = Object.keys(TARGETS) as TargetId[];

export function isTargetId(value: unknown): value is TargetId {
  return typeof value === "string" && value in TARGETS;
}

export function getTarget(id: TargetId): Target {
  return TARGETS[id];
}
