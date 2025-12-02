export const CANONICAL_RULES = [
  "合同主体名称必须正确、完整。",
  "若合同已有对方盖章，则合同文本中的对方名称必须与印章印文一致。",
  "对方已盖章且多页或有附件，应加盖骑缝章。",
  "禁止在空白文本或未成文载体上盖对方印章。",
  "对方签章必须齐全，包括对方印章（如需盖章）和对方签名/授权人签字。",
  "合同签署日期必须存在（若盖章则应在邻近标注日期）。",
  "对方主体名称、签名栏信息和印章印文需一致。",
] as const;

export type CanonicalRuleName = typeof CANONICAL_RULES[number];
