/**
 * A small tokeniser for Pine Script v6 and MQL5.
 *
 * Neither language has a grammar in the usual highlighters (highlight.js has
 * no Pine; Shiki has no Pine either, and MQL5 only approximately as C++), and
 * pulling in a 300 KB highlighter to approximate two languages is a poor
 * trade. This is a single-pass scanner over the few token classes that
 * actually carry meaning when you are reading generated trading code.
 */

export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "builtin"
  | "preprocessor"
  | "annotation"
  | "operator"
  | "punctuation"
  | "function"
  | "plain";

export interface Token {
  kind: TokenKind;
  value: string;
}

const PINE_KEYWORDS = new Set([
  "if", "else", "for", "while", "switch", "to", "by", "break", "continue",
  "var", "varip", "and", "or", "not", "true", "false", "na", "import", "export",
  "type", "method", "enum", "series", "simple", "const", "input",
  "int", "float", "bool", "string", "color", "line", "label", "box", "table",
  "array", "matrix", "map", "void", "linefill", "polyline", "chart",
]);

/** Pine namespaces whose members are all built-ins. */
const PINE_NAMESPACES = [
  "ta", "math", "str", "array", "matrix", "map", "color", "input", "request",
  "strategy", "syminfo", "timeframe", "barstate", "session", "dayofweek",
  "label", "line", "box", "table", "plot", "shape", "location", "size",
  "display", "format", "scale", "extend", "xloc", "yloc", "alert", "currency",
  "position", "text", "font", "order", "barmerge", "adjustment", "backadjustment",
  "settlement_as_close", "dividends", "splits", "earnings", "chart", "runtime",
  "ticker", "time", "timenow", "math",
];

/** Bare Pine built-ins that are not namespaced. */
const PINE_BUILTINS = new Set([
  "indicator", "strategy", "library", "plot", "plotshape", "plotchar",
  "plotcandle", "plotbar", "plotarrow", "hline", "fill", "bgcolor", "barcolor",
  "alertcondition", "alert", "nz", "na", "fixnan", "open", "high", "low",
  "close", "volume", "hl2", "hlc3", "ohlc4", "hlcc4", "time", "time_close",
  "timenow", "bar_index", "last_bar_index", "last_bar_time", "year", "month",
  "weekofyear", "dayofmonth", "dayofweek", "hour", "minute", "second",
  "max_bars_back", "timestamp", "ticker", "tostring", "tonumber", "int",
  "float", "bool", "string", "color", "runtime",
]);

const MQL5_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break",
  "continue", "return", "goto", "new", "delete", "sizeof", "typename",
  "class", "struct", "union", "enum", "private", "protected", "public",
  "virtual", "const", "static", "extern", "input", "sinput", "group",
  "void", "bool", "char", "uchar", "short", "ushort", "int", "uint", "long",
  "ulong", "float", "double", "string", "datetime", "color", "true", "false",
  "this", "operator", "template", "override", "final", "pack", "NULL",
]);

const MQL5_BUILTINS = new Set([
  "OnInit", "OnDeinit", "OnCalculate", "OnTick", "OnTimer", "OnTrade",
  "OnTradeTransaction", "OnChartEvent", "OnTester", "OnBookEvent",
  "SetIndexBuffer", "PlotIndexSetInteger", "PlotIndexSetDouble",
  "PlotIndexSetString", "IndicatorSetString", "IndicatorSetInteger",
  "IndicatorSetDouble", "ArraySetAsSeries", "ArrayResize", "ArraySize",
  "ArrayInitialize", "ArrayCopy", "ArrayFree", "ArrayMaximum", "ArrayMinimum",
  "CopyBuffer", "CopyRates", "CopyTime", "CopyOpen", "CopyHigh", "CopyLow",
  "CopyClose", "CopyTickVolume", "CopyRealVolume", "CopySpread",
  "SymbolInfoDouble", "SymbolInfoInteger", "SymbolInfoString", "SymbolInfoTick",
  "AccountInfoDouble", "AccountInfoInteger", "AccountInfoString",
  "PositionsTotal", "PositionGetTicket", "PositionSelectByTicket",
  "PositionGetDouble", "PositionGetInteger", "PositionGetString",
  "OrdersTotal", "OrderGetTicket", "OrderSend", "OrderCheck", "OrderCalcMargin",
  "OrderCalcProfit", "HistorySelect", "HistoryDealsTotal", "HistoryDealGetTicket",
  "NormalizeDouble", "MathAbs", "MathMax", "MathMin", "MathRound", "MathFloor",
  "MathCeil", "MathSqrt", "MathPow", "MathLog", "MathExp", "MathMod",
  "Print", "PrintFormat", "Comment", "Alert", "StringFormat", "StringConcatenate",
  "StringSubstr", "StringLen", "StringFind", "StringReplace", "StringToDouble",
  "StringToInteger", "DoubleToString", "IntegerToString", "TimeToString",
  "TimeCurrent", "TimeLocal", "TimeTradeServer", "TimeGMT",
  "iMA", "iRSI", "iATR", "iMACD", "iBands", "iStochastic", "iCCI", "iADX",
  "iCustom", "iTime", "iOpen", "iHigh", "iLow", "iClose", "iVolume", "iBars",
  "iBarShift", "iHighest", "iLowest", "IndicatorRelease", "ChartID",
  "ObjectCreate", "ObjectDelete", "ObjectSetInteger", "ObjectSetDouble",
  "ObjectSetString", "ObjectFind", "EventSetTimer", "EventKillTimer",
  "MQLInfoInteger", "MQLInfoString", "TerminalInfoInteger", "TerminalInfoString",
  "GetLastError", "ResetLastError", "Bars", "BarsCalculated", "Period", "Digits",
  "Point", "CTrade", "CSymbolInfo", "CPositionInfo", "CAccountInfo",
]);

