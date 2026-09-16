import type { FlavorNote } from "./types";

export const flavorNoteOptions: ReadonlyArray<{ value: FlavorNote; label: string }> = [
  { value: "floral", label: "花香" }, { value: "citrus", label: "柑橘" }, { value: "berry", label: "莓果" },
  { value: "stone_fruit", label: "核果" }, { value: "tropical", label: "熱帶水果" }, { value: "nutty", label: "堅果" },
  { value: "chocolate", label: "巧克力" }, { value: "caramel", label: "焦糖" }, { value: "tea_like", label: "茶感" },
  { value: "spicy", label: "辛香" }, { value: "fermented", label: "發酵感" }, { value: "clean", label: "乾淨" },
  { value: "juicy", label: "多汁" }, { value: "dry", label: "乾澀" }, { value: "bitter", label: "苦" }, { value: "sour", label: "酸澀" },
];
