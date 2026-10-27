export const brewSheetCopy = {
  dose: "粉量", water: "水量", ratio: "粉水比", temperature: "水溫", grind: "研磨", time: "總時間",
  planned: "配方目標", measured: "實際", steps: "STEPS", elapsed: "已過", next: "接下來",
  drain: "等水位降到粉床", drainAction: "已濾乾，下一段", nextStage: "下一段",
  pause: "暫停", resume: "繼續", settings: "沖煮設定", voice: "語音提示",
  target: "累積目標", noCamera: "未開啟鏡頭", complete: "沖煮完成",
  patterns: { center: "中心定點", spiral: "繞圈", pulse: "分段注水", continuous: "連續注水", immersion: "浸泡" },
  pourMethods: { circle: "繞圈", center: "中心定點", outward: "中心往外繞圈", inward: "外往內", coin: "硬幣大小", excavate: "戳洞", drain: "滴濾" },
} as const;