// Multi-character operators must come first: regex alternation is
// leftmost-first, so listing `:` before `:=` would split the assignment
// operator in two.
const PINE_OPERATORS =
  /^(?:=>|:=|==|!=|<=|>=|\+=|-=|\*=|\/=|%=|\?|:|\+|-|\*|\/|%|<|>|=)/;
const MQL5_OPERATORS = /^(?:\+\+|--|<<=|>>=|<<|>>|&&|\|\||==|!=|<=|>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|->|::|\+|-|\*|\/|%|<|>|=|!|&|\||\^|~|\?|:)/;

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

export function tokenize(code: string, language: "pine" | "mql5"): Token[] {
  const tokens: Token[] = [];
  const isPine = language === "pine";
  const keywords = isPine ? PINE_KEYWORDS : MQL5_KEYWORDS;
  const builtins = isPine ? PINE_BUILTINS : MQL5_BUILTINS;
  const operators = isPine ? PINE_OPERATORS : MQL5_OPERATORS;

  let i = 0;
  let pending = "";

  const flush = () => {
    if (pending) {
      tokens.push({ kind: "plain", value: pending });
      pending = "";
    }
  };
  const push = (kind: TokenKind, value: string) => {
    flush();
    tokens.push({ kind, value });
  };

  while (i < code.length) {
    const ch = code[i]!;
    const rest = code.slice(i);

    // Pine's `//@version=6` / `//@strategy_alert_message` annotations.
    if (isPine && rest.startsWith("//@")) {
      const end = code.indexOf("\n", i);
      const line = end === -1 ? rest : code.slice(i, end);
      push("annotation", line);
      i += line.length;
      continue;
    }

    // Line comment.
    if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const line = end === -1 ? rest : code.slice(i, end);
      push("comment", line);
      i += line.length;
      continue;
    }

    // Block comment (MQL5 only; Pine has none).
    if (!isPine && ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const block = end === -1 ? rest : code.slice(i, end + 2);
      push("comment", block);
      i += block.length;
      continue;
    }

    // MQL5 preprocessor directive — highlight the directive, then fall through
    // so the rest of the line still tokenises (strings, numbers).
    if (!isPine && ch === "#" && (i === 0 || code[i - 1] === "\n")) {
      const match = /^#\s*[A-Za-z_]+/.exec(rest);
      if (match) {
        push("preprocessor", match[0]);
        i += match[0].length;
        continue;
      }
    }

    // String / char literal.
    if (ch === '"' || (!isPine && ch === "'")) {
      const quote = ch;
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j += 1;
          break;
        }
        if (code[j] === "\n") break; // unterminated — do not swallow the file
        j += 1;
      }
      push("string", code.slice(i, j));
      i = j;
      continue;
    }

    // Number, including hex, exponents and MQL5 suffixes.
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(code[i + 1] ?? ""))) {
      const match = /^(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[fFuUlL]*/.exec(
        rest,
      );
      if (match) {
        push("number", match[0]);
        i += match[0].length;
        continue;
      }
    }

    // Identifier, possibly dotted (Pine namespaces) or ::-scoped (MQL5).
    if (IDENT_START.test(ch)) {
      let j = i;
      while (j < code.length && IDENT_PART.test(code[j]!)) j += 1;
      const word = code.slice(i, j);

      // Pine: a namespaced call like `ta.rsi` or constant like `color.red`.
      if (isPine && code[j] === "." && PINE_NAMESPACES.includes(word)) {
        let k = j + 1;
        while (k < code.length && IDENT_PART.test(code[k]!)) k += 1;
        push("builtin", code.slice(i, k));
        i = k;
        continue;
      }

      // Is it followed by `(`? Then it reads as a call.
      const after = code.slice(j).match(/^\s*\(/);

      if (keywords.has(word)) push("keyword", word);
      else if (builtins.has(word)) push("builtin", word);
      else if (!isPine && /^[A-Z][A-Z0-9_]{2,}$/.test(word)) push("builtin", word);
      else if (after) push("function", word);
      else pending += word;

      i = j;
      continue;
    }

    // Operators.
    const opMatch = operators.exec(rest);
    if (opMatch) {
      push("operator", opMatch[0]);
      i += opMatch[0].length;
      continue;
    }

    if ("()[]{},;.".includes(ch)) {
      push("punctuation", ch);
      i += 1;
      continue;
    }

    pending += ch;
    i += 1;
  }

  flush();
  return tokens;
}

/** Tailwind classes per token kind. Tuned for the app's dark code panel. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: "text-slate-500 italic",
  string: "text-emerald-300",
  number: "text-amber-300",
  keyword: "text-violet-300",
  builtin: "text-sky-300",
  preprocessor: "text-pink-300",
  annotation: "text-pink-300 font-medium",
  operator: "text-slate-400",
  punctuation: "text-slate-400",
  function: "text-cyan-200",
  plain: "text-slate-200",
};
